/**
 * BieberKit
 *
 * @file        plugins/settings/src/index.test.ts
 * @description Tests of the settings plugin: an administrator manages settings, a reader reads them, a key is unique, and nobody without a permission gets in (spec section 12).
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

const URL_OF = '/api/v1/settings/settings';

const rowOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown> => Object(body['data']);

it('12 the plugin names its table, its permissions and its entity', () => {
  expect(plugin.name).toBe('@bieberkit/plugin-settings');
  expect(plugin.permissions).toEqual(['settings.read', 'settings.manage']);
  expect(Object.keys(plugin.module.contributions)).toContain('entities');
});

it('12 an administrator creates, reads, changes and removes a setting, and the key is unique', async () => {
  const app = await createTestApp({ modules: [plugin.module] });
  const admin = await app.actingAs(app.newUser(), ['admin']);
  const created = await admin.post(URL_OF, { key: 'site.name', value: 'Demo' });
  expect(created.status).toBe(201);
  expect((await admin.post(URL_OF, { key: 'site.name', value: 'Other' })).status).toBe(409);
  const id = String(rowOf(created.body)['id']);
  const changed = await admin.patch(`${URL_OF}/${id}`, { value: 'Renamed' }, Number(rowOf(created.body)['version']));
  expect(changed.status).toBe(200);
  expect(rowOf((await admin.get(`${URL_OF}/${id}`)).body)['value']).toBe('Renamed');
  expect((await admin.delete(`${URL_OF}/${id}`, Number(rowOf(changed.body)['version']))).status).toBe(204);
  await app.close();
});

it('12 a reader reads the settings and cannot change them, and a caller with no role reads nothing', async () => {
  const app = await createTestApp({ modules: [plugin.module], roles: { reader: ['settings.read'] } });
  const admin = await app.actingAs(app.newUser(), ['admin']);
  await admin.post(URL_OF, { key: 'a', value: '1' });
  const reader = await app.actingAs(app.newUser(), ['reader']);
  expect((await reader.get(URL_OF)).status).toBe(200);
  expect((await reader.post(URL_OF, { key: 'b', value: '2' })).status).toBe(403);
  expect((await (await app.actingAs(app.newUser())).get(URL_OF)).status).toBe(403);
  expect((await app.anonymous().get(URL_OF)).status).toBe(401);
  await app.close();
});
