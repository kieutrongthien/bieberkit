/**
 * BieberKit
 *
 * @file        packages/data/src/orm/mapper.ts
 * @description The mappers between the API shape of an entity and its ORM properties: money, decimals, relations and instants (MOD-08, MOD-11, DATA-22).
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

import { dataError } from '../errors.ts';
import { fromMinor, fromScaled, toMinor, toScaled } from '../numbers/scaled.ts';
import { apiFields } from '../schema/shape.ts';
import type { ApiField } from '../schema/shape.ts';
import { entityOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';

type Row = Record<string, unknown>;

/** A bigint column comes out of `toObject` as text, so the amount is read back from either. */
function bigintOf(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if ((typeof value === 'string' && /^-?\d+$/.test(value)) || typeof value === 'number') return BigInt(value);
  return null;
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function day(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value : null;
}

/** The id of a relation, whether the row carries the id or the loaded row. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const id: unknown = Reflect.get(value, 'id');
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function apiValue(field: ApiField, row: Row): unknown {
  const { name, def } = field;
  if (def.computed !== undefined && !def.computed.stored) return def.computed.fn(row) ?? null;
  switch (def.kind) {
    case 'money': {
      const minor = bigintOf(row[`${name}Minor`]);
      if (minor === null) return null;
      const currency =
        typeof row[`${name}Currency`] === 'string' ? String(row[`${name}Currency`]) : (def.currency ?? '');
      return { amount: fromMinor(minor, currency), currency };
    }
    case 'decimal': {
      const scaled = bigintOf(row[`${name}Scaled`]);
      return scaled === null ? null : fromScaled(scaled, def.scale ?? 0);
    }
    case 'belongsTo':
      return idOf(row[name]);
    case 'dateTime':
      return iso(row[name]);
    case 'date':
      return day(row[name]);
    default:
      return row[name] ?? null;
  }
}

/**
 * An ORM row as the API returns it: the standard fields, then the declared ones with money as `{ amount, currency }`, decimals as text,
 * a relation as `<name>Id` and instants as ISO text. An empty value is `null`. The tenant, the delete token and the shadow columns stay out.
 */
export function toApiRow(schema: OrmSchema, row: Row): Row {
  const def = entityOfSchema(schema);
  const out: Row = {
    id: row['id'] ?? null,
    version: row['version'] ?? null,
    createdAt: iso(row['createdAt']),
    updatedAt: iso(row['updatedAt']),
    createdBy: row['createdBy'] ?? null,
    updatedBy: row['updatedBy'] ?? null,
  };
  if (def.softDelete) out['deletedAt'] = iso(row['deletedAt']);
  for (const field of apiFields(def)) out[field.key] = apiValue(field, row);
  return out;
}

function ormEntries(field: ApiField, value: unknown): Row {
  const { name, def } = field;
  switch (def.kind) {
    case 'money': {
      if (value === null) return { [`${name}Minor`]: null };
      const money: unknown = value;
      const amount: unknown = Reflect.get(Object(money), 'amount');
      const currency: unknown = Reflect.get(Object(money), 'currency');
      if (typeof amount !== 'string')
        throw dataError('DATA_INPUT_INVALID', 400, `${name} needs an amount as text.`, 'Send { amount: "12.50" }.');
      const code = typeof currency === 'string' ? currency : (def.currency ?? '');
      return { [`${name}Minor`]: toMinor(amount, code), [`${name}Currency`]: code };
    }
    case 'decimal':
      return { [`${name}Scaled`]: typeof value === 'string' ? toScaled(value, def.scale ?? 0) : null };
    case 'belongsTo':
      return { [name]: value };
    case 'dateTime':
      return { [name]: typeof value === 'string' ? new Date(value) : value };
    default:
      return { [name]: value };
  }
}

/**
 * The ORM properties for a body that the create or update schema accepted. Money and decimals become scaled integers, a relation key
 * `<name>Id` becomes the relation, an instant becomes a `Date`. Only what was sent is returned. A key that is not a writable field is refused.
 */
export function toOrmData(schema: OrmSchema, input: Row, _mode: 'create' | 'update'): Row {
  const writable = new Map(
    apiFields(entityOfSchema(schema))
      .filter((field) => field.writable)
      .map((field) => [field.key, field]),
  );
  const data: Row = {};
  for (const [key, value] of Object.entries(input)) {
    const field = writable.get(key);
    if (field === undefined) {
      throw dataError(
        'DATA_INPUT_INVALID',
        400,
        `${key} is not a field that can be written.`,
        `Send only ${[...writable.keys()].join(', ')}.`,
      );
    }
    Object.assign(data, ormEntries(field, value));
  }
  return data;
}
