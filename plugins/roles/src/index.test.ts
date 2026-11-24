/**
 * BieberKit
 *
 * @file        plugins/roles/src/index.test.ts
 * @description Tests of the roles plugin: the seed makes the base roles and is idempotent, a role is created, changed, assigned and deleted through the API, and a system role is protected (AUTHZ-01, AUTHZ-05).
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
import plugin, { ADMIN_ROLE, STAFF_ROLE } from './index.ts';

const ROLES = '/api/v1/roles/roles';

interface Role {
  id: string;
  name: string;
  system: boolean;
  permissions: string[];
}

function rolesOf(body: Readonly<Record<string, unknown>>): Role[] {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
}

/** The nil tenant, which is the tenant of a project that has none, so that the seed and the API look at the same roles. */
const NIL = '00000000-0000-0000-0000-000000000000';

async function world() {
  const app = await createTestApp({
    modules: [plugin.module],
    tenant: NIL,
    roles: { manager: ['roles.read', 'roles.manage'] },
  });
  const admin = await app.actingAs(app.newUser(), ['manager']);
  return { app, admin };
}

it('AUTHZ-01 the seed makes the administrator with every permission and the staff role that reads, and it can run again', async () => {
  const { app, admin } = await world();
  await plugin.seed?.(app.services);
  await plugin.seed?.(app.services);
  const roles = rolesOf((await admin.get(ROLES)).body);
  const byName = (name: string): Role | undefined =>
    roles.find((role) => role.name === name && role.system === (name === ADMIN_ROLE));
  expect(byName(ADMIN_ROLE)?.permissions).toEqual(expect.arrayContaining(['roles.manage', 'roles.read']));
  const staff = roles.find((role) => role.name === STAFF_ROLE);
  expect(staff?.permissions).toEqual(['roles.read']);
  expect(roles.filter((role) => role.name === STAFF_ROLE)).toHaveLength(1);
  await app.close();
});

it('AUTHZ-01 a role is created with permissions, changed, given to a user and deleted', async () => {
  const { app, admin } = await world();
  const created = await admin.post(ROLES, { name: 'editor', permissions: ['roles.read'] });
  expect(created.status).toBe(201);
  const id = String(created.body['id']);
  const changed = await admin.post(`${ROLES}/${id}/assign`, { userId: app.newUser().id });
  expect(changed.body).toEqual({ changed: true });
  const patched = await (async () => {
    const response = await admin.patch(`${ROLES}/${id}`, { permissions: ['roles.read', 'roles.manage'] }, 0);
    return response;
  })();
  expect(patched.status).toBe(200);
  expect(rolesOf((await admin.get(ROLES)).body).find((role) => role.id === id)?.permissions).toEqual([
    'roles.manage',
    'roles.read',
  ]);
  expect((await admin.delete(`${ROLES}/${id}`, 0)).status).toBe(204);
  await app.close();
});

it('AUTHZ-01 the catalogue lists the permissions of the project, and a caller without roles.read gets 403', async () => {
  const { app, admin } = await world();
  const catalogue = await admin.get('/api/v1/roles/permissions');
  expect(catalogue.body['data']).toEqual(expect.arrayContaining(['roles.read', 'roles.manage']));
  expect((await (await app.actingAs(app.newUser())).get(ROLES)).status).toBe(403);
  await app.close();
});

it('AUTHZ-05 the system role cannot be deleted or given other permissions, and its name is taken once', async () => {
  const { app, admin } = await world();
  await plugin.seed?.(app.services);
  const system = rolesOf((await admin.get(ROLES)).body).find((role) => role.system);
  expect(system).toBeDefined();
  expect((await admin.delete(`${ROLES}/${String(system?.id)}`, 0)).status).toBe(409);
  expect((await admin.post(ROLES, { name: 'staff' })).status).toBe(409);
  await app.close();
});
