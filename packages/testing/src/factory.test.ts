/**
 * BieberKit
 *
 * @file        packages/testing/src/factory.test.ts
 * @description Tests of the factories: the values are valid for the entity, unique fields do not collide, parents are made, and rows are stored for the tenant (TST-02).
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
import { toZodMini } from '@bieberkit/data/schema';
import { createTestApp } from './app.ts';
import { Account, crm, Person, Tagged } from './fixtures.ts';

const rowsOf = (reply: { body: Readonly<Record<string, unknown>> }): number => {
  const data = reply.body['data'];
  return Array.isArray(data) ? data.length : -1;
};
const parses = (body: Record<string, unknown>): boolean => toZodMini(Account, 'create').safeParse(body).success;

describe('TST-02 factories', () => {
  it('TST-02 build gives a body that the create schema of the entity accepts, of every kind of field', async () => {
    const app = await createTestApp({ modules: [crm] });
    const factory = app.factory(Account);
    // A relation is not built, so the schema is given the parent that `create` would make.
    for (let i = 0; i < 25; i += 1) expect(parses(factory.build({ ownerId: app.newUser().id }))).toBe(true);
    await app.close();
  });

  it('TST-02 each build is different, so unique fields do not collide even when they are short', async () => {
    const app = await createTestApp({ modules: [crm] });
    const codes = new Set(Array.from({ length: 50 }, () => String(app.factory(Account).build()['code'])));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...[...codes].map((code) => code.length))).toBeLessThanOrEqual(8);
    await app.close();
  });

  it('TST-02 leaves out the fields that may be left out: optional, defaulted and the ones that the server fills', async () => {
    const app = await createTestApp({ modules: [crm] });
    const body = app.factory(Account).build();
    for (const key of ['note', 'rank', 'number', 'backupId', 'ownerId', 'id']) expect(body).not.toHaveProperty(key);
    await app.close();
  });

  it('TST-02 overrides win over the sample values', async () => {
    const app = await createTestApp({ modules: [crm] });
    expect(app.factory(Account).build({ name: 'Acme', rank: 9 })).toMatchObject({ name: 'Acme', rank: 9 });
    await app.close();
  });

  it('TST-02 create stores a row, makes the parent that a relation needs, and answers the row as the API shows it', async () => {
    const app = await createTestApp({ modules: [crm] });
    const account = await app.factory(Account).create({ name: 'Acme' });
    expect(account).toMatchObject({ name: 'Acme', version: 1, rank: 1 });
    expect(account['number']).toMatch(/^ACC-\d{4}$/);
    expect(typeof account['ownerId']).toBe('string');
    const owner = await app.factory(Person).create();
    const second = await app.factory(Account).create({ ownerId: owner['id'] });
    expect(second['ownerId']).toBe(owner['id']);
    await app.close();
  });

  it('TST-02 createMany stores that many rows, all different', async () => {
    const app = await createTestApp({ modules: [crm] });
    const rows = await app.factory(Account).createMany(4, { tier: 'vip' });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row['id'])).size).toBe(4);
    expect(rows.every((row) => row['tier'] === 'vip')).toBe(true);
    await app.close();
  });

  it('TST-02 rows are stored for the tenant of the view, and a view of another tenant does not see them', async () => {
    const app = await createTestApp({ modules: [crm], roles: { reader: ['crm.account.read'] } });
    const other = app.withTenant(app.newUser().id);
    await app.factory(Account).createMany(2);
    await other.factory(Account).createMany(3);
    const here = await (await app.actingAs(app.newUser(), ['reader'])).get('/api/v1/crm/accounts');
    const there = await (await other.actingAs(other.newUser(), ['reader'])).get('/api/v1/crm/accounts');
    expect([here.status, rowsOf(here)]).toEqual([200, 2]);
    expect([there.status, rowsOf(there)]).toEqual([200, 3]);
    await app.close();
  });

  it('TST-02 a field that holds a schema of the project needs a value, and the error says so', async () => {
    const app = await createTestApp({ modules: [crm] });
    expect(() => app.factory(Tagged).build()).toThrow(/custom field/);
    expect(app.factory(Tagged).build({ label: 'x' })).toEqual({ label: 'x' });
    await app.close();
  });

  it('TST-02 an entity that the app does not have is an error that names the fix', async () => {
    const app = await createTestApp({ modules: [] });
    expect(() => app.factory(Account)).toThrow(/not an entity of this app/);
    await app.close();
  });
});
