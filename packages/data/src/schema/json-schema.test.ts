/**
 * BieberKit
 *
 * @file        packages/data/src/schema/json-schema.test.ts
 * @description Tests for the JSON Schema 2020-12 compiler: create, update and read shapes (SCH-01 to SCH-04, DATA-22).
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

import { describe, expect, it } from 'vitest';
import { createAjv } from '../testing/ajv.ts';
import { Asset, Customer, User } from '../testing/sample-entities.ts';
import { defineEntity } from './define-entity.ts';
import { f } from './fields.ts';
import { toJsonSchema } from './json-schema.ts';
import { EMAIL_PATTERN } from './patterns.ts';

type Json = Record<string, unknown>;

const create = toJsonSchema(Customer, 'create');
const update = toJsonSchema(Customer, 'update');
const read = toJsonSchema(Customer, 'read');

/** `value` as an object, or a failure. Keeps the tests free of casts. */
function record(value: unknown): Json {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return Object.fromEntries(Object.entries(value));
  throw new Error('Expected an object.');
}

const props = (schema: Json): Record<string, Json> =>
  Object.fromEntries(Object.entries(record(schema['properties'])).map(([key, value]) => [key, record(value)]));

describe('toJsonSchema shape', () => {
  it('is a JSON Schema 2020-12 object with an id of its own per entity and mode', () => {
    for (const [mode, schema] of [
      ['create', create],
      ['update', update],
      ['read', read],
    ] as const) {
      expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema['type']).toBe('object');
      expect(schema['$id']).toBe(`urn:bieberkit:schema:crm.Customer:${mode}`);
    }
  });

  it('is deterministic, and what one call returns cannot change the next', () => {
    const first = toJsonSchema(Customer, 'create');
    Reflect.set(Object(Reflect.get(first, 'properties')), 'injected', true);
    expect(toJsonSchema(Customer, 'create')).toEqual(create);
  });

  it('refuses a mode that does not exist', () => {
    // @ts-expect-error not a mode
    expect(() => toJsonSchema(Customer, 'delete')).toThrow(/mode/);
  });

  it('every schema compiles with Ajv in strict mode, with the formats it uses', () => {
    const ajv = createAjv();
    for (const def of [Customer, User, Asset]) {
      for (const mode of ['create', 'update', 'read'] as const)
        expect(() => ajv.compile(toJsonSchema(def, mode))).not.toThrow();
    }
  });
});

describe('create', () => {
  it('takes the writable fields, with relations as <name>Id', () => {
    expect(Object.keys(props(create))).toEqual([
      'code',
      'name',
      'email',
      'tier',
      'credit',
      'balance',
      'note',
      'active',
      'since',
      'lastSeen',
      'visits',
      'ownerId',
    ]);
  });

  it('leaves out what the server writes: keys, standard columns, sequence, state and computed fields', () => {
    for (const name of [
      'id',
      'tenantId',
      'version',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'deletedAt',
      'deletedToken',
      'number',
      'status',
      'score',
      'owner',
      'nameCmp',
      'emailCmp',
    ]) {
      expect(props(create)).not.toHaveProperty(name);
    }
  });

  it('requires a field unless it is optional or has a default', () => {
    expect(create['required']).toEqual(['code', 'name', 'ownerId']);
  });

  it('refuses unknown properties', () => {
    expect(create['additionalProperties']).toBe(false);
  });

  it('strings count code points and omit a minimum of 0', () => {
    expect(props(create)['code']).toEqual({ type: 'string', maxLength: 32 });
    expect(props(create)['name']).toEqual({ type: 'string', minLength: 1, maxLength: 200 });
  });

  it('an optional field accepts null, meaning no value', () => {
    expect(props(create)['email']).toEqual({ type: ['string', 'null'], pattern: EMAIL_PATTERN, maxLength: 254 });
    expect(props(create)['note']).toEqual({ type: ['string', 'null'], maxLength: 1000 });
  });

  it('oneOf is an enum with its default', () => {
    expect(props(create)['tier']).toEqual({ type: 'string', enum: ['standard', 'gold', 'vip'], default: 'standard' });
  });

  it('a decimal is text with the digits its precision and scale allow', () => {
    expect(props(create)['credit']).toEqual({ type: ['string', 'null'], pattern: '^-?\\d{1,10}(\\.\\d{1,2})?$' });
  });

  it('money is an object with a text amount, and an optional currency fixed to the one of the field', () => {
    expect(props(create)['balance']).toEqual({
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['amount'],
          properties: { amount: { type: 'string', pattern: '^-?\\d{1,15}$' }, currency: { const: 'VND' } },
        },
        { type: 'null' },
      ],
    });
  });

  it('money allows 15 digits minus the minor unit before the point, so the minor amount stays below 10^15', () => {
    const usd = props(toJsonSchema(createWithMoney('USD'), 'create'));
    const amount = record(record(usd['price']?.['properties'])['amount']);
    expect(amount['pattern']).toBe('^-?\\d{1,13}(\\.\\d{1,2})?$');
  });

  it('an email is checked by a pattern, not by the format keyword, because Ajv and Zod disagree on that format', () => {
    expect(props(create)['email']).not.toHaveProperty('format');
    const ajv = createAjv();
    const check = ajv.compile({ type: 'string', pattern: EMAIL_PATTERN });
    for (const ok of ['a@b.co', 'a@b.c', 'a+tag@b.com.vn', 'A@B.CO']) expect(check(ok)).toBe(true);
    for (const bad of [
      'a@b',
      'a b@c.co',
      'a@b..co',
      '.a@b.co',
      'a.@b.co',
      'a@-b.co',
      'a@b-.co',
      'a@@b.co',
      'đ@b.co',
      'a@đ.vn',
    ])
      expect(check(bad)).toBe(false);
  });

  it('a relation is a UUID', () => {
    expect(props(create)['ownerId']).toEqual({ type: 'string', format: 'uuid' });
  });

  it('boolean, date and integer carry their defaults and bounds', () => {
    expect(props(create)['active']).toEqual({ type: 'boolean', default: true });
    expect(props(create)['since']).toEqual({ type: ['string', 'null'], format: 'date' });
    expect(props(create)['visits']).toEqual({ type: 'integer', minimum: 0, maximum: 2147483647, default: 0 });
  });

  it('an instant must be in UTC with a Z, because Ajv and Zod disagree about offsets otherwise', () => {
    const schema = props(create)['lastSeen'] ?? {};
    expect(schema['format']).toBe('date-time');
    expect(String(schema['pattern'])).toContain('Z');
    const ajv = createAjv();
    const check = ajv.compile({ type: 'object', properties: { t: schema } });
    expect(check({ t: '2026-11-22T10:00:00Z' })).toBe(true);
    expect(check({ t: '2026-11-22T10:00:00.123Z' })).toBe(true);
    expect(check({ t: '2026-11-22T10:00:00+07:00' })).toBe(false);
    expect(check({ t: '2026-11-22T10:00:00' })).toBe(false);
    expect(check({ t: '2026-11-22T23:59:60Z' })).toBe(false);
    expect(check({ t: null })).toBe(true);
  });

  it('a custom field uses the JSON Schema it was given, and is required unless optional', () => {
    const asset = toJsonSchema(Asset, 'create');
    expect(props(asset)['tag']).toEqual({ type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' });
    expect(props(asset)['label']).toEqual({ type: ['string', 'null'], maxLength: 50 });
    expect(asset['required']).toEqual(['tag']);
  });

  it('an entity with nothing required has no required list at all', () => {
    expect(toJsonSchema(createAllOptional(), 'create')).not.toHaveProperty('required');
  });
});

describe('update', () => {
  it('takes the same fields as create, all optional, and needs at least one', () => {
    expect(Object.keys(props(update))).toEqual(Object.keys(props(create)));
    expect(update).not.toHaveProperty('required');
    expect(update['minProperties']).toBe(1);
    expect(update['additionalProperties']).toBe(false);
  });

  it('a required field cannot be set to null, an optional one can (null clears it)', () => {
    expect(props(update)['code']).toEqual({ type: 'string', maxLength: 32 });
    expect(props(update)['email']).toEqual({ type: ['string', 'null'], pattern: EMAIL_PATTERN, maxLength: 254 });
  });

  it('carries no default, because an update must not reset what the caller left out', () => {
    for (const name of ['tier', 'active', 'visits']) expect(props(update)[name]).not.toHaveProperty('default');
  });
});

describe('read', () => {
  it('has everything the API returns, and never the tenant, the delete token or a shadow column', () => {
    expect(Object.keys(props(read))).toEqual([
      'id',
      'version',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'deletedAt',
      'code',
      'name',
      'email',
      'tier',
      'credit',
      'balance',
      'note',
      'active',
      'since',
      'lastSeen',
      'visits',
      'number',
      'status',
      'score',
      'ownerId',
    ]);
  });

  it('deletedAt is there only for entities with soft delete', () => {
    expect(props(toJsonSchema(User, 'read'))).not.toHaveProperty('deletedAt');
    expect(Object.keys(props(toJsonSchema(User, 'read')))).toEqual([
      'id',
      'version',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'name',
    ]);
  });

  it('requires every property, because an empty optional field is null, not absent', () => {
    expect(read['required']).toEqual(Object.keys(props(read)));
  });

  it('allows unknown properties, so an older client survives a newer server', () => {
    expect(read).not.toHaveProperty('additionalProperties', false);
  });

  it('describes server fields: id, version, standard timestamps, sequence, state and computed', () => {
    expect(props(read)['id']).toEqual({ type: 'string', format: 'uuid' });
    expect(props(read)['version']).toMatchObject({ type: 'integer', minimum: 1 });
    expect(props(read)['createdAt']).toMatchObject({ type: 'string', format: 'date-time' });
    expect(props(read)['createdBy']).toEqual({ type: ['string', 'null'], format: 'uuid' });
    expect(props(read)['number']).toMatchObject({ type: 'string' });
    expect(props(read)['status']).toEqual({ type: 'string', enum: ['new', 'qualified'] });
    expect(props(read)['score']).toMatchObject({ type: 'integer' });
  });

  it('an optional enum or string accepts null', () => {
    expect(props(read)['email']).toMatchObject({ type: ['string', 'null'] });
    expect(props(read)['note']).toMatchObject({ type: ['string', 'null'] });
  });

  it('an optional money value is the object or null', () => {
    expect(props(read)['balance']).toHaveProperty('anyOf');
  });
});

function createWithMoney(currency: string) {
  return buildEntity({ price: { money: currency } });
}

function createAllOptional() {
  return buildEntity({ a: { optional: true } });
}

function buildEntity(spec: Record<string, { money?: string; optional?: boolean }>) {
  const fields = Object.fromEntries(
    Object.entries(spec).map(([name, one]) => [
      name,
      one.money === undefined ? f.string({ max: 5 }).optional() : f.money({ currency: one.money }),
    ]),
  );
  return defineEntity({ name: 'test.Built', table: 'test_built', fields: { id: f.id(), ...fields } });
}
