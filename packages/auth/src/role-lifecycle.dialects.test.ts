/**
 * BieberKit
 *
 * @file        packages/auth/src/role-lifecycle.dialects.test.ts
 * @description Tests of the role service for the roles plugin: member counts and pages, batch assign and revoke, duplicate, delete with reassignment, the MFA warning, effective permissions and the escalation guard (ROL-01 to ROL-08).
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
import { requestContext } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import type { ScopedPermission } from './ability.ts';
import { loadGrants } from './roles.ts';
import {
  assignRole,
  assignRoles,
  createRole,
  deleteRole,
  duplicateRole,
  effectivePermissions,
  getRole,
  listMembers,
  revokeRoles,
  setRolePermissions,
  updateRole,
} from './role-service.ts';
import { authServer } from './testing/auth-server.ts';
import type { AuthServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

/** Runs a change as `userId`, the way a request does. */
const as = <T>(userId: string, run: () => Promise<T>): Promise<T> =>
  requestContext.run({ requestId: uuid7(), userId }, run);

async function world(open: Parameters<typeof authServer>[0]) {
  const app = await authServer(open);
  const adminRole = await createRole(app.db, { name: 'admin', permissions: ['roles.manage'], system: true });
  const admin = await app.login('admin@example.test');
  await assignRole(app.db, { userId: admin.id, roleId: adminRole });
  return { app, adminRole, admin };
}

/** Users who exist and hold nothing. Only signed up, not signed in: each password hash is the slow part, and these need no session. */
async function people(app: AuthServer, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const user = (await app.signUp(`p${String(index)}@example.test`)).body['user'];
    ids.push(String(Reflect.get(Object(user), 'id')));
  }
  return ids;
}

describeDialects('ROL the role service', ({ open }) => {
  it('ROL-01 a role has its member count, and its members are paged with a cursor', async () => {
    const { app } = await world(open);
    const role = await createRole(app.db, { name: 'sales', permissions: ['crm.deal.read'] });
    const ids = await people(app, 3);
    for (const userId of ids) await assignRole(app.db, { userId, roleId: role });
    expect(await getRole(app.db, role)).toMatchObject({ id: role, name: 'sales', memberCount: 3 });
    const first = await listMembers(app.db, role, { pageSize: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.data[0]).toEqual({ id: expect.any(String), name: 'Test User', email: expect.any(String) });
    const second = await listMembers(app.db, role, { pageSize: 2, cursor: first.nextCursor ?? '' });
    expect([...first.data, ...second.data].map((member) => member.id).toSorted()).toEqual(ids.toSorted());
    expect(second.nextCursor).toBeNull();
  });

  it('ROL-02 assign and revoke take up to 100 users and give a result for each', async () => {
    const { app, admin } = await world(open);
    const role = await createRole(app.db, { name: 'sales', permissions: ['crm.deal.read'] });
    const [a, b] = await people(app, 2);
    const unknown = uuid7();
    await assignRole(app.db, { userId: a ?? '', roleId: role });
    const assigned = await as(admin.id, () =>
      assignRoles(app.db, { roleId: role, userIds: [a ?? '', b ?? '', unknown] }),
    );
    expect(assigned.results).toEqual([
      { userId: a, result: 'unchanged' },
      { userId: b, result: 'assigned' },
      { userId: unknown, result: 'not_found' },
    ]);
    const revoked = await as(admin.id, () => revokeRoles(app.db, { roleId: role, userIds: [a ?? '', unknown] }));
    expect(revoked.results).toEqual([
      { userId: a, result: 'revoked' },
      { userId: unknown, result: 'unchanged' },
    ]);
    await expect(
      as(admin.id, () => assignRoles(app.db, { roleId: role, userIds: Array.from({ length: 101 }, () => uuid7()) })),
    ).rejects.toMatchObject({ code: 'AUTH_ROLE_INVALID', status: 400 });
  });

  it('ROL-02 a refused id in a batch does not undo the others', async () => {
    const { app, adminRole, admin } = await world(open);
    const [other] = await people(app, 1);
    await assignRole(app.db, { userId: other ?? '', roleId: adminRole });
    const helper = (await app.login('helper@example.test')).id;
    await assignRole(app.db, { userId: helper, roleId: adminRole });
    // The helper takes the role from the other holder and from themselves: the second is a self action.
    const revoked = await as(helper, () => revokeRoles(app.db, { roleId: adminRole, userIds: [other ?? '', helper] }));
    expect(revoked.results).toEqual([
      { userId: other, result: 'revoked' },
      { userId: helper, result: 'refused', code: 'USERS_SELF_ACTION' },
    ]);
    expect((await getRole(app.db, adminRole)).memberCount).toBe(2);
    expect(admin.id).not.toBe(helper);
  });

  it('ROL-03 duplicate makes a new role, not a system one, with the same permissions and the given name', async () => {
    const { app, adminRole, admin } = await world(open);
    const copy = await as(admin.id, () => duplicateRole(app.db, adminRole, { name: 'admin copy' }));
    const role = await getRole(app.db, copy);
    expect(role).toMatchObject({ name: 'admin copy', system: false, permissions: ['roles.manage'], memberCount: 0 });
    await expect(as(admin.id, () => duplicateRole(app.db, adminRole, { name: 'admin copy' }))).rejects.toMatchObject({
      code: 'AUTH_ROLE_EXISTS',
    });
    expect((await app.audit()).map((entry) => entry.action)).toContain('auth.role.created');
  });

  it('ROL-05 effective permissions list the roles that grant each one and the condition of a scoped one', async () => {
    const { app } = await world(open);
    const [user] = await people(app, 1);
    const reader = await createRole(app.db, { name: 'reader', permissions: ['crm.deal.read', 'crm.deal.read-own'] });
    const writer = await createRole(app.db, { name: 'writer', permissions: ['crm.deal.read', 'crm.deal.update'] });
    await assignRole(app.db, { userId: user ?? '', roleId: reader });
    await assignRole(app.db, { userId: user ?? '', roleId: writer });
    const scoped: Record<string, ScopedPermission> = {
      'crm.deal.read-own': { subject: 'crm.Deal', action: 'read', when: (who) => ({ ownerId: who.id }) },
    };
    const found = await effectivePermissions(app.db, { userId: user ?? '', scoped });
    expect(found).toEqual([
      {
        permission: 'crm.deal.read',
        roles: [
          { id: reader, name: 'reader' },
          { id: writer, name: 'writer' },
        ],
      },
      {
        permission: 'crm.deal.read-own',
        roles: [{ id: reader, name: 'reader' }],
        condition: { ownerId: user },
      },
      { permission: 'crm.deal.update', roles: [{ id: writer, name: 'writer' }] },
    ]);
  });

  it('ROL-06 a role with members is not deleted, unless the members are moved to another role', async () => {
    const { app, admin } = await world(open);
    const old = await createRole(app.db, { name: 'old', permissions: [] });
    const target = await createRole(app.db, { name: 'new', permissions: [] });
    const ids = await people(app, 2);
    for (const userId of ids) await assignRole(app.db, { userId, roleId: old });
    await expect(as(admin.id, () => deleteRole(app.db, old))).rejects.toMatchObject({
      code: 'ROLES_IN_USE',
      status: 409,
      extensions: { memberCount: 2 },
    });
    await as(admin.id, () => deleteRole(app.db, old, { reassignTo: target }));
    expect((await getRole(app.db, target)).memberCount).toBe(2);
    await expect(getRole(app.db, old)).rejects.toMatchObject({ code: 'AUTH_ROLE_NOT_FOUND' });
    // A role without members is deleted as before.
    const empty = await createRole(app.db, { name: 'empty', permissions: [] });
    await as(admin.id, () => deleteRole(app.db, empty));
  });

  it('ROL-07 a role that needs MFA is given to a user without a second factor, with a warning', async () => {
    const { app, admin } = await world(open);
    const strict = await createRole(app.db, { name: 'strict', permissions: [], requireMfa: true });
    const [user] = await people(app, 1);
    const assigned = await as(admin.id, () => assignRoles(app.db, { roleId: strict, userIds: [user ?? ''] }));
    expect(assigned.results).toEqual([{ userId: user, result: 'assigned', warning: 'AUTH_MFA_ENROL_REQUIRED' }]);
    expect((await loadGrants(app.db, undefined, user ?? '')).requireMfa).toBe(true);
  });

  it('ROL-08 nobody makes, changes, copies or gives a role with permissions that they do not hold', async () => {
    const { app } = await world(open);
    const manager = (await app.login('manager@example.test')).id;
    const own = await createRole(app.db, { name: 'manager', permissions: ['roles.manage', 'crm.deal.read'] });
    await assignRole(app.db, { userId: manager, roleId: own });
    const broad = await createRole(app.db, { name: 'broad', permissions: ['crm.deal.delete'] });
    const [user] = await people(app, 1);

    await expect(
      as(manager, () => createRole(app.db, { name: 'x', permissions: ['crm.deal.delete'] })),
    ).rejects.toMatchObject({ code: 'ROLES_ESCALATION', status: 403 });
    const narrow = await as(manager, () => createRole(app.db, { name: 'narrow', permissions: ['crm.deal.read'] }));
    await expect(as(manager, () => setRolePermissions(app.db, narrow, ['crm.deal.delete']))).rejects.toMatchObject({
      code: 'ROLES_ESCALATION',
    });
    await expect(as(manager, () => duplicateRole(app.db, broad, { name: 'copy' }))).rejects.toMatchObject({
      code: 'ROLES_ESCALATION',
    });
    const given = await as(manager, () => assignRoles(app.db, { roleId: broad, userIds: [user ?? ''] }));
    expect(given.results).toEqual([{ userId: user, result: 'refused', code: 'ROLES_ESCALATION' }]);
    // Renaming does not grant anything, so it is not an escalation.
    await as(manager, () => updateRole(app.db, narrow, { name: 'narrower' }));
    const denied = (await app.audit()).filter((entry) => entry.action === 'authz.denied');
    expect(denied.length).toBeGreaterThanOrEqual(4);
    expect(denied.every((entry) => entry.actorId === manager)).toBe(true);
  });

  it('ROL-08 a holder of the administrator role may do anything, and a system role is given only by its holder', async () => {
    const { app, adminRole, admin } = await world(open);
    const manager = (await app.login('manager@example.test')).id;
    const own = await createRole(app.db, { name: 'manager', permissions: ['roles.manage'] });
    await assignRole(app.db, { userId: manager, roleId: own });
    await as(admin.id, () => createRole(app.db, { name: 'anything', permissions: ['crm.deal.delete'] }));
    const [user] = await people(app, 1);
    const refused = await as(manager, () => assignRoles(app.db, { roleId: adminRole, userIds: [user ?? ''] }));
    expect(refused.results).toEqual([{ userId: user, result: 'refused', code: 'ROLES_ESCALATION' }]);
    const allowed = await as(admin.id, () => assignRoles(app.db, { roleId: adminRole, userIds: [user ?? ''] }));
    expect(allowed.results[0]).toMatchObject({ result: 'assigned' });
  });

  it('ROL-08 the system (a seeder) is not an escalation', async () => {
    const { app } = await world(open);
    await expect(createRole(app.db, { name: 'seeded', permissions: ['anything.at.all'] })).resolves.toEqual(
      expect.any(String),
    );
  });
});
