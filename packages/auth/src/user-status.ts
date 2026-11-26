/**
 * BieberKit
 *
 * @file        packages/auth/src/user-status.ts
 * @description Shared disabled-user checks, the fresh owner lookup for cookie and API-key authentication, and the session insert that serializes with disable and enable (BPL-01).
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

import { currentEntityManager, requestKysely, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { APIError } from 'better-auth/api';
import type { AuthInstance } from './better-auth.ts';
import { authError } from './errors.ts';
import type { AuthError } from './errors.ts';

export function isDisabledUser(user: unknown): boolean {
  return typeof user === 'object' && user !== null && 'disabledAt' in user && user.disabledAt != null;
}

export function userDisabledError(): AuthError {
  return authError('AUTH_USER_DISABLED', 403, 'The account is disabled.', 'Ask an administrator to enable it.');
}

/** Reads the owner from the database, even when a session came from secondary storage. */
export async function requireEnabledUser(auth: AuthInstance, userId: string): Promise<boolean> {
  const context = await auth.$context;
  const user = await context.internalAdapter.findUserById(userId);
  if (user === null) return false;
  if (isDisabledUser(user)) throw userDisabledError();
  return true;
}

/** Serializes the actual session insert with disable/enable, also for direct Better Auth API calls. */
export async function withEnabledSession<T>(db: Database, userId: string, create: () => Promise<T>): Promise<T> {
  const guarded = async (): Promise<T> => {
    let query = requestKysely(db).selectFrom('authUser').select(['disabledAt', 'deletedAt']).where('id', '=', userId);
    // SQLite's service transaction already holds its one writer (BEGIN IMMEDIATE).
    if (db.dialect !== 'sqlite') query = query.forUpdate();
    const user = await query.executeTakeFirst();
    if (user === undefined || (user.deletedAt ?? null) !== null)
      throw new APIError('UNAUTHORIZED', { code: 'USER_NOT_FOUND', message: 'The user does not exist.' });
    if (isDisabledUser(user)) throw new APIError('FORBIDDEN', userDisabledError().toJSON());
    return create();
  };
  return currentEntityManager()?.isInTransaction() === true ? guarded() : runInTransaction(db, guarded);
}
