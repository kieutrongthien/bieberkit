/**
 * BieberKit
 *
 * @file        packages/data/src/orm/query.ts
 * @description List pages: keyset cursor, total on request, the index rule, filters on compared fields and the read only path (DATA-06, DATA-07, DATA-10, DATA-11, DATA-21).
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
import { QueryOrder, ReferenceKind, wrap } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { decodeCursor, encodeCursor, pageSize } from '../query/page.ts';
import type { CursorValue } from '../query/page.ts';
import { fold } from '../text/fold.ts';
import { entityOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { applyTranslations, assertLocale } from './localize.ts';

type Row = Record<string, unknown>;

export interface SortOption {
  readonly field: string;
  readonly direction?: 'asc' | 'desc';
}

export interface ListOptions {
  /** Filters by property name. A compared field is looked up in its shadow column with the folded value. */
  readonly where?: Row;
  /** Defaults to `id` ascending. `id` is always added last, so the order is total. */
  readonly sort?: readonly SortOption[];
  readonly limit?: unknown;
  readonly cursor?: string;
  readonly withTotal?: boolean;
  /** The properties to return. `id` is always returned. */
  readonly select?: readonly string[];
  /** Relations to load, one batched query each. */
  readonly populate?: readonly string[];
  /** The translation to prefer. A field without one keeps its default value. */
  readonly locale?: string;
}

export interface Page {
  readonly rows: Row[];
  readonly limit: number;
  readonly nextCursor: string | null;
  readonly total?: number;
}

/** What a client may name in a filter or a sort, and which property that really is. */
interface Known {
  readonly name: string;
  /** The property that the query uses: the shadow column for a compared field. */
  readonly lookup: string;
  readonly indexed: boolean;
  readonly sortable: boolean;
  readonly compared: boolean;
  readonly text: boolean;
  readonly instant: boolean;
}

const OPERATORS: readonly string[] = ['$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte', '$like'];
const COMPARED_OPERATORS: readonly string[] = ['$eq', '$ne', '$in', '$nin', '$like'];
const FILTERABLE_KINDS: readonly string[] = [
  'string',
  'email',
  'oneOf',
  'int',
  'boolean',
  'date',
  'dateTime',
  'sequence',
  'state',
  'custom',
  'belongsTo',
];

function queryInvalid(message: string, fix: string): never {
  throw dataError('DATA_QUERY_INVALID', 400, message, fix);
}

function isPlain(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function knownFields(schema: OrmSchema): Map<string, Known> {
  const def = entityOfSchema(schema);
  const known = new Map<string, Known>();
  const standard = (name: string, instant: boolean): void =>
    void known.set(name, { name, lookup: name, indexed: true, sortable: true, compared: false, text: false, instant });
  standard('id', false);
  standard('createdAt', true);
  standard('updatedAt', true);
  for (const [name, field] of Object.entries(def.fields)) {
    if (['id', 'createdAt', 'updatedAt', 'hasOne', 'hasMany'].includes(field.kind)) continue;
    const filterable = FILTERABLE_KINDS.includes(field.kind) && (field.computed === undefined || field.computed.stored);
    const compared =
      (field.kind === 'string' || field.kind === 'email') && field.compare !== undefined && field.compare !== 'exact';
    known.set(name, {
      name,
      lookup: compared ? `${name}Cmp` : name,
      indexed: filterable && (field.index === true || field.unique === true),
      sortable: field.optional !== true,
      compared,
      text: field.kind === 'string' || field.kind === 'email',
      instant: field.kind === 'dateTime',
    });
  }
  return known;
}

/** The properties that a client may filter or sort by: the standard ones and the fields that declare an index (DATA-07). */
export function queryableFields(schema: OrmSchema): readonly string[] {
  return [...knownFields(schema).values()].filter((field) => field.indexed).map((field) => field.name);
}

function lookupOf(known: ReadonlyMap<string, Known>, name: string): Known {
  const field = known.get(name);
  if (field === undefined)
    return queryInvalid(`${name} is not a field of this entity.`, 'Use the name of a field of the entity.');
  if (!field.indexed) {
    throw dataError(
      'DATA_FIELD_NOT_INDEXED',
      400,
      `${name} cannot be used to filter or sort, because it has no index.`,
      `Declare the field with .index() or .unique(), so the query stays fast (DATA-07).`,
    );
  }
  return field;
}

function toInstant(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return queryInvalid('A date in the query is not valid.', 'Write an instant as ISO 8601 text in UTC.');
  return date;
}

function foldedText(field: Known, value: unknown, mode: 'ci' | 'ci_ai'): string {
  if (typeof value !== 'string')
    return queryInvalid(`${field.name} is compared as text, and the value is not text.`, 'Give text.');
  return fold(mode, value);
}

function valueOf(field: Known, mode: 'ci' | 'ci_ai' | undefined, value: unknown): unknown {
  if (field.compared && mode !== undefined) {
    if (isPlain(value)) {
      const out: Row = {};
      for (const [operator, operand] of Object.entries(value)) {
        if (!COMPARED_OPERATORS.includes(operator)) {
          return queryInvalid(
            `${operator} cannot be used on ${field.name}, which is compared as folded text.`,
            `Use ${COMPARED_OPERATORS.join(', ')}.`,
          );
        }
        out[operator] = Array.isArray(operand)
          ? operand.map((item) => foldedText(field, item, mode))
          : foldedText(field, operand, mode);
      }
      return out;
    }
    return foldedText(field, value, mode);
  }
  if (isPlain(value)) {
    const out: Row = {};
    for (const [operator, operand] of Object.entries(value)) {
      if (!OPERATORS.includes(operator))
        return queryInvalid(`${operator} is not an operator.`, `Use ${OPERATORS.join(', ')}.`);
      if (operator === '$like' && !field.text)
        return queryInvalid(`$like needs a text field, and ${field.name} is not.`, 'Use $eq or $in.');
      out[operator] = field.instant ? (Array.isArray(operand) ? operand.map(toInstant) : toInstant(operand)) : operand;
    }
    return out;
  }
  return field.instant ? toInstant(value) : value;
}

/** Checks every field of a filter against the index rule, and turns compared fields into lookups on their shadow column. */
function translateWhere(schema: OrmSchema, known: ReadonlyMap<string, Known>, where: unknown): Row {
  if (!isPlain(where)) return queryInvalid('A filter must be an object.', 'Write the filter as { field: value }.');
  const def = entityOfSchema(schema);
  const out: Row = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === '$and' || key === '$or') {
      if (!Array.isArray(value))
        return queryInvalid(`${key} needs a list of filters.`, 'Write { $or: [{ ... }, { ... }] }.');
      out[key] = value.map((item) => translateWhere(schema, known, item));
    } else if (key === '$not') out[key] = translateWhere(schema, known, value);
    else if (key.startsWith('$'))
      return queryInvalid(`${key} is not an operator of a filter.`, 'Use $and, $or or $not at the top.');
    else {
      const field = lookupOf(known, key);
      const mode = def.fields[key]?.compare ?? 'exact';
      out[field.lookup] = valueOf(field, mode === 'exact' ? undefined : mode, value);
    }
  }
  return out;
}

interface Ordered {
  readonly field: Known;
  readonly direction: 'asc' | 'desc';
}

function orderOf(known: ReadonlyMap<string, Known>, sort: readonly SortOption[] | undefined): Ordered[] {
  const ordered: Ordered[] = [];
  for (const option of sort ?? []) {
    const field = lookupOf(known, option.field);
    if (!field.sortable) {
      throw dataError(
        'DATA_SORT_INVALID',
        400,
        `${option.field} may be empty, so it cannot be sorted by.`,
        'Sort by a field that is always set, such as a required field or createdAt.',
      );
    }
    const direction = option.direction ?? 'asc';
    if (direction !== 'asc' && direction !== 'desc')
      return queryInvalid('A sort direction is asc or desc.', 'Use asc or desc.');
    if (ordered.some((item) => item.field.name === option.field))
      return queryInvalid(`${option.field} is in the sort twice.`, 'Name each sort field once.');
    ordered.push({ field, direction });
  }
  if (!ordered.some((item) => item.field.name === 'id'))
    ordered.push({ field: lookupOf(known, 'id'), direction: 'asc' });
  return ordered;
}

function cursorValue(value: unknown): CursorValue {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
    return value;
  return JSON.stringify(value);
}

/** The rows after the cursor, for a sort over several fields: (a > x) or (a = x and b > y) or (a = x and b = y and id > z). */
function afterCursor(order: readonly Ordered[], values: readonly CursorValue[]): Row {
  const read = (index: number): unknown => {
    const value = values[index];
    return order[index]?.field.instant === true && typeof value === 'string' ? new Date(value) : value;
  };
  return {
    $or: order.map((item, index) => ({
      $and: [
        ...order.slice(0, index).map((before, position) => ({ [before.field.lookup]: read(position) })),
        { [item.field.lookup]: { [item.direction === 'asc' ? '$gt' : '$lt']: read(index) } },
      ],
    })),
  };
}

/**
 * One page of rows as plain objects. It filters and sorts only by fields with an index, pages with a keyset cursor, counts the total
 * only when asked, loads relations with one query each, and reads without tracking the rows (DATA-06, DATA-07, DATA-10, DATA-11).
 */
export async function listPage(em: EntityManager, schema: OrmSchema, options: ListOptions = {}): Promise<Page> {
  const known = knownFields(schema);
  const meta = em.getMetadata().get(schema);
  const limit = pageSize(options.limit);
  const where = options.where === undefined ? {} : translateWhere(schema, known, options.where);
  const order = orderOf(known, options.sort);
  const signature = order.map((item) => `${item.field.name}:${item.direction}`).join(',');

  const conditions: Row[] = Object.keys(where).length > 0 ? [where] : [];
  if (options.cursor !== undefined) {
    const [seen, ...values] = decodeCursor(options.cursor);
    if (seen !== signature || values.length !== order.length) {
      throw dataError(
        'DATA_CURSOR_INVALID',
        400,
        'The cursor is not valid for this sort.',
        'Start again from the first page.',
      );
    }
    conditions.push(afterCursor(order, values));
  }

  for (const name of [...(options.select ?? []), ...(options.populate ?? [])]) {
    if (!(name in meta.properties))
      queryInvalid(`${name} is not a property of this entity.`, 'Use the name of a property.');
  }
  for (const name of options.populate ?? []) {
    // The metadata is keyed by property name, which TypeScript sees as a key of an enum of the ORM.
    // oxlint-disable-next-line typescript/no-unsafe-enum-assignment
    const kind = meta.properties[name]?.kind;
    if (kind === ReferenceKind.SCALAR) queryInvalid(`${name} is not a relation.`, 'Populate a relation.');
  }
  if (options.locale !== undefined) assertLocale(options.locale);

  const fields =
    options.select === undefined
      ? undefined
      : [...new Set([...options.select, 'id', ...order.map((item) => item.field.lookup)])];
  const entities = await em.find<Row>(schema, conditions.length === 0 ? {} : { $and: conditions }, {
    orderBy: order.map((item) => ({
      [item.field.lookup]: item.direction === 'asc' ? QueryOrder.ASC : QueryOrder.DESC,
    })),
    limit: limit + 1,
    disableIdentityMap: true,
    connectionType: 'read',
    // One query per relation (DATA-10), whatever the default of the ORM is, so a page never joins a collection into its own rows.
    strategy: 'select-in',
    // The names were checked against the metadata above, and MikroORM types them as paths of a class that does not exist here.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    ...(options.populate === undefined ? {} : { populate: [...options.populate] as never }),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    ...(fields === undefined ? {} : { fields: fields as never }),
  });

  const shown = entities.slice(0, limit);
  const last = shown.at(-1);
  const nextCursor =
    entities.length > limit && last !== undefined
      ? encodeCursor([signature, ...order.map((item) => cursorValue(last[item.field.lookup]))])
      : null;
  const wanted = options.select === undefined ? undefined : new Set([...options.select, 'id']);
  const rows = shown.map((entity) => {
    const plain: Row = wrap(entity).toObject();
    return wanted === undefined ? plain : Object.fromEntries(Object.entries(plain).filter(([key]) => wanted.has(key)));
  });
  if (options.locale !== undefined) await applyTranslations(em, schema, rows, options.locale);

  const total = options.withTotal === true ? await em.count(schema, where, { connectionType: 'read' }) : undefined;
  return { rows, limit, nextCursor, ...(total === undefined ? {} : { total }) };
}
