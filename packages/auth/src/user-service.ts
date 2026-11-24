/**
 * BieberKit
 *
 * @file        packages/auth/src/user-service.ts
 * @description Atomic user status changes and session revocation with audit entries (BPL-01, MOD-16).
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

import type { EntityManager } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import { recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { authError } from './errors.ts';
import { AuthSession, AuthUser } from './tables.ts';

export interface DisableUserInput {
  readonly userId: string;
  readonly reason: string;
  readonly actorId: string | null;
}

export interface EnableUserInput {
  readonly userId: string;
  readonly actorId: string | null;
}

async function unchanged(em: EntityManager, userId: string): Promise<false> {
  if ((await em.findOne(AuthUser, { id: userId })) === null) {
    throw authError('USERS_NOT_FOUND', 404, 'The user does not exist.', 'Check the user id.');
  }
  return false;
}

function audit(em: EntityManager, input: EnableUserInput, action: string, data?: Record<string, unknown>): void {
  const current = requestContext.get();
  const context = { ...current, requestId: current?.requestId ?? uuid7() };
  if (input.actorId === null) delete context.userId;
  else context.userId = input.actorId;
  requestContext.run(context, () =>
    recordAudit(em, {
      action,
      entity: 'authUser',
      recordId: input.userId,
      ...(data === undefined ? {} : { data }),
    }),
  );
}

/** Disables a user and revokes all database sessions atomically with the audit entry. */
export async function disableUser(db: Database, input: DisableUserInput): Promise<boolean> {
  return runInTransaction(db, async (em) => {
    const changed = await em.nativeUpdate(
      AuthUser,
      { id: input.userId, disabledAt: null },
      {
        disabledAt: new Date(),
        disabledReason: input.reason,
        disabledBy: input.actorId,
      },
    );
    if (changed === 0) return unchanged(em, input.userId);
    await em.nativeDelete(AuthSession, { userId: input.userId });
    audit(em, input, 'users.user.disabled', { reason: input.reason });
    await em.flush();
    return true;
  });
}

/** Enables a disabled user; old sessions stay revoked and the user signs in again. */
export async function enableUser(db: Database, input: EnableUserInput): Promise<boolean> {
  return runInTransaction(db, async (em) => {
    const changed = await em.nativeUpdate(
      AuthUser,
      { id: input.userId, disabledAt: { $ne: null } },
      {
        disabledAt: null,
        disabledReason: null,
        disabledBy: null,
      },
    );
    if (changed === 0) return unchanged(em, input.userId);
    audit(em, input, 'users.user.enabled');
    await em.flush();
    return true;
  });
}
