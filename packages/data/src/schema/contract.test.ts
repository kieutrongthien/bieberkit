/**
 * BieberKit
 *
 * @file        packages/data/src/schema/contract.test.ts
 * @description The contract suite: shared fixtures give the same verdict through Ajv and Zod 4 Mini, and the suite notices a difference (SCH-03, SCH-05).
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
import { checkContract } from '../testing/contract.ts';
import type { Fixture } from '../testing/contract.ts';
import { Asset, Customer } from '../testing/sample-entities.ts';
import { toJsonSchema } from './json-schema.ts';
import { toZodMini } from './zod-mini.ts';

const OWNER = '0190f6b2-7c4e-7000-8000-0123456789ab';
const base = { code: 'C-001', name: 'Lê', ownerId: OWNER };

const create = (
  name: string,
  patch: Record<string, unknown>,
  valid: boolean,
  from: Record<string, unknown> = base,
): Fixture => ({ name, mode: 'create', input: { ...from, ...patch }, valid });
const update = (name: string, input: unknown, valid: boolean): Fixture => ({ name, mode: 'update', input, valid });

const emoji = (n: number): string => '😀'.repeat(n);
const family = (n: number): string => '👨‍👩‍👧'.repeat(n);
const nfd = (n: number): string => 'ế'.repeat(n);

const customer: Fixture[] = [
  { name: 'the smallest valid input', mode: 'create', input: base, valid: true },
  create(
    'every field filled in',
    {
      email: 'a@b.co',
      tier: 'gold',
      credit: '12.30',
      balance: { amount: '12500', currency: 'VND' },
      note: 'ghi chú',
      active: false,
      since: '2026-11-22',
      lastSeen: '2026-11-22T10:00:00Z',
      visits: 3,
    },
    true,
  ),
  // lengths count code points
  create('code of 32 ASCII', { code: 'x'.repeat(32) }, true),
  create('code of 33 ASCII', { code: 'x'.repeat(33) }, false),
  create('code of 32 emoji', { code: emoji(32) }, true),
  create('code of 33 emoji', { code: emoji(33) }, false),
  create('code of 6 family emoji, 30 code points', { code: family(6) }, true),
  create('code of 7 family emoji, 35 code points', { code: family(7) }, false),
  create('code of 20 decomposed ế, 60 code points before NFC', { code: nfd(20) }, true),
  create('code of 32 decomposed ế', { code: nfd(32) }, true),
  create('code of 33 decomposed ế', { code: nfd(33) }, false),
  create('name typed in NFD', { name: 'Lê' }, true),
  create('name of 200 emoji', { name: emoji(200) }, true),
  create('name of 201 emoji', { name: emoji(201) }, false),
  create('empty name', { name: '' }, false),
  create('a Vietnamese name', { name: 'Nguyễn Thị Hồng Ánh' }, true),
  // formats: the places where Ajv and Zod disagreed before the patterns
  create('email a@b.co', { email: 'a@b.co' }, true),
  create('email a@b.c', { email: 'a@b.c' }, true),
  create('email a@b-.co', { email: 'a@b-.co' }, false),
  create('email a@b', { email: 'a@b' }, false),
  create('email with a space', { email: 'a b@c.co' }, false),
  create('email with an accent', { email: 'đ@b.co' }, false),
  create('email in upper case', { email: 'A@B.CO' }, true),
  create('email with a plus tag', { email: 'a+tag@b.com.vn' }, true),
  create('email null', { email: null }, true),
  create('UUID in upper case', { ownerId: OWNER.toUpperCase() }, true),
  create('the nil UUID', { ownerId: '00000000-0000-0000-0000-000000000000' }, true),
  create(
    'a UUID with a variant that RFC 9562 does not define',
    { ownerId: '0190f6b2-7c4e-7000-c000-0123456789ab' },
    true,
  ),
  create('a UUID without dashes', { ownerId: '0190f6b27c4e700080000123456789ab' }, false),
  create('a relation that is not a UUID', { ownerId: 'x' }, false),
  create('no relation', { ownerId: undefined }, false),
  create('instant with Z', { lastSeen: '2026-11-22T10:00:00Z' }, true),
  create('instant with milliseconds', { lastSeen: '2026-11-22T10:00:00.123Z' }, true),
  create('instant with an offset', { lastSeen: '2026-11-22T10:00:00+07:00' }, false),
  create('instant with no zone', { lastSeen: '2026-11-22T10:00:00' }, false),
  create('instant with a leap second', { lastSeen: '2026-11-22T23:59:60Z' }, false),
  create('instant at hour 24', { lastSeen: '2026-11-22T24:00:00Z' }, false),
  create('instant that is only a date', { lastSeen: '2026-11-22' }, false),
  create('a real date', { since: '2026-02-28' }, true),
  create('a date in a leap year', { since: '2024-02-29' }, true),
  create('a date that does not exist', { since: '2026-02-30' }, false),
  create('a date written with one digit', { since: '2026-1-1' }, false),
  // numbers and text values
  create('tier vip', { tier: 'vip' }, true),
  create('tier that is not listed', { tier: 'platinum' }, false),
  create('tier null', { tier: null }, false),
  create('visits at the top of the range', { visits: 2147483647 }, true),
  create('visits above the range', { visits: 2147483648 }, false),
  create('visits below the minimum', { visits: -1 }, false),
  create('visits with a fraction', { visits: 1.5 }, false),
  create('visits as text', { visits: '5' }, false),
  create('credit 12.30', { credit: '12.30' }, true),
  create('credit negative', { credit: '-0.5' }, true),
  create('credit at 10 digits before the point', { credit: '9999999999.99' }, true),
  create('credit at 11 digits before the point', { credit: '12345678901.00' }, false),
  create('credit with 3 decimals', { credit: '12.345' }, false),
  create('credit with a trailing point', { credit: '12.' }, false),
  create('credit with a leading point', { credit: '.5' }, false),
  create('credit as a number', { credit: 12.3 }, false),
  create('balance with an amount only', { balance: { amount: '12500' } }, true),
  create('balance with the right currency', { balance: { amount: '12500', currency: 'VND' } }, true),
  create('balance with another currency', { balance: { amount: '12500', currency: 'USD' } }, false),
  create('balance with a decimal point in a currency with none', { balance: { amount: '12.5' } }, false),
  create('balance with 15 digits', { balance: { amount: '9'.repeat(15) } }, true),
  create('balance with 16 digits', { balance: { amount: '9'.repeat(16) } }, false),
  create('balance with no amount', { balance: { currency: 'VND' } }, false),
  create('balance as a number', { balance: 12500 }, false),
  create('note of 1000 characters', { note: 'n'.repeat(1000) }, true),
  create('note of 1001 characters', { note: 'n'.repeat(1001) }, false),
  create('active false', { active: false }, true),
  create('active as text', { active: 'yes' }, false),
  // shape
  create('an unknown key', { nope: 1 }, false),
  create('a key the server writes: id', { id: OWNER }, false),
  create('a key the server writes: version', { version: 1 }, false),
  create('a key the server writes: status', { status: 'new' }, false),
  create('a key the server writes: number', { number: 'CUS-00001' }, false),
  { name: 'null instead of an object', mode: 'create', input: null, valid: false },
  { name: 'a list instead of an object', mode: 'create', input: [], valid: false },
  { name: 'text instead of an object', mode: 'create', input: 'x', valid: false },
  update('update with one field', { name: 'x' }, true),
  update('update with no field', {}, false),
  update('update that clears an optional field', { email: null }, true),
  update('update that clears a required field', { code: null }, false),
  update('update with an unknown key', { nope: 1 }, false),
  update('update with the id', { id: OWNER }, false),
  update('update with NFD text', { name: nfd(100) }, true),
  update('update with a bad tier', { tier: 'platinum' }, false),
];

describe('SCH-03 the fixtures give the same verdict through Ajv and Zod Mini', () => {
  it('there are enough fixtures to mean something', () => {
    expect(customer.length).toBeGreaterThanOrEqual(75);
    expect(new Set(customer.map((fixture) => fixture.name)).size).toBe(customer.length);
  });

  it('the Customer entity has no disagreement', () => {
    expect(checkContract(Customer, customer)).toEqual([]);
  });

  it('the custom field of Asset has none either', () => {
    const fixtures: Fixture[] = [
      { name: 'a valid tag', mode: 'create', input: { tag: 'ABC-1234' }, valid: true },
      { name: 'a tag in lower case', mode: 'create', input: { tag: 'abc-1234' }, valid: false },
      { name: 'no tag', mode: 'create', input: {}, valid: false },
      { name: 'an optional label that is null', mode: 'create', input: { tag: 'ABC-1234', label: null }, valid: true },
      {
        name: 'a label of 51 characters',
        mode: 'create',
        input: { tag: 'ABC-1234', label: 'x'.repeat(51) },
        valid: false,
      },
      { name: 'update with a bad tag', mode: 'update', input: { tag: 'nope' }, valid: false },
    ];
    expect(checkContract(Asset, fixtures)).toEqual([]);
  });
});

describe('SCH-03 the suite itself has power: a difference between the validators is reported', () => {
  const realJson = (mode: 'create' | 'update') =>
    toJsonSchema(Customer, mode) as { properties: Record<string, object> };

  it('a JSON Schema that allows one character less than Zod is caught', () => {
    const found = checkContract(Customer, customer, {
      jsonSchema: (mode) => {
        const schema = realJson(mode);
        return { ...schema, properties: { ...schema.properties, code: { type: 'string', maxLength: 31 } } };
      },
    });
    expect(found.map((item) => item.fixture)).toContain('code of 32 ASCII');
    expect(found.every((item) => item.ajv !== item.zod || item.ajv !== item.expected)).toBe(true);
  });

  it('a Zod schema that counts UTF-16 units instead of code points is caught on the emoji fixtures', () => {
    const found = checkContract(Customer, customer, {
      zod: (mode) => {
        const schema = toZodMini(Customer, mode);
        return {
          safeParse: (input: unknown) => {
            const code = typeof input === 'object' && input !== null && 'code' in input ? input.code : undefined;
            return { success: schema.safeParse(input).success && !(typeof code === 'string' && code.length > 32) };
          },
        };
      },
    });
    expect(found.map((item) => item.fixture)).toContain('code of 32 emoji');
  });

  it('JSON Schema email format instead of the shared pattern is caught on the fixtures that Ajv and Zod used to disagree about', () => {
    const found = checkContract(Customer, customer, {
      jsonSchema: (mode) => {
        const schema = realJson(mode);
        return {
          ...schema,
          properties: { ...schema.properties, email: { type: ['string', 'null'], format: 'email' } },
        };
      },
    });
    expect(found.map((item) => item.fixture)).toEqual(expect.arrayContaining(['email a@b.c', 'email a@b-.co']));
  });

  it('skipping the NFC step before Ajv is caught on the decomposed text fixtures', () => {
    const found = checkContract(Customer, customer, { skipNormalize: true });
    expect(found.map((item) => item.fixture)).toEqual(
      expect.arrayContaining(['code of 20 decomposed ế, 60 code points before NFC', 'code of 32 decomposed ế']),
    );
  });
});
