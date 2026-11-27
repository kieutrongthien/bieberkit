/**
 * BieberKit
 *
 * @file        packages/auth/src/roles.ts
 * @description Roles as data: the tables, the migration steps that make them, and the grants of a caller in a tenant (AUTHZ-01, AUTHZ-04, DATA-24).
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

import { EntitySchema } from '@mikro-orm/core';
import type { OptionalProps } from '@mikro-orm/core';
import { isUuid, uuid7 } from '@bieberkit/data';
import type { PluginMigrationStep } from '@bieberkit/data';
import { runInUnitOfWork, Uuid7Type, uuidType } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { AUTH_PLUGIN, authStep } from './plugin.ts';
import { authTableEntities, authTableSteps } from './tables.ts';

export { AUTH_PLUGIN };

/** The tenant of a request that has none. The roles of such a request belong to it. */
export const NIL_TENANT = '00000000-0000-0000-0000-000000000000';

export interface AuthRoleRow {
  id: string;
  tenant: string;
  name: string;
  system: boolean;
  requireMfa: boolean;
  ipRestricted: boolean;
}

export interface AuthRolePermissionRow {
  roleId: string;
  permission: string;
}

export interface AuthUserRoleRow {
  [OptionalProps]?: 'scopeGroup';
  tenant: string;
  userId: string;
  roleId: string;
  /** A group that limits the role to the users of that group (ROL-09). Empty means every user. */
  scopeGroup?: string | null;
}

/** A group that the project put a user in, such as a department. The framework knows no organization model (ROL-09). */
export interface AuthUserGroupRow {
  userId: string;
  groupId: string;
}

const uuid = <T extends object>(extra: T): { type: typeof Uuid7Type } & T => ({ type: Uuid7Type, ...extra });

/** A role of one tenant. It only grants. */
export const AuthRole: EntitySchema<AuthRoleRow> = new EntitySchema<AuthRoleRow>({
  name: 'bieberkit.AuthRole',
  tableName: 'bk_auth_roles',
  properties: {
    id: uuid({ primary: true, onCreate: () => uuid7() }),
    tenant: uuid({ fieldName: 'tenant_id' }),
    name: { type: 'string', length: 120 },
    system: { type: 'boolean', onCreate: () => false },
    requireMfa: { type: 'boolean', fieldName: 'require_mfa', onCreate: () => false },
    ipRestricted: { type: 'boolean', fieldName: 'ip_restricted', onCreate: () => false },
  },
  uniques: [{ name: 'bk_auth_roles_tenant_name_unique', properties: ['tenant', 'name'] }],
});

/** A permission string that a role grants. */
export const AuthRolePermission: EntitySchema<AuthRolePermissionRow> = new EntitySchema<AuthRolePermissionRow>({
  name: 'bieberkit.AuthRolePermission',
  tableName: 'bk_auth_role_permissions',
  properties: {
    roleId: uuid({ primary: true, fieldName: 'role_id' }),
    permission: { type: 'string', length: 200, primary: true },
  },
});

/** A role that a user has in a tenant. */
export const AuthUserRole: EntitySchema<AuthUserRoleRow> = new EntitySchema<AuthUserRoleRow>({
  name: 'bieberkit.AuthUserRole',
  tableName: 'bk_auth_user_roles',
  properties: {
    tenant: uuid({ primary: true, fieldName: 'tenant_id' }),
    userId: uuid({ primary: true, fieldName: 'user_id' }),
    roleId: uuid({ primary: true, fieldName: 'role_id' }),
    scopeGroup: { type: 'string', length: 120, fieldName: 'scope_group', nullable: true },
  },
  indexes: [{ name: 'bk_auth_user_roles_user_index', properties: ['tenant', 'userId'] }],
});

/** The groups of a user (ROL-09). */
export const AuthUserGroup: EntitySchema<AuthUserGroupRow> = new EntitySchema<AuthUserGroupRow>({
  name: 'bieberkit.AuthUserGroup',
  tableName: 'bk_auth_user_groups',
  properties: {
    userId: uuid({ primary: true, fieldName: 'user_id' }),
    groupId: { type: 'string', length: 120, primary: true, fieldName: 'group_id' },
  },
  indexes: [{ name: 'bk_auth_user_groups_group_index', properties: ['groupId'] }],
});

export const authEntities: readonly EntitySchema[] = [
  AuthRole,
  AuthRolePermission,
  AuthUserRole,
  AuthUserGroup,
  ...authTableEntities,
];

function step(id: string, up: PluginMigrationStep['up']): PluginMigrationStep {
  return authStep('0.1.0', id, up);
}

/**
 * The steps that make the three tables of the roles (DATA-24). One step is one statement, so a failed run on MySQL can be repeated.
 * A role cannot be given in another tenant than its own (the key `(tenant_id, role_id)`), and deleting a role deletes what hangs on it.
 */
const roleSteps: readonly PluginMigrationStep[] = [
  step('roles-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_roles')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('tenant_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('name', 'varchar(120)', (c) => c.notNull())
      .addColumn('system', 'boolean', (c) => c.notNull())
      .addColumn('require_mfa', 'boolean', (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_roles_pkey', ['id'])
      .addUniqueConstraint('bk_auth_roles_tenant_name_unique', ['tenant_id', 'name'])
      .addUniqueConstraint('bk_auth_roles_tenant_id_unique', ['tenant_id', 'id'])
      .execute();
  }),
  step('role-permissions-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_role_permissions')
      .addColumn('role_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('permission', 'varchar(200)', (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_role_permissions_pkey', ['role_id', 'permission'])
      .addForeignKeyConstraint('bk_auth_role_permissions_role_fk', ['role_id'], 'bk_auth_roles', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  step('user-roles-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_user_roles')
      .addColumn('tenant_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('role_id', uuidType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_user_roles_pkey', ['tenant_id', 'user_id', 'role_id'])
      .addForeignKeyConstraint(
        'bk_auth_user_roles_role_fk',
        ['tenant_id', 'role_id'],
        'bk_auth_roles',
        ['tenant_id', 'id'],
        (c) => c.onDelete('cascade'),
      )
      .execute();
  }),
  step('user-roles-user-index', async (trx) => {
    await trx.schema
      .createIndex('bk_auth_user_roles_user_index')
      .on('bk_auth_user_roles')
      .columns(['tenant_id', 'user_id'])
      .execute();
  }),
];

/** Every step of this package: the roles (0.1.0) and the tables of Better Auth (0.2.0). */
export const authMigrationSteps: readonly PluginMigrationStep[] = [...roleSteps, ...authTableSteps];

export interface Grants {
  /** The union of the permissions of the roles that the user has in the tenant. */
  readonly permissions: Set<string>;
  /** The names of those roles. */
  readonly roles: string[];
  /** Whether one of the roles needs a second factor (AUTH-05). */
  readonly requireMfa: boolean;
  /** Whether one of the roles may be used only from the networks of `security.network.admin-allowlist` (POL-03). */
  readonly ipRestricted: boolean;
}

/** Loads the grants of a user: how the ability of a request starts. A change of roles shows at the next call. */
export type GrantLoader = (db: Database, tenantId: string | undefined, userId: string) => Promise<Grants>;

/**
 * What a user may do in a tenant, from the roles that he has there (AUTHZ-04). Roles of another tenant grant nothing, a request
 * with no tenant uses the nil tenant, and a user id that is not a UUID has no roles.
 */
export const loadGrants: GrantLoader = async (db, tenantId, userId) => {
  const tenant = (tenantId ?? NIL_TENANT).toLowerCase();
  const none: Grants = { permissions: new Set(), roles: [], requireMfa: false, ipRestricted: false };
  if (!isUuid(userId) || !isUuid(tenant)) return none;
  return runInUnitOfWork(db, async (em) => {
    const assigned = await em.find(AuthUserRole, { tenant, userId: userId.toLowerCase() });
    if (assigned.length === 0) return none;
    const ids = assigned.map((row) => row.roleId);
    const roles = await em.find(AuthRole, { tenant, id: { $in: ids } });
    if (roles.length === 0) return none;
    const granted = await em.find(AuthRolePermission, { roleId: { $in: roles.map((role) => role.id) } });
    return {
      permissions: new Set(granted.map((row) => row.permission)),
      roles: roles.map((role) => role.name),
      requireMfa: roles.some((role) => role.requireMfa),
      ipRestricted: roles.some((role) => role.ipRestricted),
    };
  });
};

/**
 * The groups that limit what a user may reach with the permissions that start with `prefix`, such as `users.` (ROL-09). `undefined`
 * means no limit: an assignment of a role with such a permission that has no group, an administrator, or a permission that does not
 * come from a role. Otherwise the groups of the assignments that carry one: the user reaches the users of those groups only.
 */
export async function manageScope(
  db: Database,
  input: { readonly userId: string; readonly tenantId?: string | undefined; readonly prefix: string },
): Promise<readonly string[] | undefined> {
  if (!isUuid(input.userId)) return undefined;
  const tenant = (input.tenantId ?? NIL_TENANT).toLowerCase();
  return runInUnitOfWork(db, async (em) => {
    const assigned = await em.find(AuthUserRole, { userId: input.userId.toLowerCase(), tenant });
    if (assigned.length === 0) return undefined;
    const roles = await em.find(AuthRole, { id: { $in: assigned.map((row) => row.roleId) }, tenant });
    if (roles.some((role) => role.system && role.name === 'admin')) return undefined;
    const granting = new Set(
      (
        await em.find(AuthRolePermission, {
          roleId: { $in: roles.map((role) => role.id) },
          permission: { $like: `${input.prefix}%` },
        })
      ).map((row) => row.roleId),
    );
    const scopes = assigned.filter((row) => granting.has(row.roleId));
    if (scopes.length === 0 || scopes.some((row) => row.scopeGroup == null)) return undefined;
    return [...new Set(scopes.map((row) => String(row.scopeGroup)))].toSorted((a, b) => a.localeCompare(b));
  });
}

/** Whether the user holds a role flagged `ipRestricted` in any tenant. The authenticator asks it before the tenant is known (POL-03). */
export function restrictedRoleLookup(db: Database): (userId: string) => Promise<boolean> {
  return async (userId) => {
    if (!isUuid(userId)) return false;
    return runInUnitOfWork(db, async (em) => {
      const assigned = await em.find(AuthUserRole, { userId: userId.toLowerCase() });
      if (assigned.length === 0) return false;
      return (await em.count(AuthRole, { id: { $in: assigned.map((row) => row.roleId) }, ipRestricted: true })) > 0;
    });
  };
}
