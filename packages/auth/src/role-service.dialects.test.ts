/**
 * BieberKit
 *
 * @file        packages/auth/src/role-service.dialects.test.ts
 * @description Tests of the service that changes roles: every change is one transaction with its audit entry and its outbox event, and a system role cannot be changed (AUTHZ-05, MOD-16).
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
import { AuditLog, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { loadGrants, NIL_TENANT } from './roles.ts';
import { assignRole, createRole, deleteRole, revokeRole, setRolePermissions, updateRole } from './role-service.ts';
import { describeDialects } from './testing/dialects.ts';

const TENANT = uuid7();
const OTHER = uuid7();
const ACTOR = uuid7();

/** Runs a change as the user `ACTOR`, the way a request does. */
const asActor = <T>(run: () => Promise<T>): Promise<T> =>
  requestContext.run({ requestId: uuid7(), userId: ACTOR, tenantId: TENANT }, run);

async function entries(db: Database) {
  return runInUnitOfWork(db, async (em) => {
    const found = await em.find(AuditLog, {}, { orderBy: { at: 'asc' } });
    return found
      .filter((row) => row.action.startsWith('auth.role.'))
      .map((row) => ({
        action: row.action,
        actorId: row.actorId ?? null,
        tenant: row.tenant ?? null,
        recordId: row.recordId ?? null,
        data: row.data === null || row.data === undefined ? null : JSON.parse(row.data),
      }));
  });
}

const events = async (db: Database): Promise<string[]> =>
  (await db.orm.em.getConnection().execute('select event from bieberkit_outbox order by created_at')).map(
    (row: { event: string }) => row.event,
  );

describeDialects('AUTHZ-05 the service of roles', ({ open }) => {
  it('AUTHZ-05 a new role has its permissions, an audit entry with the actor and the tenant, and an outbox event, together', async () => {
    const db = await open([]);
    const id = await asActor(() =>
      createRole(db, { tenantId: TENANT, name: 'sales', permissions: ['crm.deal.read', 'crm.deal.update'] }),
    );
    const user = uuid7();
    await assignRole(db, { tenantId: TENANT, userId: user, roleId: id });
    expect([...(await loadGrants(db, TENANT, user)).permissions].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'crm.deal.read',
      'crm.deal.update',
    ]);
    const [entry] = await entries(db);
    expect(entry).toMatchObject({ action: 'auth.role.created', actorId: ACTOR, tenant: TENANT, recordId: id });
    expect(entry?.data).toMatchObject({
      name: 'sales',
      permissions: ['crm.deal.read', 'crm.deal.update'],
      requireMfa: false,
    });
    expect(await events(db)).toContain('auth.role.created');
  });

  it('AUTHZ-05 a role with no tenant belongs to the nil tenant, and a user without a tenant gets its permissions', async () => {
    const db = await open([]);
    const id = await createRole(db, { name: 'docs', permissions: ['system.api-docs'] });
    const user = uuid7();
    await assignRole(db, { userId: user, roleId: id });
    expect((await entries(db))[0]?.tenant).toBe(NIL_TENANT);
    expect((await loadGrants(db, undefined, user)).permissions).toEqual(new Set(['system.api-docs']));
  });

  it('AUTHZ-05 refuses a name that the tenant has already, and writes nothing', async () => {
    const db = await open([]);
    await createRole(db, { tenantId: TENANT, name: 'sales' });
    await expect(createRole(db, { tenantId: TENANT, name: 'sales' })).rejects.toMatchObject({
      code: 'AUTH_ROLE_EXISTS',
      status: 409,
    });
    expect(await entries(db)).toHaveLength(1);
    await expect(createRole(db, { tenantId: OTHER, name: 'sales' })).resolves.toBeTypeOf('string');
  });

  it('AUTHZ-05 refuses a blank name, a blank permission and too many permissions', async () => {
    const db = await open([]);
    await expect(createRole(db, { tenantId: TENANT, name: '  ' })).rejects.toMatchObject({
      code: 'AUTH_ROLE_INVALID',
      status: 400,
    });
    await expect(createRole(db, { tenantId: TENANT, name: 'x', permissions: ['ok', ' '] })).rejects.toMatchObject({
      code: 'AUTH_ROLE_INVALID',
    });
    await expect(
      createRole(db, { tenantId: TENANT, name: 'y', permissions: Array.from({ length: 501 }, (_, n) => `p.${n}`) }),
    ).rejects.toMatchObject({ code: 'AUTH_ROLE_INVALID' });
    expect(await entries(db)).toEqual([]);
  });

  it('AUTHZ-05 a change of the permissions says what was added and what was removed, and a change that changes nothing leaves nothing', async () => {
    const db = await open([]);
    const id = await createRole(db, { tenantId: TENANT, name: 'sales', permissions: ['a.read', 'a.update'] });
    expect(await asActor(() => setRolePermissions(db, id, ['a.update', 'a.delete']))).toBe(true);
    expect(await setRolePermissions(db, id, ['a.delete', 'a.update'])).toBe(false);
    const changes = (await entries(db)).filter((entry) => entry.action === 'auth.role.updated');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.data).toEqual({ added: ['a.delete'], removed: ['a.read'] });
    const user = uuid7();
    await assignRole(db, { tenantId: TENANT, userId: user, roleId: id });
    expect([...(await loadGrants(db, TENANT, user)).permissions].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'a.delete',
      'a.update',
    ]);
  });

  it('AUTHZ-05 a rename and the flag of MFA are changes of the role, and the new name must be free', async () => {
    const db = await open([]);
    const id = await createRole(db, { tenantId: TENANT, name: 'sales' });
    await createRole(db, { tenantId: TENANT, name: 'ops' });
    expect(await updateRole(db, id, { name: 'sales-team', requireMfa: true })).toBe(true);
    expect(await updateRole(db, id, { name: 'sales-team' })).toBe(false);
    await expect(updateRole(db, id, { name: 'ops' })).rejects.toMatchObject({ code: 'AUTH_ROLE_EXISTS' });
    const [change] = (await entries(db)).filter((entry) => entry.action === 'auth.role.updated');
    expect(change?.data).toEqual({ name: 'sales-team', requireMfa: true });
    const user = uuid7();
    await assignRole(db, { tenantId: TENANT, userId: user, roleId: id });
    expect((await loadGrants(db, TENANT, user)).requireMfa).toBe(true);
  });

  it('AUTHZ-05 deleting a role takes its permissions and assignments with it, and says how many users lost it', async () => {
    const db = await open([]);
    const id = await createRole(db, { tenantId: TENANT, name: 'sales', permissions: ['a.read'] });
    const [one, two] = [uuid7(), uuid7()];
    await assignRole(db, { tenantId: TENANT, userId: one, roleId: id });
    await assignRole(db, { tenantId: TENANT, userId: two, roleId: id });
    await asActor(() => deleteRole(db, id));
    expect((await loadGrants(db, TENANT, one)).permissions.size).toBe(0);
    expect(await db.orm.em.getConnection().execute('select * from auth_role_permissions')).toEqual([]);
    const gone = (await entries(db)).find((entry) => entry.action === 'auth.role.deleted');
    expect(gone?.data).toMatchObject({ name: 'sales', users: 2 });
    await expect(deleteRole(db, id)).rejects.toMatchObject({ code: 'AUTH_ROLE_NOT_FOUND', status: 404 });
  });

  it('AUTHZ-05 a system role cannot be renamed, deleted or given other permissions, but it can be given to a user', async () => {
    const db = await open([]);
    const id = await createRole(db, {
      tenantId: TENANT,
      name: 'administrator',
      permissions: ['a.read'],
      system: true,
      requireMfa: true,
    });
    await expect(deleteRole(db, id)).rejects.toMatchObject({ code: 'AUTH_ROLE_SYSTEM', status: 409 });
    await expect(updateRole(db, id, { name: 'boss' })).rejects.toMatchObject({ code: 'AUTH_ROLE_SYSTEM' });
    await expect(updateRole(db, id, { requireMfa: false })).rejects.toMatchObject({ code: 'AUTH_ROLE_SYSTEM' });
    await expect(setRolePermissions(db, id, [])).rejects.toMatchObject({ code: 'AUTH_ROLE_SYSTEM' });
    const user = uuid7();
    expect(await assignRole(db, { tenantId: TENANT, userId: user, roleId: id })).toBe(true);
    expect((await loadGrants(db, TENANT, user)).requireMfa).toBe(true);
  });

  it('AUTHZ-05 giving a role is audited, and giving it twice, or taking it from a user who has not got it, leaves nothing', async () => {
    const db = await open([]);
    const id = await createRole(db, { tenantId: TENANT, name: 'sales' });
    const user = uuid7();
    expect(await asActor(() => assignRole(db, { tenantId: TENANT, userId: user, roleId: id }))).toBe(true);
    expect(await assignRole(db, { tenantId: TENANT, userId: user, roleId: id })).toBe(false);
    expect(await revokeRole(db, { tenantId: TENANT, userId: uuid7(), roleId: id })).toBe(false);
    expect(await asActor(() => revokeRole(db, { tenantId: TENANT, userId: user, roleId: id }))).toBe(true);
    const actions = (await entries(db)).map((entry) => entry.action);
    expect(actions).toEqual(['auth.role.created', 'auth.role.assigned', 'auth.role.revoked']);
    const assigned = (await entries(db))[1];
    expect(assigned?.data).toEqual({ userId: user });
    expect((await loadGrants(db, TENANT, user)).roles).toEqual([]);
  });

  it('AUTHZ-05 a role cannot be given in another tenant than its own, and an unknown role is 404', async () => {
    const db = await open([]);
    const id = await createRole(db, { tenantId: TENANT, name: 'sales' });
    await expect(assignRole(db, { tenantId: OTHER, userId: uuid7(), roleId: id })).rejects.toMatchObject({
      code: 'AUTH_ROLE_NOT_FOUND',
      status: 404,
    });
    await expect(assignRole(db, { tenantId: TENANT, userId: uuid7(), roleId: uuid7() })).rejects.toMatchObject({
      code: 'AUTH_ROLE_NOT_FOUND',
    });
    await expect(setRolePermissions(db, uuid7(), ['a'])).rejects.toMatchObject({ code: 'AUTH_ROLE_NOT_FOUND' });
  });

  it('AUTHZ-05 a failure of the outbox takes back the change: no role, no permission, no audit entry', async () => {
    const db = await open([]);
    await db.orm.em.getConnection().execute('drop table bieberkit_outbox');
    await expect(createRole(db, { tenantId: TENANT, name: 'sales', permissions: ['a.read'] })).rejects.toBeInstanceOf(
      Error,
    );
    expect(await db.orm.em.getConnection().execute('select * from auth_roles')).toEqual([]);
    expect(await db.orm.em.getConnection().execute('select * from auth_role_permissions')).toEqual([]);
    expect(await entries(db)).toEqual([]);
  });
});
