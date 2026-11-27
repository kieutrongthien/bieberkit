/**
 * BieberKit
 *
 * @file        packages/data/src/orm/extensions.ts
 * @description Reads and writes the fields of the extensions of an entity: one batched read merged into the rows, and the write of the extension rows next to the target (PLG-06, ADR 0033).
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

import { wrap } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/core';
import { entityOfSchema, extensionsOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';

type Row = Record<string, unknown>;

/** What an extension row has besides its fields: the standard columns and the record that it belongs to. */
const STANDARD = new Set([
  'id',
  'record',
  'tenantId',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'deletedAt',
  'deletedToken',
]);

/** The names of the fields that the extensions of an entity add. Empty when nothing extends it. */
export function extensionFieldsOf(schema: OrmSchema): ReadonlySet<string> {
  return new Set(extensionsOfSchema(schema).flatMap((extension) => extension.fields));
}

export function hasExtensions(schema: OrmSchema): boolean {
  return extensionsOfSchema(schema).length > 0;
}

/** The value that a field has when its record has no extension row yet: its default, or nothing. */
function defaultOf(schema: OrmSchema, name: string): unknown {
  const value = entityOfSchema(schema).fields[name]?.default;
  return typeof value === 'function' ? undefined : (value ?? null);
}

/**
 * Puts the extension fields into the plain rows of a page, with one query for each extension and the whole page. A record that has no
 * extension row shows the defaults of the fields. The tenant filter of the extension entity applies, so a row is merged only for a
 * record that the caller may see.
 */
export async function applyExtensions(em: EntityManager, schema: OrmSchema, rows: readonly Row[]): Promise<void> {
  const stored = extensionsOfSchema(schema);
  if (stored.length === 0 || rows.length === 0) return;
  const ids = rows.map((row) => String(row['id']));
  for (const extension of stored) {
    const found = await em.find(extension.schema, { record: { id: { $in: ids } } }, { disableIdentityMap: true });
    const byRecord = new Map<string, Row>();
    for (const entity of found) {
      const plain: Row = wrap(entity).toObject();
      const record: unknown = plain['record'];
      const id = typeof record === 'object' && record !== null ? String(Reflect.get(record, 'id')) : String(record);
      byRecord.set(id, plain);
    }
    for (const row of rows) {
      const own = byRecord.get(String(row['id']));
      if (own === undefined) {
        for (const name of extension.fields) if (!(name in row)) row[name] = defaultOf(extension.schema, name);
        continue;
      }
      for (const [key, value] of Object.entries(own)) if (!STANDARD.has(key)) row[key] = value;
    }
  }
}

export interface ExtensionWrite {
  readonly schema: OrmSchema;
  /** The body for the extension, as the API sends it, with only the fields of this extension. */
  readonly body: Row;
}

/**
 * Splits the body of a write into what the entity stores and what each of its extensions stores. `base` is what is left for the
 * entity itself. An extension with no field in the body is not in `writes`, so a record gets an extension row only when a field of it is first sent.
 */
export function splitExtensionBody(schema: OrmSchema, body: Row): { base: Row; writes: ExtensionWrite[] } {
  const stored = extensionsOfSchema(schema);
  if (stored.length === 0) return { base: body, writes: [] };
  const base: Row = { ...body };
  const writes: ExtensionWrite[] = [];
  for (const extension of stored) {
    const own: Row = {};
    for (const name of extension.fields) {
      if (name in body) {
        own[name] = body[name];
        delete base[name];
      }
    }
    if (Object.keys(own).length > 0) writes.push({ schema: extension.schema, body: own });
  }
  return { base, writes };
}

/**
 * Writes the extension rows of a record: it creates the row on the first write and changes the fields that are given after. The
 * caller flushes, in the transaction of the target (ADR 0033, decision 5).
 */
export async function writeExtensions(
  em: EntityManager,
  record: Row,
  writes: readonly { readonly schema: OrmSchema; readonly data: Row }[],
): Promise<void> {
  for (const write of writes) {
    const existing = await em.findOne(write.schema, { record: { id: String(record['id']) } });
    if (existing === null) em.create(write.schema, { record, ...write.data });
    else em.assign(existing, write.data);
  }
}
