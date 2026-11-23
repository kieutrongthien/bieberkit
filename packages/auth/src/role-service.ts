/**
 * BieberKit
 *
 * @file        packages/auth/src/role-service.ts
 * @description The service that changes roles: each change is one transaction with its audit entry and its outbox event, and a system role is not changed (AUTHZ-05, MOD-16).
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

import { isUuid, uuid7 } from '@bieberkit/data';
import { emitEvent, recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { authError } from './errors.ts';
import { AuthRole, AuthRolePermission, AuthUserRole, NIL_TENANT } from './roles.ts';

const MAX_PERMISSIONS = 500;
const ENTITY = 'authRole';

export interface NewRole {
  /** The tenant of the role. A project with no tenants uses none, and the role belongs to the nil tenant. */
  readonly tenantId?: string;
  readonly name: string;
  readonly permissions?: readonly string[];
  readonly requireMfa?: boolean;
  /** A system role is made by a seeder (the administrator) and cannot be renamed, deleted or given other permissions. */
  readonly system?: boolean;
}

export interface Assignment {
  readonly tenantId?: string;
  readonly userId: string;
  readonly roleId: string;
}

const invalid = (message: string, fix: string): never => {
  throw authError('AUTH_ROLE_INVALID', 400, message, fix);
};
const notFound = (): never => {
  throw authError(
    'AUTH_ROLE_NOT_FOUND',
    404,
    'The role does not exist in this tenant.',
    'Check the id of the role and the tenant.',
  );
};
const exists = (): never => {
  throw authError('AUTH_ROLE_EXISTS', 409, 'The tenant has a role with this name.', 'Use another name.');
};
const system = (): never => {
  throw authError(
    'AUTH_ROLE_SYSTEM',
    409,
    'A system role cannot be renamed, deleted or given other permissions.',
    'Make a new role instead.',
  );
};

function tenantOf(tenantId: string | undefined): string {
  const tenant = (tenantId ?? NIL_TENANT).toLowerCase();
  if (!isUuid(tenant)) invalid('The tenant is not a UUID.', 'Use the UUID of the tenant.');
  return tenant;
}

function nameOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > 120)
    invalid('The name of a role has 1 to 120 characters.', 'Give the role a name.');
  return trimmed;
}

function permissionsOf(list: readonly string[]): string[] {
  const out = [...new Set(list.map((permission) => permission.trim()))];
  if (out.length > MAX_PERMISSIONS) invalid(`A role has at most ${MAX_PERMISSIONS} permissions.`, 'Split the role.');
  if (out.some((permission) => permission === '' || permission.length > 200))
    invalid('A permission has 1 to 200 characters.', 'Name the permission like crm.deal.read.');
  return out.toSorted((a, b) => a.localeCompare(b));
}

function userOf(userId: string): string {
  if (!isUuid(userId)) invalid('The user is not a UUID.', 'Use the id of the user.');
  return userId.toLowerCase();
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && error.name === 'UniqueConstraintViolationException';

/** Creates a role with its permissions. It returns the id of the role. */
export async function createRole(db: Database, input: NewRole): Promise<string> {
  const tenant = tenantOf(input.tenantId);
  const name = nameOf(input.name);
  const permissions = permissionsOf(input.permissions ?? []);
  const id = uuid7();
  try {
    await runInTransaction(db, async (em) => {
      if ((await em.count(AuthRole, { tenant, name })) > 0) exists();
      em.create(AuthRole, { id, tenant, name, system: input.system === true, requireMfa: input.requireMfa === true });
      // The tables point at each other by key and not by relation, so the role is written first.
      await em.flush();
      for (const permission of permissions) em.create(AuthRolePermission, { roleId: id, permission });
      const data = { name, permissions, requireMfa: input.requireMfa === true, system: input.system === true };
      recordAudit(em, { action: 'auth.role.created', entity: ENTITY, recordId: id, tenantId: tenant, data });
      emitEvent(em, { name: 'auth.role.created', payload: { id, tenant, ...data }, record: { entity: ENTITY, id } });
      await em.flush();
    });
  } catch (error) {
    if (isUniqueViolation(error)) exists();
    throw error;
  }
  return id;
}

/** Replaces the permissions of a role. It says whether anything changed, and a change that changes nothing leaves nothing. */
export async function setRolePermissions(
  db: Database,
  roleId: string,
  permissions: readonly string[],
): Promise<boolean> {
  const wanted = permissionsOf(permissions);
  return runInTransaction(db, async (em) => {
    const role = await em.findOne(AuthRole, { id: roleId });
    if (role === null) return notFound();
    if (role.system) return system();
    const current = (await em.find(AuthRolePermission, { roleId })).map((row) => row.permission);
    const added = wanted.filter((permission) => !current.includes(permission));
    const removed = current.filter((permission) => !wanted.includes(permission)).toSorted((a, b) => a.localeCompare(b));
    if (added.length === 0 && removed.length === 0) return false;
    if (removed.length > 0) await em.nativeDelete(AuthRolePermission, { roleId, permission: { $in: removed } });
    for (const permission of added) em.create(AuthRolePermission, { roleId, permission });
    const data = { added, removed };
    recordAudit(em, { action: 'auth.role.updated', entity: ENTITY, recordId: roleId, tenantId: role.tenant, data });
    emitEvent(em, {
      name: 'auth.role.updated',
      payload: { id: roleId, tenant: role.tenant, ...data },
      record: { entity: ENTITY, id: roleId },
    });
    await em.flush();
    return true;
  });
}

/** Renames a role or changes its MFA flag. It says whether anything changed. */
export async function updateRole(
  db: Database,
  roleId: string,
  changes: { readonly name?: string; readonly requireMfa?: boolean },
): Promise<boolean> {
  try {
    return await runInTransaction(db, async (em) => {
      const role = await em.findOne(AuthRole, { id: roleId });
      if (role === null) return notFound();
      if (role.system) return system();
      const data: { name?: string; requireMfa?: boolean } = {};
      if (changes.name !== undefined) {
        const name = nameOf(changes.name);
        if (name !== role.name) {
          if ((await em.count(AuthRole, { tenant: role.tenant, name })) > 0) exists();
          data.name = name;
        }
      }
      if (changes.requireMfa !== undefined && changes.requireMfa !== role.requireMfa)
        data.requireMfa = changes.requireMfa;
      if (Object.keys(data).length === 0) return false;
      em.assign(role, data);
      recordAudit(em, { action: 'auth.role.updated', entity: ENTITY, recordId: roleId, tenantId: role.tenant, data });
      emitEvent(em, {
        name: 'auth.role.updated',
        payload: { id: roleId, tenant: role.tenant, ...data },
        record: { entity: ENTITY, id: roleId },
      });
      await em.flush();
      return true;
    });
  } catch (error) {
    if (isUniqueViolation(error)) exists();
    throw error;
  }
}

/** Deletes a role, its permissions and its assignments. */
export async function deleteRole(db: Database, roleId: string): Promise<void> {
  await runInTransaction(db, async (em) => {
    const role = await em.findOne(AuthRole, { id: roleId });
    if (role === null) return notFound();
    if (role.system) return system();
    const users = await em.count(AuthUserRole, { roleId });
    const data = { name: role.name, users };
    recordAudit(em, { action: 'auth.role.deleted', entity: ENTITY, recordId: roleId, tenantId: role.tenant, data });
    emitEvent(em, {
      name: 'auth.role.deleted',
      payload: { id: roleId, tenant: role.tenant, ...data },
      record: { entity: ENTITY, id: roleId },
    });
    // The foreign keys delete the permissions and the assignments.
    await em.nativeDelete(AuthRole, { id: roleId });
    await em.flush();
    return undefined;
  });
}

/** Gives a role to a user in its tenant. It says whether the user had it already. */
export async function assignRole(db: Database, input: Assignment): Promise<boolean> {
  const tenant = tenantOf(input.tenantId);
  const userId = userOf(input.userId);
  return runInTransaction(db, async (em) => {
    if ((await em.count(AuthRole, { id: input.roleId, tenant })) === 0) return notFound();
    if ((await em.count(AuthUserRole, { tenant, userId, roleId: input.roleId })) > 0) return false;
    em.create(AuthUserRole, { tenant, userId, roleId: input.roleId });
    const data = { userId };
    recordAudit(em, { action: 'auth.role.assigned', entity: ENTITY, recordId: input.roleId, tenantId: tenant, data });
    emitEvent(em, {
      name: 'auth.role.assigned',
      payload: { id: input.roleId, tenant, ...data },
      record: { entity: ENTITY, id: input.roleId },
    });
    await em.flush();
    return true;
  });
}

/** Takes a role from a user. It says whether the user had it. */
export async function revokeRole(db: Database, input: Assignment): Promise<boolean> {
  const tenant = tenantOf(input.tenantId);
  const userId = userOf(input.userId);
  return runInTransaction(db, async (em) => {
    if ((await em.count(AuthRole, { id: input.roleId, tenant })) === 0) return notFound();
    const removed = await em.nativeDelete(AuthUserRole, { tenant, userId, roleId: input.roleId });
    if (removed === 0) return false;
    const data = { userId };
    recordAudit(em, { action: 'auth.role.revoked', entity: ENTITY, recordId: input.roleId, tenantId: tenant, data });
    emitEvent(em, {
      name: 'auth.role.revoked',
      payload: { id: input.roleId, tenant, ...data },
      record: { entity: ENTITY, id: input.roleId },
    });
    await em.flush();
    return true;
  });
}
