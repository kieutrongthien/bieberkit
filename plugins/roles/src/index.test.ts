/**
 * BieberKit
 *
 * @file        plugins/roles/src/index.test.ts
 * @description Tests of the roles plugin: the seed, create, change, assign and revoke in batches, delete with reassignment, duplicate, member counts and pages, the permission catalogue, effective permissions, the MFA warning and the escalation guard (AUTHZ-01, AUTHZ-05, ROL-01 to ROL-08).
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
import { assignRole, AuthUser } from '@bieberkit/auth';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { createTestApp } from '@bieberkit/testing';
import type { TestApp } from '@bieberkit/testing';
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

let counter = 0;

/** Makes a real account, so that assignments find the user. */
async function make(app: TestApp): Promise<string> {
  counter += 1;
  const made = await app.services.auth.api.signUpEmail({
    body: { email: `person-${String(counter)}@example.test`, password: 'correct horse battery staple', name: 'Person' },
  });
  return made.user.id;
}

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

it('AUTH-05 the seed asks no role for a second factor, the administrator role included', async () => {
  const { app, admin } = await world();
  await plugin.seed?.(app.services);
  const response = await admin.get(ROLES);
  const roles: { name: string; requireMfa: boolean }[] = Array.isArray(response.body['data'])
    ? response.body['data']
    : [];
  expect(roles.length).toBeGreaterThan(0);
  expect(roles.filter((role) => role.requireMfa)).toEqual([]);
  await app.close();
});

it('ROL-06 the PATCH of a system role takes requireMfa from a holder of the administrator role, and from nobody else', async () => {
  const { app, admin } = await world();
  await plugin.seed?.(app.services);
  const system = rolesOf((await admin.get(ROLES)).body).find((role) => role.system);
  const id = String(system?.id);
  const refused = await admin.patch(`${ROLES}/${id}`, { requireMfa: true }, 0);
  expect([refused.status, refused.body['code']]).toEqual([403, 'ROLES_ESCALATION']);

  const userId = await make(app);
  await assignRole(app.db, { userId, roleId: id });
  await runInUnitOfWork(app.db, (em) => em.nativeUpdate(AuthUser, { id: userId }, { twoFactorEnabled: true }));
  const holder = await app.actingAs(userId, ['manager']);
  const renamed = await holder.patch(`${ROLES}/${id}`, { name: 'boss' }, 0);
  expect([renamed.status, renamed.body['code']]).toEqual([409, 'AUTH_ROLE_SYSTEM']);
  const mixed = await holder.patch(`${ROLES}/${id}`, { requireMfa: true, permissions: ['roles.read'] }, 0);
  expect([mixed.status, mixed.body['code']]).toEqual([409, 'AUTH_ROLE_SYSTEM']);
  // A request that is refused writes nothing, not the part of it that would have been allowed.
  expect((await admin.get(`${ROLES}/${id}`)).body['requireMfa']).toBe(false);
  const changed = await holder.patch(`${ROLES}/${id}`, { requireMfa: true }, 0);
  expect([changed.status, changed.body['requireMfa']]).toEqual([200, true]);
  await app.close();
});

it('AUTHZ-01 a role is created with permissions, changed, given to a user and deleted', async () => {
  const { app, admin } = await world();
  const created = await admin.post(ROLES, { name: 'editor', permissions: ['roles.read'] });
  expect(created.status).toBe(201);
  const id = String(created.body['id']);
  const userId = await make(app);
  const changed = await admin.post(`${ROLES}/${id}/assign`, { userIds: [userId] });
  expect(changed.body).toEqual({ results: [{ userId, result: 'assigned' }] });
  expect((await admin.post(`${ROLES}/${id}/revoke`, { userIds: [userId] })).body).toEqual({
    results: [{ userId, result: 'revoked' }],
  });
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

it('ROL-04 the catalogue lists each permission with its module, resource and action, and a caller without roles.read gets 403', async () => {
  const { app, admin } = await world();
  const catalogue = await admin.get('/api/v1/roles/permissions');
  expect(catalogue.body['data']).toEqual(
    expect.arrayContaining([
      { name: 'roles.read', module: 'roles', resource: null, action: 'read' },
      { name: 'roles.manage', module: 'roles', resource: null, action: 'manage' },
    ]),
  );
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

it('ROL-01 a role has its member count, and its members are paged', async () => {
  const { app, admin } = await world();
  const id = String((await admin.post(ROLES, { name: 'sales', permissions: ['roles.read'] })).body['id']);
  const userIds = [await make(app), await make(app), await make(app)];
  await admin.post(`${ROLES}/${id}/assign`, { userIds });
  expect((await admin.get(`${ROLES}/${id}`)).body).toMatchObject({ id, name: 'sales', memberCount: 3 });
  const page = await admin.get(`${ROLES}/${id}/members?pageSize=2`);
  expect(rolesOf(page.body)).toHaveLength(2);
  expect(page.body['meta']).toMatchObject({ pageSize: 2, nextCursor: expect.any(String) });
  expect((await admin.get(`${ROLES}/00000000-0000-7000-8000-000000000000`)).status).toBe(404);
  await app.close();
});

it('ROL-02 assign takes at most 100 users', async () => {
  const { app, admin } = await world();
  const id = String((await admin.post(ROLES, { name: 'sales' })).body['id']);
  const many = Array.from({ length: 101 }, () => app.newUser().id);
  expect((await admin.post(`${ROLES}/${id}/assign`, { userIds: many })).status).toBe(400);
  expect((await admin.post(`${ROLES}/${id}/assign`, { userIds: [] })).status).toBe(400);
  const one = await admin.post(`${ROLES}/${id}/assign`, { userIds: [await make(app)] });
  expect([one.status, Array.isArray(one.body['results'])]).toEqual([200, true]);
  await app.close();
});

it('ROL-03 duplicate copies the permissions under a new name', async () => {
  const { app, admin } = await world();
  const id = String((await admin.post(ROLES, { name: 'sales', permissions: ['roles.read'] })).body['id']);
  const copy = await admin.post(`${ROLES}/${id}/duplicate`, { name: 'sales 2' });
  expect(copy.status).toBe(201);
  expect(copy.body).toMatchObject({ name: 'sales 2', system: false, permissions: ['roles.read'] });
  await app.close();
});

it('ROL-06 a role in use is deleted only with reassignTo', async () => {
  const { app, admin } = await world();
  const old = String((await admin.post(ROLES, { name: 'old' })).body['id']);
  const target = String((await admin.post(ROLES, { name: 'new' })).body['id']);
  await admin.post(`${ROLES}/${old}/assign`, { userIds: [await make(app)] });
  const refused = await admin.delete(`${ROLES}/${old}`, 0);
  expect([refused.status, refused.body['code']]).toEqual([409, 'ROLES_IN_USE']);
  expect((await admin.delete(`${ROLES}/${old}?reassignTo=${target}`, 0)).status).toBe(204);
  expect((await admin.get(`${ROLES}/${target}`)).body['memberCount']).toBe(1);
  await app.close();
});

it('ROL-07 assigning a role that needs MFA warns about a user without a second factor', async () => {
  const { app, admin } = await world();
  const id = String((await admin.post(ROLES, { name: 'strict', requireMfa: true })).body['id']);
  const userId = await make(app);
  const given = await admin.post(`${ROLES}/${id}/assign`, { userIds: [userId] });
  expect(given.body).toEqual({ results: [{ userId, result: 'assigned', warning: 'AUTH_MFA_ENROL_REQUIRED' }] });
  await app.close();
});

it('ROL-08 a manager cannot make a role with a permission that they do not hold', async () => {
  const { app, admin } = await world();
  const refused = await admin.post(ROLES, { name: 'wide', permissions: ['users.delete-everything'] });
  expect([refused.status, refused.body['code']]).toEqual([403, 'ROLES_ESCALATION']);
  await app.close();
});

it('POL-03 a role is made ip-restricted, shown, changed and duplicated with the flag', async () => {
  const { app, admin } = await world();
  const made = await admin.post(ROLES, { name: 'office', ipRestricted: true });
  expect(made.body).toMatchObject({ name: 'office', ipRestricted: true, requireMfa: false });
  const id = String(made.body['id']);
  expect((await admin.post(ROLES, { name: 'plain' })).body['ipRestricted']).toBe(false);
  const copy = await admin.post(`${ROLES}/${id}/duplicate`, { name: 'office-copy' });
  expect(copy.body['ipRestricted']).toBe(true);
  const changed = await admin.patch(`${ROLES}/${id}`, { ipRestricted: false }, 0);
  expect(changed.body['ipRestricted']).toBe(false);
  await app.close();
});
