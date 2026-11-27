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

import { requestContext } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import { recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { Authenticator, Principal, RequestInfo } from '@bieberkit/http';
import { keyOf, principalOfKey } from './api-keys.ts';
import type { AuthInstance } from './better-auth.ts';
import { authError } from './errors.ts';
import { checkMfa, checkNetwork, checkSession, defaultPolicyReader } from './policy.ts';
import type { PolicyReader } from './policy.ts';
import { requireEnabledUser } from './user-status.ts';

const COOKIE = '__Host-bk_session';
// `updatedAt` of a session is its last sign of life for the idle limit. It is written at most this often, not on every request.
const TOUCH_MS = 60_000;

/** What the authenticator needs besides Better Auth. Without options the default policy applies and nothing is asked of anyone. */
export interface AuthenticatorOptions {
  /** Where the policy of the request comes from (ADR 0031). */
  readonly policy?: PolicyReader;
  /** Whether a user holds a role flagged `ipRestricted` (POL-03). Without it nobody is restricted. */
  readonly restricted?: (userId: string) => Promise<boolean>;
  /** Called when the network policy refuses a request, so the server can audit it as `auth.network.denied` (AUTHZ-05). */
  readonly onDenied?: (event: { readonly userId: string; readonly ip: string }) => void | Promise<void>;
  /** The time of the request. Tests move it. */
  readonly clock?: () => Date;
}

/** Writes `auth.network.denied` in a transaction of its own, so the refusal stays (POL-03, AUTHZ-05). */
export function auditNetworkDenied(db: Database): NonNullable<AuthenticatorOptions['onDenied']> {
  return (event) =>
    requestContext.run({ requestId: uuid7(), userId: event.userId }, () =>
      runInTransaction(db, async (em) => {
        recordAudit(em, {
          action: 'auth.network.denied',
          entity: 'authUser',
          recordId: event.userId,
          data: { ip: event.ip },
        });
        await em.flush();
      }),
    );
}

/** Resolves a cookie only while its durable session and current owner are still valid, and the policies of ADR 0031 allow it. */
export async function principalOfSession(
  auth: AuthInstance,
  cookie: string,
  request?: RequestInfo,
  options: AuthenticatorOptions = {},
): Promise<Principal | undefined> {
  if (!cookie.includes(`${COOKIE}=`)) return undefined;
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (session === null || !(await requireEnabledUser(auth, session.user.id))) return undefined;
  const context = await auth.$context;
  const stored = await context.adapter.findOne<{ userId: string; expiresAt: Date; createdAt: Date; updatedAt: Date }>({
    model: 'session',
    where: [
      { field: 'id', value: session.session.id },
      { field: 'userId', value: session.user.id },
    ],
  });
  const now = (options.clock ?? (() => new Date()))();
  if (stored === null || new Date(stored.expiresAt).getTime() <= Date.now()) return undefined;
  const policy = await (options.policy ?? defaultPolicyReader).read({});
  const created = new Date(stored.createdAt);
  const seen = new Date(stored.updatedAt);
  if (checkSession(policy.session, { createdAt: created, lastSeenAt: seen, now }) !== 'ok')
    throw authError('AUTH_SESSION_EXPIRED', 401, 'The session ended by the security policy.', 'Sign in again.');
  if (policy.network.adminAllowlist.length > 0 && (await options.restricted?.(session.user.id)) === true) {
    const ip = request?.ip ?? '';
    if (!checkNetwork(policy.network.adminAllowlist, ip)) {
      await options.onDenied?.({ userId: session.user.id, ip });
      throw authError(
        'AUTH_NETWORK_DENIED',
        403,
        'This account may sign in only from the allowed networks.',
        'Use an allowed network or ask an administrator.',
      );
    }
  }
  const mfa = 'twoFactorEnabled' in session.user && session.user.twoFactorEnabled === true;
  const verdict = checkMfa(policy.mfa, { mfa, createdAt: new Date(session.user.createdAt), now });
  if (verdict.status === 'enrol')
    throw authError(
      'AUTH_MFA_ENROL_REQUIRED',
      403,
      'A second factor is required and the grace period is over.',
      'Enrol a second factor.',
    );
  if (policy.session.idleMinutes > 0 && now.getTime() - seen.getTime() >= TOUCH_MS)
    await context.adapter.update({
      model: 'session',
      where: [{ field: 'id', value: session.session.id }],
      update: { updatedAt: now },
    });
  const principal: Principal = {
    id: session.user.id,
    kind: 'user',
    via: 'cookie',
    sessionId: session.session.id,
    mfa,
    ...(policy.mfa.requiredForAll ? { mfaForAll: true as const } : {}),
  };
  return verdict.status === 'grace' ? { ...principal, mfaEnrolBy: verdict.enrolBy.toISOString() } : principal;
}

/** Reads a durable cookie session or the machine key that takes precedence on entity routes (AUTH-07). */
export function createAuthenticator(auth: AuthInstance, options: AuthenticatorOptions = {}): Authenticator {
  return {
    async authenticate(request) {
      const key = keyOf(request.headers);
      if (key !== undefined) return principalOfKey(auth, key);
      const header = request.headers['cookie'];
      const cookie = Array.isArray(header) ? header.join('; ') : header;
      return cookie === undefined ? undefined : principalOfSession(auth, cookie, request, options);
    },
  };
}
