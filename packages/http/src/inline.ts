/**
 * BieberKit
 *
 * @file        packages/http/src/inline.ts
 * @description The inline collections of an entity (`f.hasMany(...).inline()`): their schemas in the body and the answer of a record, how they are read, and how they are saved in the transaction of the record (MOD-09, UI-11).
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

import { toJsonSchema } from '@bieberkit/data/schema';
import type { EntityDef, JsonSchema } from '@bieberkit/data/schema';
import {
  childEntities,
  childRows,
  entityOfSchema,
  MAX_INLINE_ROWS,
  softDelete,
  toApiRow,
  toOrmData,
} from '@bieberkit/data/orm';
import type { OrmSchema, runInUnitOfWork } from '@bieberkit/data/orm';
import { ValidationFailed } from './problem.ts';

type Row = Record<string, unknown>;
type EntityManager = Parameters<Parameters<typeof runInUnitOfWork>[1]>[0];

/** One inline collection: the field of the record, the entity of its lines, and the relation that ties a line to its record. */
export interface InlineLink {
  readonly name: string;
  readonly child: EntityDef<string>;
  readonly schema: OrmSchema;
  /** The name of the relation of a line to its record, and the key that the API gives it (`accountId`). */
  readonly back: string;
  readonly backKey: string;
  readonly permissions: Readonly<Record<'create' | 'update' | 'delete', string>>;
}

/**
 * The inline collections of `def`. A collection whose lines are not among the compiled schemas, or whose line entity has no single
 * relation back to the record, is left out: the compiler has already refused the second case, so this only keeps a partial project from
 * failing here instead of there.
 */
export function inlineLinksOf(
  def: EntityDef<string>,
  schemas: readonly OrmSchema[],
  permissionOf: (child: EntityDef<string>, action: 'create' | 'update' | 'delete') => string,
): readonly InlineLink[] {
  const links: InlineLink[] = [];
  for (const [name, field] of Object.entries(def.fields)) {
    if (field.kind !== 'hasMany' || field.inline !== true || field.target === undefined) continue;
    const child = field.target();
    const schema = schemas.find((candidate) => entityOfSchema(candidate).name === child.name);
    const backs = Object.entries(child.fields).filter(
      ([, candidate]) => candidate.kind === 'belongsTo' && candidate.target?.().name === def.name,
    );
    const back = backs.length === 1 ? backs[0]?.[0] : undefined;
    if (schema === undefined || back === undefined) continue;
    links.push({
      name,
      child,
      schema,
      back,
      backKey: `${back}Id`,
      permissions: {
        create: permissionOf(child, 'create'),
        update: permissionOf(child, 'update'),
        delete: permissionOf(child, 'delete'),
      },
    });
  }
  return links;
}

const recordOf = (value: unknown): Record<string, JsonSchema> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

/** The schema of one line, to write it (the relation to the record is the record's, and `id` names a line that is kept) or to read it. */
function lineSchema(link: InlineLink, mode: 'write' | 'read'): JsonSchema {
  const { $schema: _schema, $id: _id, ...shape } = toJsonSchema(link.child, mode === 'write' ? 'create' : 'read');
  const properties: Record<string, JsonSchema> = { ...recordOf(shape['properties']) };
  // An answer names the record that a line belongs to; a body does not, because the line goes where the record is.
  if (mode === 'read') return { ...shape, properties, required: [] };
  delete properties[link.backKey];
  const required = Array.isArray(shape['required']) ? shape['required'].filter((key) => key !== link.backKey) : [];
  return { ...shape, properties: { id: { type: 'string', format: 'uuid' }, ...properties }, required };
}

/** `schema` (the body or the answer of a record) with the inline collections added. */
export function withInline(schema: JsonSchema, links: readonly InlineLink[], mode: 'write' | 'read'): JsonSchema {
  if (links.length === 0) return schema;
  const added = Object.fromEntries(
    links.map((link) => [
      link.name,
      { type: 'array', ...(mode === 'write' ? { maxItems: MAX_INLINE_ROWS } : {}), items: lineSchema(link, mode) },
    ]),
  );
  return { ...schema, properties: { ...recordOf(schema['properties']), ...added } };
}

/** The body without the inline collections, and the collections that it carried. */
export function takeInline(links: readonly InlineLink[], body: Row): { rest: Row; lines: Map<InlineLink, Row[]> } {
  const rest: Row = { ...body };
  const lines = new Map<InlineLink, Row[]>();
  for (const link of links) {
    const given = rest[link.name];
    delete rest[link.name];
    if (Array.isArray(given))
      lines.set(
        link,
        given.map((item): Row => (typeof item === 'object' && item !== null ? { ...item } : {})),
      );
  }
  return { rest, lines };
}

/** The lines of a record, by the name of their collection, as the API gives them. */
export async function readInline(
  em: EntityManager,
  links: readonly InlineLink[],
  id: string,
): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const link of links) {
    // The relation back to the record is the record itself, so it is said here and not read from a composite key.
    out[link.name] = (await childRows(em, link.schema, link.back, id)).map((row) => ({
      ...toApiRow(link.schema, row),
      [link.backKey]: id,
    }));
  }
  return out;
}

/**
 * Saves the lines of a record in the transaction that saves the record. A line with an `id` is one that the record has and is changed, a
 * line without is made, and a line of the record that is not in the list is removed (`create` has none to remove). `allow` is asked for
 * each kind of change that is made, with the permission of the line entity, and refuses by throwing.
 */
export async function writeInline(
  em: EntityManager,
  link: InlineLink,
  parent: Row,
  items: readonly Row[],
  mode: 'create' | 'update',
  allow: (permission: string) => Promise<void>,
): Promise<void> {
  if (items.length > MAX_INLINE_ROWS) {
    throw new ValidationFailed([
      { path: `body.${link.name}`, keyword: 'maxItems', message: `has more than ${String(MAX_INLINE_ROWS)} lines` },
    ]);
  }
  const existing = mode === 'update' ? await childEntities(em, link.schema, link.back, String(parent['id'])) : [];
  const byId = new Map(existing.map((row) => [String(row['id']), row]));
  const kept = new Set<string>();
  for (const item of items) {
    const { id, ...data } = item;
    const values = toOrmData(link.schema, data, mode);
    if (typeof id === 'string') {
      const row = byId.get(id);
      if (row === undefined) {
        throw new ValidationFailed([
          { path: `body.${link.name}`, keyword: 'id', message: `${id} is not a line of this record` },
        ]);
      }
      await allow(link.permissions.update);
      em.assign(row, Object.keys(values).length === 0 ? { updatedAt: new Date() } : values);
      kept.add(id);
    } else {
      await allow(link.permissions.create);
      em.create(link.schema, { ...values, [link.back]: parent });
    }
  }
  for (const row of existing) {
    if (kept.has(String(row['id']))) continue;
    await allow(link.permissions.delete);
    if (link.child.softDelete) softDelete(em, row);
    else em.remove(row);
  }
}
