/**
 * BieberKit
 *
 * @file        packages/admin-core/src/screens.ts
 * @description What a generic screen needs from the metadata of an entity: the columns of the list, the fields of the form, the label, and the body of a save (UI-03, UI-15).
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

import type { MetaEntity, MetaField, Row } from './types.ts';

/** The label of an entity in a language, then in English, then its name. */
export function labelOf(entity: MetaEntity, language: string): string {
  return entity.label[language] ?? entity.label['en'] ?? entity.name.split('.').at(-1) ?? entity.name;
}

const byKey = (entity: MetaEntity): ReadonlyMap<string, MetaField> =>
  new Map(entity.fields.map((field) => [field.key, field]));

/** The columns of the list, in the order of `admin.list`, and every field that is not secret when the entity names none. */
export function columnsOf(entity: MetaEntity): readonly MetaField[] {
  const known = byKey(entity);
  if (entity.list.length > 0) return entity.list.flatMap((key) => known.get(key) ?? []);
  return entity.fields.filter((field) => field.pii !== true && field.encrypted !== true).slice(0, 6);
}

/** The fields that a person fills in, in the order of the form: not the ones the server fills in (`readOnly`). */
export function formFieldsOf(entity: MetaEntity): readonly MetaField[] {
  const known = byKey(entity);
  const keys = entity.form.length > 0 ? entity.form : entity.fields.map((field) => field.key);
  return keys.flatMap((key) => {
    const field = known.get(key);
    return field === undefined || field.readOnly ? [] : [field];
  });
}

/**
 * The keys that the list asks for (`fields=`), so that a wide entity stays fast (UI-15). The API sends `id` and `version` with any
 * selection and refuses them in it, so they are not named here.
 */
export function listFields(entity: MetaEntity): readonly string[] {
  return columnsOf(entity)
    .map((field) => field.key)
    .filter((key) => key !== 'id' && key !== 'version');
}

/** The form starts from the row, or from the defaults of the fields. */
export function initialValues(entity: MetaEntity, row?: Row): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of formFieldsOf(entity)) values[field.key] = row === undefined ? field.default : row[field.key];
  return values;
}

/**
 * The body of a save: the fields of the form that have a value. An empty text of an optional field is left out of a create and sent as
 * `null` in an update, so that a person can clear it.
 */
export function bodyOf(entity: MetaEntity, values: Readonly<Record<string, unknown>>, updating: boolean): Row {
  const body: Record<string, unknown> = {};
  for (const field of formFieldsOf(entity)) {
    const value = values[field.key];
    const empty = value === undefined || value === null || value === '';
    if (empty) {
      if (updating && !field.required) body[field.key] = null;
      continue;
    }
    body[field.key] = value;
  }
  return body;
}

/** Whether the entity has the operation and the user has the permission for it. */
export function allows(entity: MetaEntity, action: 'create' | 'update' | 'delete'): boolean {
  return entity.operations[action] && entity.can[action];
}
