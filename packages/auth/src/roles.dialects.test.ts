/**
 * BieberKit
 *
 * @file        packages/auth/src/roles.dialects.test.ts
 * @description Tests of the roles tables and of the grants of a caller: the steps that make them, the tenant of a role and the union of permissions (AUTHZ-01, AUTHZ-04, DATA-24).
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
import { uuid7 } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import {
  AUTH_PLUGIN,
  AuthRole,
  AuthRolePermission,
  AuthUserRole,
  authEntities,
  authMigrationSteps,
  loadGrants,
  NIL_TENANT,
} from './roles.ts';
import { TENANT_A, TENANT_B, USERS, authApp } from './testing/app.ts';
import { describeDialects } from './testing/dialects.ts';

describe('DATA-24 the steps of the auth tables', () => {
  it('DATA-24 the steps belong to the plugin @bieberkit/auth, only add, and have an id each', () => {
    expect(AUTH_PLUGIN).toBe('@bieberkit/auth');
    expect(authMigrationSteps.length).toBeGreaterThan(0);
    expect(authMigrationSteps.every((step) => step.plugin === AUTH_PLUGIN && step.kind === 'expand')).toBe(true);
    expect(new Set(authMigrationSteps.map((step) => step.id)).size).toBe(authMigrationSteps.length);
    expect(authEntities).toEqual(expect.arrayContaining([AuthRole, AuthRolePermission, AuthUserRole]));
  });
});

describeDialects('AUTHZ-01 the roles tables', ({ open }) => {
  const user = USERS.reader;

  it('DATA-24 the steps are in the ledger, and the three tables work', async () => {
    const app = await authApp(open);
    const rows: { step_id: string }[] = await app.db.orm.em
      .getConnection()
      .execute(`select step_id from bk_plugin_migrations where plugin = '${AUTH_PLUGIN}'`);
    expect(rows.map((row) => row.step_id).toSorted()).toEqual(authMigrationSteps.map((step) => step.id).toSorted());
    await app.grant('reader', ['crm.deal.read']);
    expect((await loadGrants(app.db, TENANT_A, user)).permissions).toEqual(new Set(['crm.deal.read']));
  });

  it('AUTHZ-01 the grants of a caller are the union of the permissions of his roles', async () => {
    const app = await authApp(open);
    await app.grant('reader', ['crm.deal.read', 'crm.deal.update']);
    await app.grant('reader', ['crm.deal.update', 'crm.deal.delete']);
    const grants = await loadGrants(app.db, TENANT_A, user);
    expect([...grants.permissions].toSorted()).toEqual(['crm.deal.delete', 'crm.deal.read', 'crm.deal.update']);
    expect(grants.roles).toHaveLength(2);
    expect(grants.requireMfa).toBe(false);
  });

  it('AUTHZ-04 a caller with no role has no permission', async () => {
    const app = await authApp(open);
    expect(await loadGrants(app.db, TENANT_A, USERS.none)).toEqual({
      permissions: new Set(),
      roles: [],
      requireMfa: false,
    });
  });

  it('AUTHZ-04 a role grants nothing in another tenant, and nothing to another user', async () => {
    const app = await authApp(open);
    await app.grant('reader', ['crm.deal.read']);
    expect((await loadGrants(app.db, TENANT_B, user)).permissions.size).toBe(0);
    expect((await loadGrants(app.db, TENANT_A, USERS.other)).permissions.size).toBe(0);
  });

  it('AUTHZ-04 a request with no tenant uses the roles of the nil tenant', async () => {
    const app = await authApp(open);
    await app.grant('reader', ['system.api-docs'], { tenant: NIL_TENANT });
    expect((await loadGrants(app.db, undefined, user)).permissions).toEqual(new Set(['system.api-docs']));
    expect((await loadGrants(app.db, TENANT_A, user)).permissions.size).toBe(0);
  });

  it('AUTH-05 a caller must use MFA when any of his roles requires it', async () => {
    const app = await authApp(open);
    await app.grant('reader', ['crm.deal.read']);
    await app.grant('reader', ['crm.deal.update'], { requireMfa: true });
    expect((await loadGrants(app.db, TENANT_A, user)).requireMfa).toBe(true);
  });

  it('AUTHZ-01 the grants are read again at every call: a change shows at once', async () => {
    const app = await authApp(open);
    const role = await app.grant('reader', ['crm.deal.read']);
    expect((await loadGrants(app.db, TENANT_A, user)).permissions.size).toBe(1);
    await runInUnitOfWork(app.db, async (em) => {
      em.create(AuthRolePermission, { roleId: role, permission: 'crm.deal.update' });
      await em.flush();
    });
    expect((await loadGrants(app.db, TENANT_A, user)).permissions.size).toBe(2);
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeDelete(AuthUserRole, { roleId: role });
      await em.flush();
    });
    expect((await loadGrants(app.db, TENANT_A, user)).permissions.size).toBe(0);
  });

  it('AUTHZ-01 a role name is unique in its tenant, and the same name may be used in another', async () => {
    const app = await authApp(open);
    const make = (tenant: string, name: string) =>
      runInUnitOfWork(app.db, async (em) => {
        em.create(AuthRole, { id: uuid7(), tenant, name, system: false, requireMfa: false });
        await em.flush();
      });
    await make(TENANT_A, 'sales');
    await expect(make(TENANT_A, 'sales')).rejects.toBeInstanceOf(Error);
    await expect(make(TENANT_B, 'sales')).resolves.toBeUndefined();
  });

  it('AUTHZ-04 a role cannot be given in a tenant that is not its own', async () => {
    const app = await authApp(open);
    const role = await app.grant('reader', ['crm.deal.read']);
    await expect(
      runInUnitOfWork(app.db, async (em) => {
        em.create(AuthUserRole, { tenant: TENANT_B, userId: user, roleId: role });
        await em.flush();
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('AUTHZ-01 deleting a role takes its permissions and its assignments with it', async () => {
    const app = await authApp(open);
    const role = await app.grant('reader', ['crm.deal.read']);
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeDelete(AuthRole, { id: role });
    });
    const left: unknown[] = await app.db.orm.em.getConnection().execute('select role_id from bk_auth_role_permissions');
    expect(left).toEqual([]);
    expect((await loadGrants(app.db, TENANT_A, user)).permissions.size).toBe(0);
  });
});
