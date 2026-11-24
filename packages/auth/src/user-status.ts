/**
 * BieberKit
 *
 * @file        packages/auth/src/user-status.ts
 * @description Shared disabled-user checks and fresh owner lookup for cookie and API-key authentication (BPL-01).
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
