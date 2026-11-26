/**
 * BieberKit
 *
 * @file        packages/auth/src/admin-guard.ts
 * @description The guards that keep a project administrable: nobody acts on themselves, and the last active holder of the administrator role keeps it (USR-07).
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

import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/core';
import { BieberEntityManager } from '@bieberkit/data/orm';
import type { Dialect } from '@bieberkit/core';
import { authError } from './errors.ts';
import { AuthRole, AuthUserRole } from './roles.ts';
import type { AuthRoleRow } from './roles.ts';
import { AuthUser } from './tables.ts';

/** The name of the system role that the roles plugin seeds and that holds every permission. */
export const ADMIN_ROLE_NAME = 'admin';

export const isAdminRole = (role: Pick<AuthRoleRow, 'name' | 'system'>): boolean =>
  role.system && role.name === ADMIN_ROLE_NAME;

/** `USERS_SELF_ACTION` (409) when the actor is the user. The system (`null`) is never itself. */
export function refuseSelf(actorId: string | null | undefined, userId: string): void {
  if (actorId !== null && actorId !== undefined && actorId.toLowerCase() === userId.toLowerCase()) {
    throw authError(
      'USERS_SELF_ACTION',
      409,
      'Nobody does this to their own account.',
      'Ask another administrator to do it.',
    );
  }
}

/**
 * Locks the administrator roles that `userId` holds (or only `roleId`, when it is one) and refuses with `USERS_LAST_ADMIN` (409)
 * when the user is the last active holder of one of them. It must be the first read of the transaction: the lock serializes two
 * changes that would each leave the other administrator, and on MySQL a read before it would fix an older snapshot.
 */
export async function keepLastAdmin(
  em: EntityManager,
  dialect: Dialect,
  userId: string,
  roleId?: string,
): Promise<void> {
  const user = userId.toLowerCase();
  const lock = dialect === 'sqlite' ? {} : ({ lockMode: LockMode.PESSIMISTIC_WRITE } as const);
  const held =
    roleId === undefined ? (await em.find(AuthUserRole, { userId: user }, lock)).map((row) => row.roleId) : [roleId];
  if (held.length === 0) return;
  const roles = (await em.find(AuthRole, { id: { $in: held }, system: true, name: ADMIN_ROLE_NAME }, lock)).filter(
    isAdminRole,
  );
  for (const role of roles) {
    if (roleId !== undefined && (await em.count(AuthUserRole, { roleId: role.id, userId: user })) === 0) continue;
    const others = (await em.find(AuthUserRole, { roleId: role.id, userId: { $ne: user } })).map((row) => row.userId);
    const active =
      others.length === 0 ? 0 : await em.count(AuthUser, { id: { $in: others }, disabledAt: null, deletedAt: null });
    if (active === 0) {
      throw authError(
        'USERS_LAST_ADMIN',
        409,
        'This is the last active administrator.',
        'Give the administrator role to another active user first.',
      );
    }
  }
}

/**
 * A sub-query of the users that hold a role matching `where`, for an `$in` of a user filter. MikroORM writes it in place, so a list
 * of a million users never loads the ids. `alias` keeps two of them apart in one query.
 */
export function holdersQuery(
  em: EntityManager,
  alias: string,
  where: { readonly tenant?: string; readonly roleId?: string },
): unknown {
  if (!(em instanceof BieberEntityManager)) {
    throw authError(
      'AUTH_DRIVER_UNSUPPORTED',
      500,
      'This database has no SQL query builder.',
      'Use PostgreSQL, MySQL or SQLite.',
    );
  }
  return em.createQueryBuilder(AuthUserRole, alias).select(`${alias}.userId`).where(where);
}
