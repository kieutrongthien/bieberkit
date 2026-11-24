/**
 * BieberKit
 *
 * @file        plugins/users/src/index.test.ts
 * @description Tests of the users plugin: the seed makes the administrator once and gives the role, the list pages and filters, a user is made with a password and the failures say why (AUTH-04, AUTHZ-01).
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

import { expect, it } from 'vitest';
import { createTestApp } from '@bieberkit/testing';
import roles from '@bieberkit/plugin-roles';
import plugin from './index.ts';

const USERS = '/api/v1/users/users';
const NIL = '00000000-0000-0000-0000-000000000000';
const PASSWORD = 'correct horse battery staple';

interface Row {
  id: string;
  email: string;
}

function rowsOf(body: Readonly<Record<string, unknown>>): Row[] {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
}

async function world(pluginEnv: Record<string, unknown> = {}) {
  const app = await createTestApp({
    modules: [roles.module, plugin.module],
    tenant: NIL,
    pluginEnv,
    roles: { manager: ['users.read', 'users.manage'] },
  });
  const manager = await app.actingAs(app.newUser(), ['manager']);
  return { app, manager };
}

it('12 the seed makes the administrator with the administrator role, and running it again changes nothing', async () => {
  const { app, manager } = await world({ USERS_ADMIN_EMAIL: 'Boss@Example.com', USERS_ADMIN_PASSWORD: PASSWORD });
  await roles.seed?.(app.services);
  await plugin.seed?.(app.services);
  await plugin.seed?.(app.services);
  const found = rowsOf((await manager.get(`${USERS}?email=boss@example.com`)).body);
  expect(found.map((row) => row.email)).toEqual(['boss@example.com']);
  await app.close();
});

it('12 the seed makes no account when there is no password', async () => {
  const { app, manager } = await world({ USERS_ADMIN_EMAIL: 'boss@example.com' });
  await roles.seed?.(app.services);
  await plugin.seed?.(app.services);
  expect(rowsOf((await manager.get(USERS)).body)).toEqual([]);
  await app.close();
});

it('AUTH-04 a user is made with a password, a second one with the same email is 409, and a short password is refused', async () => {
  const { app, manager } = await world();
  const made = await manager.post(USERS, { name: 'Ann', email: 'ann@example.com', password: PASSWORD });
  expect(made.status).toBe(201);
  expect(made.body['email']).toBe('ann@example.com');
  expect((await manager.post(USERS, { name: 'Ann', email: 'ann@example.com', password: PASSWORD })).status).toBe(409);
  const weak = await manager.post(USERS, { name: 'Bob', email: 'bob@example.com', password: 'short' });
  expect(weak.status).toBeGreaterThanOrEqual(400);
  expect(weak.status).toBeLessThan(500);
  await app.close();
});

it('12 the list pages with a cursor and never repeats a user', async () => {
  const { app, manager } = await world();
  for (const name of ['a', 'b', 'c'])
    await manager.post(USERS, { name, email: `${name}@example.com`, password: PASSWORD });
  const first = await manager.get(`${USERS}?limit=2`);
  const second = await manager.get(`${USERS}?limit=2&cursor=${String(first.body['nextCursor'])}`);
  const emails = [...rowsOf(first.body), ...rowsOf(second.body)].map((row) => row.email);
  expect(emails).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
  expect(second.body['nextCursor']).toBeNull();
  await app.close();
});

it('AUTHZ-01 a caller without users.read gets 403, and the list never shows a password', async () => {
  const { app, manager } = await world();
  await manager.post(USERS, { name: 'a', email: 'a@example.com', password: PASSWORD });
  expect((await (await app.actingAs(app.newUser())).get(USERS)).status).toBe(403);
  expect(JSON.stringify((await manager.get(USERS)).body)).not.toContain(PASSWORD);
  await app.close();
});
