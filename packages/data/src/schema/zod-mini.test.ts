/**
 * BieberKit
 *
 * @file        packages/data/src/schema/zod-mini.test.ts
 * @description Tests for the Zod 4 Mini compiler, including NFC input and the same rules as the JSON Schema (SCH-01, SCH-03, SCH-05).
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
import { describe, expect, it } from 'vitest';
import { Asset, Customer } from '../testing/sample-entities.ts';
import { toZodMini } from './zod-mini.ts';

const OWNER = '0190f6b2-7c4e-7000-8000-0123456789ab';
const valid = { code: 'C-001', name: 'Công ty Lê', ownerId: OWNER };

const create = toZodMini(Customer, 'create');
const update = toZodMini(Customer, 'update');
const read = toZodMini(Customer, 'read');

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join('.'));
}

describe('create', () => {
  it('accepts the smallest valid input and fills in the defaults', () => {
    const result = create.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ ...valid, tier: 'standard', active: true, visits: 0 });
  });

  it('reports a missing required field at its own path', () => {
    const result = create.safeParse({ code: 'C-001', ownerId: OWNER });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(['name']);
  });

  it('refuses unknown keys, and the keys the server writes', () => {
    for (const extra of [
      { nope: 1 },
      { id: OWNER },
      { tenantId: OWNER },
      { version: 1 },
      { createdAt: '2026-11-22T10:00:00Z' },
      { number: 'CUS-00001' },
      { status: 'new' },
      { score: 3 },
    ]) {
      expect(create.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });

  it('null means no value for an optional field, and is refused for a required one', () => {
    expect(
      create.safeParse({ ...valid, email: null, note: null, credit: null, balance: null, since: null, lastSeen: null })
        .success,
    ).toBe(true);
    expect(create.safeParse({ ...valid, code: null }).success).toBe(false);
    expect(create.safeParse({ ...valid, tier: null }).success).toBe(false);
  });

  it('counts code points, so 32 emoji fit a field of 32 and 33 do not (SCH-03)', () => {
    expect(create.safeParse({ ...valid, code: '😀'.repeat(32) }).success).toBe(true);
    expect(create.safeParse({ ...valid, code: '😀'.repeat(33) }).success).toBe(false);
  });

  it('applies the minimum length', () => {
    expect(create.safeParse({ ...valid, name: '' }).success).toBe(false);
    expect(create.safeParse({ ...valid, name: 'a' }).success).toBe(true);
  });

  it('turns text typed in NFD into NFC before checking and in the result (SCH-05)', () => {
    const nfd = 'ế'.repeat(20);
    const result = create.safeParse({ ...valid, code: nfd });
    expect(result.success).toBe(true);
    expect(result.data?.code).toBe('ế'.repeat(20));
    expect(create.safeParse({ ...valid, code: 'ế'.repeat(33) }).success).toBe(false);
  });

  it('checks email, enum, UUID, decimal, boolean, integer and date formats', () => {
    const bad = [
      { email: 'nope' },
      { email: 'đ@x.co' },
      { email: 'a@b-.co' },
      { tier: 'platinum' },
      { ownerId: 'not-a-uuid' },
      { credit: '12.345' },
      { credit: '12345678901.00' },
      { credit: 12.3 },
      { active: 'yes' },
      { visits: 1.5 },
      { visits: -1 },
      { visits: 2147483648 },
      { visits: '5' },
      { since: '2026-02-30' },
      { since: '22/11/2026' },
      { lastSeen: '2026-11-22T23:59:60Z' },
      { note: 'x'.repeat(1001) },
    ];
    for (const patch of bad) expect(create.safeParse({ ...valid, ...patch }).success).toBe(false);
    const good = [
      { email: 'a@b.co' },
      { email: 'a@b.c' },
      { ownerId: '00000000-0000-0000-0000-000000000000' },
      { tier: 'vip' },
      { credit: '12.30' },
      { credit: '-0.5' },
      { credit: '9999999999.99' },
      { active: false },
      { visits: 5 },
      { since: '2026-02-28' },
    ];
    for (const patch of good) expect(create.safeParse({ ...valid, ...patch }).success).toBe(true);
  });

  it('money is an object with a text amount, and the currency, when given, must be the one of the field', () => {
    expect(create.safeParse({ ...valid, balance: { amount: '12500' } }).success).toBe(true);
    expect(create.safeParse({ ...valid, balance: { amount: '12500', currency: 'VND' } }).success).toBe(true);
    expect(create.safeParse({ ...valid, balance: { amount: '12500', currency: 'USD' } }).success).toBe(false);
    expect(create.safeParse({ ...valid, balance: { currency: 'VND' } }).success).toBe(false);
    expect(create.safeParse({ ...valid, balance: { amount: '12.5' } }).success).toBe(false);
    expect(create.safeParse({ ...valid, balance: { amount: '1'.repeat(16) } }).success).toBe(false);
    expect(create.safeParse({ ...valid, balance: 12500 }).success).toBe(false);
  });

  it('an instant must be UTC with a Z, with or without milliseconds', () => {
    for (const ok of ['2026-11-22T10:00:00Z', '2026-11-22T10:00:00.123Z'])
      expect(create.safeParse({ ...valid, lastSeen: ok }).success).toBe(true);
    for (const bad of ['2026-11-22T10:00:00+07:00', '2026-11-22T10:00:00', '2026-11-22', 'now'])
      expect(create.safeParse({ ...valid, lastSeen: bad }).success).toBe(false);
  });

  it('is not a function of the order of keys', () => {
    expect(create.safeParse({ ownerId: OWNER, name: 'x', code: 'y' }).success).toBe(true);
  });

  it('refuses a value that is not an object', () => {
    for (const bad of [null, undefined, 'x', 5, []]) expect(create.safeParse(bad).success).toBe(false);
  });
});

describe('update', () => {
  it('needs at least one field', () => {
    expect(update.safeParse({}).success).toBe(false);
    expect(update.safeParse({ name: 'x' }).success).toBe(true);
  });

  it('keeps the checks of create, and does not fill in defaults', () => {
    expect(update.safeParse({ tier: 'platinum' }).success).toBe(false);
    expect(update.safeParse({ code: null }).success).toBe(false);
    expect(update.safeParse({ email: null }).success).toBe(true);
    expect(update.safeParse({ name: 'x' }).data).toEqual({ name: 'x' });
  });

  it('refuses unknown keys and the keys the server writes', () => {
    expect(update.safeParse({ name: 'x', id: OWNER }).success).toBe(false);
    expect(update.safeParse({ nope: 1 }).success).toBe(false);
  });

  it('turns NFD into NFC here too', () => {
    expect(update.safeParse({ name: 'Lê' }).data).toEqual({ name: 'Lê' });
  });
});

describe('read', () => {
  const row = {
    id: OWNER,
    version: 3,
    createdAt: '2026-11-22T10:00:00Z',
    updatedAt: '2026-11-22T10:00:00Z',
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    code: 'C-001',
    name: 'Công ty Lê',
    email: null,
    tier: 'standard',
    credit: null,
    balance: null,
    note: null,
    active: true,
    since: null,
    lastSeen: null,
    visits: 0,
    number: 'CUS-00001',
    status: 'new',
    score: 0,
    ownerId: OWNER,
  };

  it('accepts a row as the API sends it', () => {
    expect(read.safeParse(row).success).toBe(true);
  });

  it('requires every field, with null for an empty optional one', () => {
    const { email: _email, ...without } = row;
    expect(read.safeParse(without).success).toBe(false);
    expect(read.safeParse({ ...row, email: 'a@b.co' }).success).toBe(true);
  });

  it('lets unknown keys through, so an older client survives a newer server', () => {
    expect(read.safeParse({ ...row, addedLater: 1 }).success).toBe(true);
  });

  it('checks the state against the states of the machine', () => {
    expect(read.safeParse({ ...row, status: 'qualified' }).success).toBe(true);
    expect(read.safeParse({ ...row, status: 'lost' }).success).toBe(false);
  });
});

describe('custom fields (SCH-07)', () => {
  const asset = toZodMini(Asset, 'create');

  it('use the schema value that was given', () => {
    expect(asset.safeParse({ tag: 'ABC-1234' }).success).toBe(true);
    expect(asset.safeParse({ tag: 'abc-1234' }).success).toBe(false);
    expect(asset.safeParse({}).success).toBe(false);
  });
});

describe('use outside the entity API', () => {
  it('the create schema converts to JSON Schema 2020-12 for custom routes, NFC step included (SCH-01)', () => {
    const converted = z.toJSONSchema(create, { target: 'draft-2020-12', io: 'input' });
    expect(converted).toMatchObject({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' });
    expect(Object.keys((converted as { properties: object }).properties)).toContain('ownerId');
  });

  it('refuses a mode that does not exist', () => {
    // @ts-expect-error not a mode
    expect(() => toZodMini(Customer, 'delete')).toThrow(/mode/);
  });

  it('is deterministic: two calls accept and refuse the same inputs', () => {
    const again = toZodMini(Customer, 'create');
    for (const input of [valid, { ...valid, tier: 'x' }, {}])
      expect(again.safeParse(input).success).toBe(create.safeParse(input).success);
  });
});
