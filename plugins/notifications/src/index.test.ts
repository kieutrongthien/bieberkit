/**
 * BieberKit
 *
 * @file        plugins/notifications/src/index.test.ts
 * @description Tests of the notifications plugin: a user reads and marks only his own notifications, an administrator manages all of them (spec section 12, AUTHZ-02).
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
import plugin from './index.ts';

const URL_OF = '/api/v1/notifications/notifications';

const rowOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown> => Object(body['data']);

function rows(body: Readonly<Record<string, unknown>>): Record<string, unknown>[] {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
}

it('12 a user with read-own and update-own sees his notifications only, and marks one as read', async () => {
  const app = await createTestApp({
    modules: [plugin.module],
    roles: { member: ['notifications.read-own', 'notifications.update-own'] },
  });
  const me = app.newUser();
  const other = app.newUser();
  const admin = await app.actingAs(app.newUser(), ['admin']);
  const mine = await admin.post(URL_OF, { userId: me.id, title: 'Welcome' });
  await admin.post(URL_OF, { userId: other.id, title: 'Not for me' });
  expect(mine.status).toBe(201);
  const client = await app.actingAs(me, ['member']);
  const list = await client.get(URL_OF);
  expect(rows(list.body).map((row) => row['title'])).toEqual(['Welcome']);
  const read = await client.patch(
    `${URL_OF}/${String(rowOf(mine.body)['id'])}`,
    { readAt: new Date().toISOString() },
    Number(rowOf(mine.body)['version']),
  );
  expect(read.status).toBe(200);
  expect(rowOf(read.body)['readAt']).not.toBeNull();
  await app.close();
});

it('12 a user cannot create notifications, and cannot change those of another user', async () => {
  const app = await createTestApp({
    modules: [plugin.module],
    roles: { member: ['notifications.read-own', 'notifications.update-own'] },
  });
  const me = app.newUser();
  const other = app.newUser();
  const admin = await app.actingAs(app.newUser(), ['admin']);
  const theirs = await admin.post(URL_OF, { userId: other.id, title: 'Theirs' });
  const client = await app.actingAs(me, ['member']);
  expect((await client.post(URL_OF, { userId: me.id, title: 'x' })).status).toBe(403);
  const refused = await client.patch(
    `${URL_OF}/${String(rowOf(theirs.body)['id'])}`,
    { readAt: new Date().toISOString() },
    Number(rowOf(theirs.body)['version']),
  );
  expect([403, 404]).toContain(refused.status);
  await app.close();
});
