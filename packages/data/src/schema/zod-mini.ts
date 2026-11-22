/**
 * BieberKit
 *
 * @file        packages/data/src/schema/zod-mini.ts
 * @description The Zod 4 Mini compiler: the same rules as the JSON Schema, with NFC applied to every string (SCH-01, SCH-03, SCH-05).
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

import * as z from 'zod/mini';
import { minorUnitOf } from '../numbers/scaled.ts';
import type { EntityDef } from './define-entity.ts';
import type { FieldDef } from './fields.ts';
import { decimalPattern, EMAIL_PATTERN, MONEY_DIGITS } from './patterns.ts';
import { apiFields, assertMode } from './shape.ts';
import type { SchemaMode } from './shape.ts';

type Schema = z.ZodMiniType;

const INT_BOUND = 2147483647;

/** Text is normalized to NFC first, so the length checks that follow count the composed text (SCH-05). */
function text(...checks: z.core.$ZodCheck<string>[]): Schema {
  return z.string().check(z.normalize('NFC'), ...checks);
}

function moneySchema(def: FieldDef, mode: SchemaMode): Schema {
  const currency = def.currency ?? '';
  const amount = text(z.regex(new RegExp(decimalPattern(MONEY_DIGITS, minorUnitOf(currency)))));
  return z.strictObject({ amount, currency: mode === 'read' ? z.literal(currency) : z.optional(z.literal(currency)) });
}

/** The schema of a value of this kind, without nullability, default or requiredness. */
function valueSchema(def: FieldDef, mode: SchemaMode): Schema {
  switch (def.kind) {
    case 'string':
      return text(z.minLength(def.min ?? 0), z.maxLength(def.max ?? 0));
    case 'text':
      return text(z.maxLength(def.max ?? 0));
    case 'email':
      return text(z.maxLength(def.max ?? 254), z.regex(new RegExp(EMAIL_PATTERN)));
    case 'oneOf':
      return z.enum([...(def.values ?? [])]);
    case 'int':
      return z.int().check(z.gte(def.min ?? -INT_BOUND - 1), z.lte(def.max ?? INT_BOUND));
    case 'boolean':
      return z.boolean();
    case 'date':
      return z.iso.date();
    case 'dateTime':
      return z.iso.datetime();
    case 'decimal':
      return text(z.regex(new RegExp(decimalPattern(def.precision ?? 15, def.scale ?? 0))));
    case 'money':
      return moneySchema(def, mode);
    case 'belongsTo':
      // Loose like `isUuid` and like Ajv's uuid format, so both validators accept the same ids.
      return z.guid();
    case 'state':
      return z.enum([...(def.states ?? [])]);
    case 'sequence':
      return z.string();
    case 'custom':
      // A schema value that the author passed in, checked when the field was built.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return def.zod as unknown as Schema;
    default:
      return z.unknown();
  }
}

const UUID = z.guid();
const INSTANT = z.iso.datetime();

/**
 * The Zod 4 Mini schema of one shape of an entity, with the same rules as `toJsonSchema`. Strings are turned into NFC before
 * they are checked and come out as NFC. `create` and `update` refuse unknown keys, `read` lets them through.
 */
export function toZodMini(def: EntityDef<string>, mode: SchemaMode): z.ZodMiniType<Record<string, unknown>> {
  assertMode(mode);
  const shape: Record<string, Schema> = {};
  if (mode === 'read') {
    shape['id'] = UUID;
    shape['version'] = z.int().check(z.gte(1));
    shape['createdAt'] = INSTANT;
    shape['updatedAt'] = INSTANT;
    shape['createdBy'] = z.nullable(UUID);
    shape['updatedBy'] = z.nullable(UUID);
    if (def.softDelete) shape['deletedAt'] = z.nullable(INSTANT);
  }
  for (const field of apiFields(def)) {
    if (mode !== 'read' && !field.writable) continue;
    const isOptional = field.def.optional === true;
    const value = valueSchema(field.def, mode);
    if (mode === 'read') shape[field.key] = isOptional ? z.nullable(value) : value;
    else if (mode === 'update') shape[field.key] = z.optional(isOptional ? z.nullable(value) : value);
    // Zod names the helper `_default`, because `default` is a reserved word.
    // oxlint-disable-next-line no-underscore-dangle
    else if (field.def.default !== undefined) shape[field.key] = z._default(value, field.def.default);
    else shape[field.key] = isOptional ? z.optional(z.nullable(value)) : value;
  }
  if (mode === 'read') return z.object(shape);
  const object = z.strictObject(shape);
  return mode === 'update'
    ? object.check(z.refine((value) => Object.keys(value).length > 0, 'An update needs at least one field.'))
    : object;
}
