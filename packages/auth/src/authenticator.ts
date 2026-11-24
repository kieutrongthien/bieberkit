/**
 * BieberKit
 *
 * @file        packages/auth/src/authenticator.ts
 * @description The authenticator of the HTTP server: the session cookie of Better Auth becomes the principal of a request (AUTH-01, AUTH-02).
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

import type { Authenticator, Principal } from '@bieberkit/http';
import { keyOf, principalOfKey } from './api-keys.ts';
import type { AuthInstance } from './better-auth.ts';
import { requireEnabledUser } from './user-status.ts';

const COOKIE = '__Host-bk_session';

/** Resolves a cookie only while its durable session and current owner are still valid. */
export async function principalOfSession(auth: AuthInstance, cookie: string): Promise<Principal | undefined> {
  if (!cookie.includes(`${COOKIE}=`)) return undefined;
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (session === null || !(await requireEnabledUser(auth, session.user.id))) return undefined;
  const context = await auth.$context;
  const stored = await context.adapter.findOne<{ userId: string; expiresAt: Date }>({
    model: 'session',
    where: [
      { field: 'id', value: session.session.id },
      { field: 'userId', value: session.user.id },
    ],
  });
  if (stored === null || new Date(stored.expiresAt).getTime() <= Date.now()) return undefined;
  const mfa = 'twoFactorEnabled' in session.user && session.user.twoFactorEnabled === true;
  return { id: session.user.id, kind: 'user', via: 'cookie', sessionId: session.session.id, mfa };
}

/** Reads a durable cookie session or the machine key that takes precedence on entity routes (AUTH-07). */
export function createAuthenticator(auth: AuthInstance): Authenticator {
  return {
    async authenticate(request) {
      const key = keyOf(request.headers);
      if (key !== undefined) return principalOfKey(auth, key);
      const header = request.headers['cookie'];
      const cookie = Array.isArray(header) ? header.join('; ') : header;
      return cookie === undefined ? undefined : principalOfSession(auth, cookie);
    },
  };
}
