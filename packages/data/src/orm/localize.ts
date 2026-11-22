/**
 * BieberKit
 *
 * @file        packages/data/src/orm/localize.ts
 * @description Translations of localized fields: writing a row of the translation table and reading with a locale and a fallback (DATA-17).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @copyright   Copyright (c) 2026 Bieber Kieu
 * @license     Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EntityManager } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { entityOfSchema, translationEntityName, translationSchemaOf } from './compile.ts';
import type { OrmSchema } from './compile.ts';

type Row = Record<string, unknown>;

const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** The name of the entity that holds the translations of `entityName`. */
export function translationName(entityName: string): string {
  return translationEntityName(entityName);
}

export function assertLocale(locale: string): void {
  if (!LANGUAGE_TAG.test(locale)) {
    throw dataError(
      'DATA_LOCALE_INVALID',
      400,
      `"${locale}" is not a language tag.`,
      'Use a language tag such as vi, en or pt-BR.',
    );
  }
}

/** The names of the localized fields of an entity. */
export function localizedFields(schema: OrmSchema): string[] {
  return Object.entries(entityOfSchema(schema).fields)
    .filter(([, field]) => field.localized === true)
    .map(([name]) => name);
}

/**
 * Writes the translation of a record into a locale, creating the row or changing the fields that are given. A field that is not
 * localized is refused. The record must be visible to the tenant, like any reference (DATA-20).
 */
export async function setTranslation(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  locale: string,
  values: Row,
): Promise<void> {
  assertLocale(locale);
  const allowed = localizedFields(schema);
  for (const name of Object.keys(values)) {
    if (!allowed.includes(name)) {
      throw dataError(
        'DATA_FIELD_INVALID',
        500,
        `${name} is not a localized field of ${entityOfSchema(schema).name}.`,
        `Only ${allowed.join(', ')} have translations. Mark a field with .localized() to translate it.`,
      );
    }
  }
  const translations = translationSchemaOf(schema);
  if (translations === undefined)
    throw dataError(
      'DATA_FIELD_INVALID',
      500,
      `${entityOfSchema(schema).name} has no translations.`,
      'Mark a field with .localized().',
    );
  const existing = await em.findOne(translations, { record: { id: recordId }, locale });
  if (existing === null) em.create(translations, { record: em.getReference(schema, recordId), locale, ...values });
  else for (const [field, value] of Object.entries(values)) existing[field] = value;
  await em.flush();
}

/**
 * Puts the translated value of `locale` over the default value of each row, field by field: a translation that is missing or
 * null leaves the default. It reads one query for the whole page and changes only the plain rows that it is given.
 */
export async function applyTranslations(
  em: EntityManager,
  schema: OrmSchema,
  rows: readonly Row[],
  locale: string,
): Promise<void> {
  const fields = localizedFields(schema);
  if (fields.length === 0 || rows.length === 0) return;
  const translations = translationSchemaOf(schema);
  if (translations === undefined) return;
  const found = await em.find(
    translations,
    { record: { id: { $in: rows.map((row) => String(row['id'])) } }, locale },
    { disableIdentityMap: true },
  );
  const byRecord = new Map<string, Row>();
  for (const translation of found) {
    const record: unknown = translation['record'];
    byRecord.set(
      typeof record === 'object' && record !== null ? String(Reflect.get(record, 'id')) : String(record),
      translation,
    );
  }
  for (const row of rows) {
    const translation = byRecord.get(String(row['id']));
    if (translation === undefined) continue;
    for (const field of fields) {
      const value = translation[field];
      if (value !== null && value !== undefined && field in row) row[field] = value;
    }
  }
}
