/**
 * BieberKit
 *
 * @file        packages/data/src/schema/json-schema.ts
 * @description The JSON Schema 2020-12 compiler: create, update and read shapes of an entity (SCH-01 to SCH-04, DATA-22).
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

import { minorUnitOf } from '../numbers/scaled.ts';
import type { EntityDef } from './define-entity.ts';
import type { FieldDef } from './fields.ts';
import { decimalPattern, EMAIL_PATTERN, MONEY_DIGITS, UTC_INSTANT_PATTERN } from './patterns.ts';
import { apiFields, assertMode } from './shape.ts';
import type { SchemaMode } from './shape.ts';

export type JsonSchema = Record<string, unknown>;

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const INSTANT = { type: 'string', format: 'date-time', pattern: UTC_INSTANT_PATTERN } as const;

/** `null` means "no value". An object, or a schema without a type, becomes an `anyOf` with null. */
function nullable(schema: JsonSchema): JsonSchema {
  const { type } = schema;
  if (typeof type !== 'string' || type === 'object') return { anyOf: [schema, { type: 'null' }] };
  return {
    ...schema,
    type: [type, 'null'],
    ...(Array.isArray(schema['enum']) ? { enum: [...(schema['enum'] as unknown[]), null] } : {}),
  };
}

function moneySchema(def: FieldDef, mode: SchemaMode): JsonSchema {
  const currency = def.currency ?? '';
  return {
    type: 'object',
    additionalProperties: false,
    required: mode === 'read' ? ['amount', 'currency'] : ['amount'],
    properties: {
      amount: { type: 'string', pattern: decimalPattern(MONEY_DIGITS, minorUnitOf(currency)) },
      currency: { const: currency },
    },
  };
}

/** The schema of a value of this kind, without nullability, default or requiredness. */
function valueSchema(def: FieldDef, mode: SchemaMode): JsonSchema {
  switch (def.kind) {
    case 'string':
      return { type: 'string', ...((def.min ?? 0) > 0 ? { minLength: def.min } : {}), maxLength: def.max };
    case 'text':
      return { type: 'string', maxLength: def.max };
    case 'email':
      return { type: 'string', pattern: EMAIL_PATTERN, maxLength: def.max };
    case 'oneOf':
      return { type: 'string', enum: [...(def.values ?? [])] };
    case 'int':
      return { type: 'integer', minimum: def.min, maximum: def.max };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'dateTime':
      return { ...INSTANT };
    case 'decimal':
      return { type: 'string', pattern: decimalPattern(def.precision ?? 15, def.scale ?? 0) };
    case 'money':
      return moneySchema(def, mode);
    case 'belongsTo':
      return { type: 'string', format: 'uuid' };
    case 'state':
      return { type: 'string', enum: [...(def.states ?? [])] };
    case 'sequence':
      return { type: 'string' };
    case 'custom':
      return { ...def.jsonSchema };
    default:
      return {};
  }
}

const STANDARD_READ: readonly (readonly [string, JsonSchema])[] = [
  ['id', { type: 'string', format: 'uuid' }],
  ['version', { type: 'integer', minimum: 1 }],
  ['createdAt', { ...INSTANT }],
  ['updatedAt', { ...INSTANT }],
  ['createdBy', { type: ['string', 'null'], format: 'uuid' }],
  ['updatedBy', { type: ['string', 'null'], format: 'uuid' }],
];

/**
 * The JSON Schema (draft 2020-12) of one shape of an entity. `create` and `update` take the writable fields and refuse unknown keys,
 * `read` is what the API returns and lets unknown keys through. An optional field accepts `null`, which means no value.
 */
export function toJsonSchema(def: EntityDef<string>, mode: SchemaMode): JsonSchema {
  assertMode(mode);
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  if (mode === 'read') {
    for (const [key, schema] of STANDARD_READ) properties[key] = schema;
    if (def.softDelete) properties['deletedAt'] = nullable({ ...INSTANT });
  }
  for (const field of apiFields(def)) {
    if (mode !== 'read' && !field.writable) continue;
    const isOptional = field.def.optional === true;
    let schema = valueSchema(field.def, mode);
    if (isOptional) schema = nullable(schema);
    if (mode === 'create' && field.def.default !== undefined) schema = { ...schema, default: field.def.default };
    properties[field.key] = schema;
    if (mode === 'read' || (mode === 'create' && !isOptional && field.def.default === undefined))
      required.push(field.key);
  }
  if (mode === 'read') required.unshift(...STANDARD_READ.map(([key]) => key), ...(def.softDelete ? ['deletedAt'] : []));
  // Standard columns come first in the list of required keys, in the order of the properties.
  const ordered = mode === 'read' ? Object.keys(properties) : required;

  return {
    $schema: DRAFT,
    $id: `urn:bieberkit:schema:${def.name}:${mode}`,
    type: 'object',
    properties,
    ...(ordered.length > 0 ? { required: ordered } : {}),
    ...(mode === 'read' ? {} : { additionalProperties: false }),
    ...(mode === 'update' ? { minProperties: 1 } : {}),
  };
}
