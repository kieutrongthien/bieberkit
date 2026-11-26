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

import type { EntityManager, FilterQuery } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { decodeCursor, encodeCursor, isUuid, pageSize, uuid7 } from '@bieberkit/data';
import { emitEvent, recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';
import type { Condition, ScopedPermission } from './ability.ts';
import { holdersQuery, isAdminRole, keepLastAdmin, refuseSelf } from './admin-guard.ts';
import { authError } from './errors.ts';
import { AuthRole, AuthRolePermission, AuthUserRole, loadGrants, NIL_TENANT } from './roles.ts';
import type { AuthRoleRow } from './roles.ts';
import { AuthUser } from './tables.ts';
import type { AuthUserRow } from './tables.ts';

const MAX_PERMISSIONS = 500;
const MAX_BATCH = 100;
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

export interface BatchAssignment {
  readonly tenantId?: string;
  readonly roleId: string;
  /** 1 to 100 users. */
  readonly userIds: readonly string[];
}

/** The answer for one user of a batch (ROL-02). A refused user does not undo the others. */
export interface BatchResult {
  readonly userId: string;
  readonly result: 'assigned' | 'revoked' | 'unchanged' | 'not_found' | 'refused';
  /** The stable code of a refusal. */
  readonly code?: string;
  /** `AUTH_MFA_ENROL_REQUIRED` when a role that needs MFA goes to a user without a second factor (ROL-07). */
  readonly warning?: string;
}

export interface RoleView {
  readonly id: string;
  readonly name: string;
  readonly system: boolean;
  readonly requireMfa: boolean;
  readonly permissions: readonly string[];
  readonly memberCount: number;
}

export interface RoleMember {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface MemberPage {
  readonly data: readonly RoleMember[];
  readonly nextCursor: string | null;
  readonly pageSize: number;
}

export interface EffectivePermission {
  readonly permission: string;
  /** The roles that grant it, by name. */
  readonly roles: readonly { readonly id: string; readonly name: string }[];
  /** For a scoped permission, the condition that it puts on the rows, for this user (ROL-05). */
  readonly condition?: Condition;
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
const escalation = (): never => {
  throw authError(
    'ROLES_ESCALATION',
    403,
    'A role can only grant permissions that you hold yourself.',
    'Ask somebody who holds these permissions, or an administrator.',
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

function batchOf(userIds: readonly string[]): string[] {
  if (userIds.length === 0 || userIds.length > MAX_BATCH)
    invalid(`A batch has 1 to ${MAX_BATCH} users.`, 'Split the list.');
  return [...new Set(userIds.map(userOf))];
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && error.name === 'UniqueConstraintViolationException';

/** The user who asks, from the request. A seeder, the CLI and a job of the system have none, and are not limited by ROL-08. */
const actorOf = (): string | undefined => requestContext.get()?.userId;

async function permissionsOfRole(em: EntityManager, roleId: string): Promise<string[]> {
  return (await em.find(AuthRolePermission, { roleId }))
    .map((row) => row.permission)
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * ROL-08: whether the actor may grant `permissions` (and, for a system role, the role itself) in `tenant`. A holder of the
 * administrator role, in the tenant or in the nil tenant, may grant anything. Answers the permissions that are missing.
 */
async function missingGrants(
  db: Database,
  tenant: string,
  permissions: readonly string[],
  role?: AuthRoleRow,
): Promise<readonly string[]> {
  const actor = actorOf();
  if (actor === undefined || !isUuid(actor)) return [];
  const held = await runInUnitOfWork(db, async (em) => {
    const assigned = await em.find(AuthUserRole, {
      userId: actor.toLowerCase(),
      tenant: { $in: [tenant, NIL_TENANT] },
    });
    if (assigned.length === 0) return [];
    return em.find(AuthRole, { id: { $in: assigned.map((row) => row.roleId) } });
  });
  if (held.some(isAdminRole)) return [];
  if (role?.system === true && !held.some((item) => item.id === role.id)) return [`role:${role.name}`];
  const grants = (await loadGrants(db, tenant, actor)).permissions;
  return permissions.filter((permission) => !grants.has(permission));
}

function deniedAudit(
  em: EntityManager,
  tenant: string,
  recordId: string | undefined,
  missing: readonly string[],
): void {
  recordAudit(em, {
    action: 'authz.denied',
    entity: ENTITY,
    ...(recordId === undefined ? {} : { recordId }),
    tenantId: tenant,
    data: { reason: 'escalation', missing },
  });
}

/** Refuses an escalation. The refusal is audited in a transaction of its own, so it stays (AUTHZ-05). */
async function refuseEscalation(
  db: Database,
  tenant: string,
  permissions: readonly string[],
  recordId?: string,
  role?: AuthRoleRow,
): Promise<void> {
  const missing = await missingGrants(db, tenant, permissions, role);
  if (missing.length === 0) return;
  await runInTransaction(db, async (em) => {
    deniedAudit(em, tenant, recordId, missing);
    await em.flush();
  });
  escalation();
}

function changed(em: EntityManager, name: string, roleId: string, tenant: string, data: Record<string, unknown>): void {
  recordAudit(em, { action: name, entity: ENTITY, recordId: roleId, tenantId: tenant, data });
  emitEvent(em, { name, payload: { id: roleId, tenant, ...data }, record: { entity: ENTITY, id: roleId } });
}

async function findRole(em: EntityManager, roleId: string, tenantId?: string): Promise<AuthRoleRow> {
  if (!isUuid(roleId)) return notFound();
  const role = await em.findOne(AuthRole, {
    id: roleId.toLowerCase(),
    ...(tenantId === undefined ? {} : { tenant: tenantOf(tenantId) }),
  });
  return role ?? notFound();
}

/** Creates a role with its permissions. It returns the id of the role. */
export async function createRole(db: Database, input: NewRole): Promise<string> {
  const tenant = tenantOf(input.tenantId);
  const name = nameOf(input.name);
  const permissions = permissionsOf(input.permissions ?? []);
  await refuseEscalation(db, tenant, permissions);
  const id = uuid7();
  try {
    await runInTransaction(db, async (em) => {
      if ((await em.count(AuthRole, { tenant, name })) > 0) exists();
      em.create(AuthRole, { id, tenant, name, system: input.system === true, requireMfa: input.requireMfa === true });
      // The tables point at each other by key and not by relation, so the role is written first.
      await em.flush();
      for (const permission of permissions) em.create(AuthRolePermission, { roleId: id, permission });
      const data = { name, permissions, requireMfa: input.requireMfa === true, system: input.system === true };
      changed(em, 'auth.role.created', id, tenant, data);
      await em.flush();
    });
  } catch (error) {
    if (isUniqueViolation(error)) exists();
    throw error;
  }
  return id;
}

/** Makes a new role, never a system one, with the permissions and the MFA flag of `roleId` (ROL-03). */
export async function duplicateRole(db: Database, roleId: string, input: { readonly name: string }): Promise<string> {
  const source = await runInUnitOfWork(db, async (em) => {
    const role = await findRole(em, roleId);
    return { role, permissions: await permissionsOfRole(em, role.id) };
  });
  return createRole(db, {
    tenantId: source.role.tenant,
    name: input.name,
    permissions: source.permissions,
    requireMfa: source.role.requireMfa,
  });
}

/** Replaces the permissions of a role. It says whether anything changed, and a change that changes nothing leaves nothing. */
export async function setRolePermissions(
  db: Database,
  roleId: string,
  permissions: readonly string[],
): Promise<boolean> {
  const wanted = permissionsOf(permissions);
  const found = await runInUnitOfWork(db, (em) => em.findOne(AuthRole, { id: roleId }));
  if (found !== null && !found.system) await refuseEscalation(db, found.tenant, wanted, roleId);
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
    changed(em, 'auth.role.updated', roleId, role.tenant, { added, removed });
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
      changed(em, 'auth.role.updated', roleId, role.tenant, data);
      await em.flush();
      return true;
    });
  } catch (error) {
    if (isUniqueViolation(error)) exists();
    throw error;
  }
}

/**
 * Deletes a role and its permissions. A role with members is refused with `ROLES_IN_USE` (409) and its member count, unless the
 * members move to `reassignTo`, a role of the same tenant (ROL-06).
 */
export async function deleteRole(
  db: Database,
  roleId: string,
  options: { readonly reassignTo?: string } = {},
): Promise<void> {
  const target = options.reassignTo;
  if (target !== undefined) {
    const found = await runInUnitOfWork(db, async (em) => {
      const role = await em.findOne(AuthRole, { id: target.toLowerCase() });
      return role === null ? undefined : { role, permissions: await permissionsOfRole(em, role.id) };
    });
    if (found !== undefined) await refuseEscalation(db, found.role.tenant, found.permissions, target, found.role);
  }
  await runInTransaction(db, async (em) => {
    const role = await em.findOne(AuthRole, { id: roleId });
    if (role === null) return notFound();
    if (role.system) return system();
    const members = await em.find(AuthUserRole, { roleId });
    if (members.length > 0 && target === undefined) {
      throw new HttpError(
        'ROLES_IN_USE',
        409,
        `The role has ${String(members.length)} members.`,
        'Name a role to move them to with reassignTo, or take the role from them first.',
        {},
        undefined,
        { memberCount: members.length },
      );
    }
    if (target !== undefined) {
      const into = await findRole(em, target, role.tenant);
      if (into.id === role.id) invalid('A role cannot be reassigned to itself.', 'Name another role.');
      const already = new Set(
        (await em.find(AuthUserRole, { roleId: into.id, userId: { $in: members.map((row) => row.userId) } })).map(
          (row) => row.userId,
        ),
      );
      for (const member of members) {
        if (!already.has(member.userId))
          em.create(AuthUserRole, { tenant: role.tenant, userId: member.userId, roleId: into.id });
      }
    }
    const data = { name: role.name, users: members.length, ...(target === undefined ? {} : { reassignTo: target }) };
    changed(em, 'auth.role.deleted', roleId, role.tenant, data);
    await em.flush();
    // The foreign keys delete the permissions and the assignments.
    await em.nativeDelete(AuthRole, { id: roleId });
    return undefined;
  });
}

/**
 * The roles that a new user gets, checked before the transaction of the user: each exists in the tenant, and the actor may give it
 * (ROL-08, audited when refused). `grantRoles` then writes them in that transaction (USR-03).
 */
export async function checkGrantable(
  db: Database,
  tenantId: string | undefined,
  roleIds: readonly string[],
): Promise<readonly string[]> {
  const tenant = tenantOf(tenantId);
  const ids = [...new Set(roleIds.map((id) => id.toLowerCase()))];
  for (const id of ids) {
    const role = await runInUnitOfWork(db, (em) => findRole(em, id, tenant));
    await refuseEscalation(
      db,
      tenant,
      await runInUnitOfWork(db, (em) => permissionsOfRole(em, role.id)),
      role.id,
      role,
    );
  }
  return ids;
}

/** Writes the roles that `checkGrantable` accepted, in the transaction of `em`, with their audit entries and events. */
export async function grantRoles(
  em: EntityManager,
  tenantId: string | undefined,
  userId: string,
  roleIds: readonly string[],
): Promise<void> {
  const tenant = tenantOf(tenantId);
  for (const roleId of roleIds) {
    if ((await em.count(AuthRole, { id: roleId, tenant })) === 0) notFound();
    em.create(AuthUserRole, { tenant, userId: userOf(userId), roleId });
    changed(em, 'auth.role.assigned', roleId, tenant, { userId: userOf(userId) });
  }
  await em.flush();
}

/** Gives a role to a user in its tenant. It says whether the user had it already. */
export async function assignRole(db: Database, input: Assignment): Promise<boolean> {
  const tenant = tenantOf(input.tenantId);
  const userId = userOf(input.userId);
  const role = await runInUnitOfWork(db, (em) => em.findOne(AuthRole, { id: input.roleId, tenant }));
  if (role === null) return notFound();
  await refuseEscalation(db, tenant, await runInUnitOfWork(db, (em) => permissionsOfRole(em, role.id)), role.id, role);
  return runInTransaction(db, async (em) => {
    if ((await em.count(AuthRole, { id: input.roleId, tenant })) === 0) return notFound();
    if ((await em.count(AuthUserRole, { tenant, userId, roleId: input.roleId })) > 0) return false;
    em.create(AuthUserRole, { tenant, userId, roleId: input.roleId });
    changed(em, 'auth.role.assigned', input.roleId, tenant, { userId });
    await em.flush();
    return true;
  });
}

/** Takes a role from a user. It says whether the user had it. The last active administrator keeps the role (USR-07). */
export async function revokeRole(db: Database, input: Assignment): Promise<boolean> {
  const tenant = tenantOf(input.tenantId);
  const userId = userOf(input.userId);
  return runInTransaction(db, async (em) => {
    // The guard is the first read, so that it locks before anything else is read (USR-07).
    await keepLastAdmin(em, db.dialect, userId, input.roleId);
    const role = await em.findOne(AuthRole, { id: input.roleId, tenant });
    if (role === null) return notFound();
    if (isAdminRole(role)) refuseSelf(actorOf(), userId);
    const removed = await em.nativeDelete(AuthUserRole, { tenant, userId, roleId: input.roleId });
    if (removed === 0) return false;
    changed(em, 'auth.role.revoked', input.roleId, tenant, { userId });
    await em.flush();
    return true;
  });
}

const twoFactorOf = (user: { twoFactorEnabled?: boolean | null } | undefined): boolean =>
  user?.twoFactorEnabled === true;

/** Gives a role to up to 100 users in one transaction, with a result for each (ROL-02, ROL-07, ROL-08). */
export async function assignRoles(db: Database, input: BatchAssignment): Promise<{ readonly results: BatchResult[] }> {
  const tenant = tenantOf(input.tenantId);
  const userIds = batchOf(input.userIds);
  const role = await runInUnitOfWork(db, (em) => findRole(em, input.roleId, tenant));
  const missing = await missingGrants(
    db,
    tenant,
    await runInUnitOfWork(db, (em) => permissionsOfRole(em, role.id)),
    role,
  );
  return runInTransaction(db, async (em) => {
    if (missing.length > 0) {
      deniedAudit(em, tenant, role.id, missing);
      await em.flush();
      return { results: userIds.map((userId) => ({ userId, result: 'refused', code: 'ROLES_ESCALATION' }) as const) };
    }
    const users = new Map(
      (await em.find(AuthUser, { id: { $in: userIds }, deletedAt: null })).map((user) => [user.id, user] as const),
    );
    const holders = new Set(
      (await em.find(AuthUserRole, { tenant, roleId: role.id, userId: { $in: userIds } })).map((row) => row.userId),
    );
    const results: BatchResult[] = [];
    for (const userId of userIds) {
      const user = users.get(userId);
      if (user === undefined) results.push({ userId, result: 'not_found' });
      else if (holders.has(userId)) results.push({ userId, result: 'unchanged' });
      else {
        em.create(AuthUserRole, { tenant, userId, roleId: role.id });
        changed(em, 'auth.role.assigned', role.id, tenant, { userId });
        results.push({
          userId,
          result: 'assigned',
          ...(role.requireMfa && !twoFactorOf(user) ? { warning: 'AUTH_MFA_ENROL_REQUIRED' } : {}),
        });
      }
    }
    await em.flush();
    return { results };
  });
}

/** Takes a role from up to 100 users in one transaction. A user who would leave no active administrator is refused alone (ROL-02, USR-07). */
export async function revokeRoles(db: Database, input: BatchAssignment): Promise<{ readonly results: BatchResult[] }> {
  const tenant = tenantOf(input.tenantId);
  const userIds = batchOf(input.userIds);
  const actor = actorOf();
  return runInTransaction(db, async (em) => {
    const role = await findRole(em, input.roleId, tenant);
    const admin = isAdminRole(role);
    const results: BatchResult[] = [];
    for (const userId of userIds) {
      if (admin) {
        try {
          refuseSelf(actor, userId);
          await keepLastAdmin(em, db.dialect, userId, role.id);
        } catch (error) {
          const code = Reflect.get(Object(error), 'code');
          if (code !== 'USERS_SELF_ACTION' && code !== 'USERS_LAST_ADMIN') throw error;
          results.push({ userId, result: 'refused', code });
          continue;
        }
      }
      const removed = await em.nativeDelete(AuthUserRole, { tenant, userId, roleId: role.id });
      if (removed === 0) {
        results.push({ userId, result: 'unchanged' });
        continue;
      }
      changed(em, 'auth.role.revoked', role.id, tenant, { userId });
      results.push({ userId, result: 'revoked' });
    }
    await em.flush();
    return { results };
  });
}

/** A role with its permissions and the number of its members (ROL-01). */
export async function getRole(
  db: Database,
  roleId: string,
  options: { readonly tenantId?: string } = {},
): Promise<RoleView> {
  return runInUnitOfWork(db, async (em) => {
    const role = await findRole(em, roleId, options.tenantId);
    return {
      id: role.id,
      name: role.name,
      system: role.system,
      requireMfa: role.requireMfa,
      permissions: await permissionsOfRole(em, role.id),
      memberCount: await em.count(AuthUserRole, { roleId: role.id }),
    };
  });
}

/** The holders of a role, paged by id (ROL-01). */
export async function listMembers(
  db: Database,
  roleId: string,
  options: { readonly tenantId?: string; readonly pageSize?: unknown; readonly cursor?: string } = {},
): Promise<MemberPage> {
  const size = pageSize(options.pageSize);
  const after = options.cursor === undefined || options.cursor === '' ? undefined : decodeCursor(options.cursor)[0];
  return runInUnitOfWork(db, async (em) => {
    const role = await findRole(em, roleId, options.tenantId);
    const members = holdersQuery(em, 'r', { roleId: role.id });
    // The sub-query is not a type of the filter; MikroORM writes it in place.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const where = {
      id: { $in: members, ...(typeof after === 'string' ? { $gt: after } : {}) },
      deletedAt: null,
    } as unknown as FilterQuery<AuthUserRow>;
    const rows = await em.find(AuthUser, where, { orderBy: { id: 'asc' }, limit: size + 1 });
    const page = rows.slice(0, size);
    const last = page.at(-1);
    return {
      data: page.map((row) => ({ id: row.id, name: row.name, email: row.email })),
      nextCursor: rows.length > size && last !== undefined ? encodeCursor([last.id]) : null,
      pageSize: size,
    };
  });
}

/**
 * The permissions that a user has in a tenant, each with the roles that grant it and, for a scoped permission, its condition for
 * this user: the answer to "why can this person not do that" (ROL-05).
 */
export async function effectivePermissions(
  db: Database,
  input: {
    readonly userId: string;
    readonly tenantId?: string;
    readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  },
): Promise<EffectivePermission[]> {
  const tenant = tenantOf(input.tenantId);
  const userId = userOf(input.userId);
  return runInUnitOfWork(db, async (em) => {
    const assigned = await em.find(AuthUserRole, { tenant, userId });
    if (assigned.length === 0) return [];
    const roles = (await em.find(AuthRole, { tenant, id: { $in: assigned.map((row) => row.roleId) } })).toSorted(
      (a, b) => a.name.localeCompare(b.name),
    );
    const grants = await em.find(AuthRolePermission, { roleId: { $in: roles.map((role) => role.id) } });
    const names = [...new Set(grants.map((row) => row.permission))].toSorted((a, b) => a.localeCompare(b));
    return names.map((permission) => {
      const by = roles
        .filter((role) => grants.some((row) => row.roleId === role.id && row.permission === permission))
        .map((role) => ({ id: role.id, name: role.name }));
      const scoped = input.scoped?.[permission];
      return {
        permission,
        roles: by,
        ...(scoped === undefined
          ? {}
          : { condition: scoped.when({ id: userId, ...(input.tenantId === undefined ? {} : { tenantId: tenant }) }) }),
      };
    });
  });
}
