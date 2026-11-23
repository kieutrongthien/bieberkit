/**
 * BieberKit
 *
 * @file        packages/data/src/orm/aggregate.ts
 * @description Aggregations by group for dashboards: counts and sums of declared fields, with the tenant filter and the soft delete of every read (API-15, DATA-09).
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

import { raw } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { uuid7FromBytes } from '../keys/uuid7.ts';
import { fromScaled } from '../numbers/scaled.ts';
import { entityOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { BieberEntityManager } from './entity-manager.ts';
import { knownFields, translateScope, translateWhere } from './query.ts';

type Row = Record<string, unknown>;

const GROUP_KINDS = ['string', 'email', 'oneOf', 'boolean', 'date', 'int', 'belongsTo', 'state'];
const SUM_KINDS = ['int', 'decimal'];
const MAX_GROUP_FIELDS = 3;
const MAX_SUMS = 5;
const DEFAULT_MAX_GROUPS = 1000;

export interface AggregateOptions {
  /** Properties to group by. Each must be declared `.aggregatable()`. At most 3. */
  readonly groupBy?: readonly string[];
  /** Properties to sum. Each must be an `int` or a `decimal` declared `.aggregatable()`. At most 5. */
  readonly sum?: readonly string[];
  /** Whether to count the rows of each group. It is the default when nothing is summed. */
  readonly count?: boolean;
  /** The same filter as a list: indexed fields only. */
  readonly where?: Row;
  /** The rows that the caller may see, chosen by code (AUTHZ-02). It is applied next to the tenant filter and `where`. */
  readonly scope?: Row;
  /** More groups than this is an error, so a dashboard never pulls a whole table. Defaults to 1000. */
  readonly maxGroups?: number;
}

export interface AggregateRow {
  /** The value of each property that was grouped by. */
  readonly group: Row;
  readonly count?: number;
  /** The sum of each property: a number for an `int`, and text with its scale for a `decimal`. `null` when the group has no value. */
  readonly sum?: Row;
}

export interface AggregateResult {
  readonly rows: AggregateRow[];
}

function invalid(message: string, fix: string): never {
  throw dataError('DATA_AGGREGATE_INVALID', 400, message, fix);
}

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

function groupValue(kind: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (kind === 'boolean') return value === true || value === 1 || value === '1' || value === 't';
  if (kind === 'int') return Number(value);
  if (kind === 'belongsTo' && value instanceof Uint8Array) return uuid7FromBytes(value);
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function sumValue(kind: string, scale: number, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  // A sum comes as a number, a bigint or the text of a decimal that has no fraction, depending on the database.
  const text =
    typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'bigint' ? value.toString() : '0';
  const whole = text.split('.')[0] ?? '0';
  const total = BigInt(whole);
  return kind === 'decimal' ? fromScaled(total, scale) : Number(total);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const left = typeof a === 'string' ? a : JSON.stringify(a);
  const right = typeof b === 'string' ? b : JSON.stringify(b);
  return left < right ? -1 : 1;
}

/**
 * Counts and sums rows by group (API-15). Only fields that were declared `.aggregatable()` can be used. The read goes through the
 * filters of the entity manager, so the tenant filter and the soft delete apply as they do for a list, and a caller with no
 * tenant is refused (DATA-09, DATA-19). Groups come back in a fixed order, empty values first, whatever the database.
 */
export async function aggregate(
  em: EntityManager,
  schema: OrmSchema,
  options: AggregateOptions = {},
): Promise<AggregateResult> {
  const def = entityOfSchema(schema);
  const groupBy = options.groupBy ?? [];
  const sums = options.sum ?? [];
  if (groupBy.length > MAX_GROUP_FIELDS || new Set(groupBy).size !== groupBy.length)
    invalid(`Group by up to ${MAX_GROUP_FIELDS} different fields.`, 'Name each field once, and use fewer.');
  if (sums.length > MAX_SUMS || new Set(sums).size !== sums.length)
    invalid(`Sum up to ${MAX_SUMS} different fields.`, 'Name each field once, and use fewer.');
  const check = (name: string, kinds: readonly string[], verb: string): void => {
    const field = def.fields[name];
    if (field === undefined)
      invalid(`${name} is not a field of ${def.name}.`, 'Use the name of a field of the entity.');
    if (field?.aggregatable !== true || !kinds.includes(field.kind)) {
      invalid(
        `${name} cannot be used to ${verb}.`,
        `Declare the field with .aggregatable(), and use ${kinds.join(', ')} to ${verb}.`,
      );
    }
  };
  for (const name of groupBy) check(name, GROUP_KINDS, 'group by');
  for (const name of sums) check(name, SUM_KINDS, 'sum');
  const count = options.count ?? sums.length === 0;
  const maxGroups = options.maxGroups ?? DEFAULT_MAX_GROUPS;

  if (!(em instanceof BieberEntityManager)) {
    throw dataError(
      'DATA_DRIVER_UNSUPPORTED',
      500,
      'This EntityManager does not apply the filters of BieberKit.',
      'Use the one of createDatabase.',
    );
  }
  const meta = em.getMetadata().get(schema);
  const platform = em.getPlatform();
  const column = (property: string): string => {
    // The metadata is keyed by property name, which TypeScript sees as a key of an enum of the ORM.
    // oxlint-disable-next-line typescript/no-unsafe-enum-assignment
    const name = meta.properties[property]?.fieldNames[0];
    if (name === undefined) invalid(`${property} has no column.`, 'This is a bug of the compiler.');
    return platform.quoteIdentifier(name);
  };
  const known = knownFields(schema);
  const filter = options.where === undefined ? {} : translateWhere(schema, known, options.where);
  const scope = options.scope === undefined ? {} : translateScope(schema, known, options.scope);
  const where = Object.keys(scope).length === 0 ? filter : { $and: [filter, scope] };
  // The filters of the entity (tenant, soft delete) are added the way a find adds them, and the guard against switching them off applies.
  const filtered = await em.applyFilters(schema, where, undefined, 'read');

  const select: ReturnType<typeof raw>[] = [];
  groupBy.forEach((name, index) => select.push(raw(`${column(name)} as ${quote(`g${index}`)}`)));
  if (count) select.push(raw(`count(*) as ${quote('n')}`));
  sums.forEach((name, index) => {
    const field = def.fields[name];
    select.push(raw(`sum(${column(field?.kind === 'decimal' ? `${name}Scaled` : name)}) as ${quote(`s${index}`)}`));
  });
  // The query builder types its arguments by the class of the entity, and these are built from names that were checked above.
  /* oxlint-disable typescript/no-unsafe-type-assertion */
  const query = em.createQueryBuilder(schema).select(select as never);
  if (filtered !== undefined && Object.keys(filtered).length > 0) query.where(filtered as never);
  if (groupBy.length > 0) query.groupBy(groupBy.map((name) => raw(column(name))) as never);
  /* oxlint-enable typescript/no-unsafe-type-assertion */
  query.limit(maxGroups + 1);
  const found: Row[] = await query.execute('all', false);
  if (found.length > maxGroups) {
    throw dataError(
      'DATA_AGGREGATE_TOO_MANY',
      400,
      `There are more than ${maxGroups} groups.`,
      'Group by something coarser, or filter first.',
    );
  }
  const rows = found.map((item): AggregateRow => {
    const group: Row = {};
    groupBy.forEach((name, index) => {
      group[name] = groupValue(def.fields[name]?.kind ?? '', item[`g${index}`]);
    });
    const out: { group: Row; count?: number; sum?: Row } = { group };
    if (count) out.count = Number(item['n']);
    if (sums.length > 0) {
      out.sum = {};
      sums.forEach((name, index) => {
        const field = def.fields[name];
        out.sum![name] = sumValue(field?.kind ?? 'int', field?.scale ?? 0, item[`s${index}`]);
      });
    }
    return out;
  });
  if (groupBy.length === 0 && rows.length === 0)
    rows.push({
      group: {},
      ...(count ? { count: 0 } : {}),
      ...(sums.length > 0 ? { sum: Object.fromEntries(sums.map((name) => [name, null])) } : {}),
    });
  rows.sort((a, b) => {
    for (const name of groupBy) {
      const order = compare(a.group[name], b.group[name]);
      if (order !== 0) return order;
    }
    return 0;
  });
  return { rows };
}
