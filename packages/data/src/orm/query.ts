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

import { readConnection } from './read-your-writes.ts';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder, ReferenceKind, wrap } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { decodeCursor, encodeCursor, pageSize } from '../query/page.ts';
import type { CursorValue } from '../query/page.ts';
import { fold } from '../text/fold.ts';
import { entityOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { applyExtensions, extensionFieldsOf } from './extensions.ts';
import { applyTranslations, assertLocale } from './localize.ts';

type Row = Record<string, unknown>;

const MAX_OFFSET = 1_000_000;

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
  /** Rows to skip, for a page that is named by its number. Not together with `cursor`. At most 1 000 000 (use a cursor beyond a few thousand). */
  readonly offset?: number;
  readonly withTotal?: boolean;
  /** The properties to return. `id` is always returned. */
  readonly select?: readonly string[];
  /** Relations to load, one batched query each. */
  readonly populate?: readonly string[];
  /** The translation to prefer. A field without one keeps its default value. */
  readonly locale?: string;
  /** The rows that the caller may see, chosen by code and not by the client (AUTHZ-02). It is applied next to the tenant filter and `where`. */
  readonly scope?: Row;
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
  /** Whether a filter or a scope may name it at all, with or without an index. */
  readonly filterable: boolean;
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

export function knownFields(schema: OrmSchema): Map<string, Known> {
  const def = entityOfSchema(schema);
  const known = new Map<string, Known>();
  const standard = (name: string, instant: boolean): void =>
    void known.set(name, {
      name,
      lookup: name,
      indexed: true,
      filterable: true,
      sortable: true,
      compared: false,
      text: false,
      instant,
    });
  standard('id', false);
  standard('createdAt', true);
  standard('updatedAt', true);
  // A field of an extension is in another table: it is read and written with the record, and is not queried yet (ADR 0033).
  const outside = extensionFieldsOf(schema);
  for (const [name, field] of Object.entries(def.fields)) {
    if (['id', 'createdAt', 'updatedAt', 'hasOne', 'hasMany'].includes(field.kind) || outside.has(name)) continue;
    const filterable =
      FILTERABLE_KINDS.includes(field.kind) &&
      field.encrypted !== true &&
      (field.computed === undefined || field.computed.stored);
    const compared =
      (field.kind === 'string' || field.kind === 'email') && field.compare !== undefined && field.compare !== 'exact';
    known.set(name, {
      name,
      lookup: compared ? `${name}Cmp` : name,
      indexed: filterable && (field.index === true || field.unique === true),
      filterable,
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
        // An empty value has no folded text: `null` stays `null`, so a filter can ask for the rows that have none.
        out[operator] =
          operand === null
            ? null
            : Array.isArray(operand)
              ? operand.map((item) => foldedText(field, item, mode))
              : foldedText(field, operand, mode);
      }
      return out;
    }
    return value === null ? null : foldedText(field, value, mode);
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
export function translateWhere(schema: OrmSchema, known: ReadonlyMap<string, Known>, where: unknown): Row {
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

const SCOPE_OPERATORS: readonly string[] = ['$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte'];

/**
 * Turns the scope that code gives a read (the conditions of a role, translated by `@bieberkit/auth`) into a `where`. The code
 * chooses a scope, a client does not, so a field needs no index. The language stays small and fails closed: the operators of
 * `SCOPE_OPERATORS`, `null`, and an `$or` of scopes at the top, on properties of the entity (ADR 0013).
 */
export function translateScope(
  schema: OrmSchema,
  known: ReadonlyMap<string, Known>,
  scope: unknown,
  nested = false,
): Row {
  if (!isPlain(scope)) return queryInvalid('A scope must be an object.', 'Write the scope as { field: value }.');
  const def = entityOfSchema(schema);
  const out: Row = {};
  for (const [key, value] of Object.entries(scope)) {
    if (key === '$or') {
      if (nested || !Array.isArray(value) || value.length === 0) {
        return queryInvalid('$or needs a list of scopes, and only at the top.', 'Write { $or: [{ ... }, { ... }] }.');
      }
      out[key] = value.map((item) => translateScope(schema, known, item, true));
      continue;
    }
    const field = key.startsWith('$') ? undefined : known.get(key);
    if (field === undefined || !field.filterable)
      return queryInvalid(
        `${key} cannot be used in a scope.`,
        'Name a field of the entity, with no path and no operator.',
      );
    if (isPlain(value)) {
      for (const operator of Object.keys(value)) {
        if (!SCOPE_OPERATORS.includes(operator))
          return queryInvalid(`${operator} is not an operator of a scope.`, `Use ${SCOPE_OPERATORS.join(', ')}.`);
      }
    }
    const mode = def.fields[key]?.compare ?? 'exact';
    out[field.lookup] = valueOf(field, mode === 'exact' ? undefined : mode, value);
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
  if (options.offset !== undefined) {
    if (!Number.isInteger(options.offset) || options.offset < 0 || options.offset > MAX_OFFSET) {
      throw dataError(
        'DATA_PAGE_LIMIT',
        400,
        `The offset must be a whole number from 0 to ${MAX_OFFSET}.`,
        'Use a cursor to go deeper.',
      );
    }
    if (options.cursor !== undefined)
      return queryInvalid('An offset and a cursor cannot be used together.', 'Use a page number or a cursor.');
  }
  const where = options.where === undefined ? {} : translateWhere(schema, known, options.where);
  const scope = options.scope === undefined ? {} : translateScope(schema, known, options.scope);
  const base: Row = Object.keys(scope).length === 0 ? where : { $and: [where, scope] };
  const order = orderOf(known, options.sort);
  const signature = order.map((item) => `${item.field.name}:${item.direction}`).join(',');

  const conditions: Row[] = Object.keys(base).length > 0 ? [base] : [];
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

  const outside = extensionFieldsOf(schema);
  // The extension fields that are asked for are read from their own table, after the page.
  const selected = options.select?.filter((name) => !outside.has(name));
  for (const name of [...(selected ?? []), ...(options.populate ?? [])]) {
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

  // A relation that is populated is read whole (`org.*`): with only a list of fields, it would come with its key and nothing else, and the
  // included row would not be a row of its entity.
  const fields =
    selected === undefined
      ? undefined
      : [
          ...new Set([
            ...selected,
            'id',
            ...order.map((item) => item.field.lookup),
            ...(options.populate ?? []).map((name) => `${name}.*`),
          ]),
        ];
  const connectionType = await readConnection(em);
  const entities = await em.find<Row>(schema, conditions.length === 0 ? {} : { $and: conditions }, {
    orderBy: order.map((item) => ({
      [item.field.lookup]: item.direction === 'asc' ? QueryOrder.ASC : QueryOrder.DESC,
    })),
    limit: limit + 1,
    ...(options.offset === undefined || options.offset === 0 ? {} : { offset: options.offset }),
    disableIdentityMap: true,
    // A replica, unless the user wrote a moment ago and the replica may not have it yet (DATA-13).
    connectionType,
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
  const plainRows = shown.map((entity): Row => wrap(entity).toObject());
  await applyExtensions(em, schema, plainRows);
  const rows =
    wanted === undefined
      ? plainRows
      : plainRows.map((plain) => Object.fromEntries(Object.entries(plain).filter(([key]) => wanted.has(key))));
  if (options.locale !== undefined) await applyTranslations(em, schema, rows, options.locale);

  const total = options.withTotal === true ? await em.count(schema, base, { connectionType }) : undefined;
  return { rows, limit, nextCursor, ...(total === undefined ? {} : { total }) };
}
