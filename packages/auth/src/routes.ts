/**
 * BieberKit
 *
 * @file        packages/auth/src/routes.ts
 * @description The routes of Better Auth in the HTTP server: one transaction for each request, with its audit entry and its outbox event, and the counters of the limits kept when it fails (AUTH-06, AUTH-09).
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
import { emitEvent, recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { HttpServer } from '@bieberkit/http';
import { limiterOf } from './better-auth.ts';
import type { AuthInstance } from './better-auth.ts';

export interface AuthRoutesOptions {
  readonly auth: AuthInstance;
  readonly db: Database;
  /** Where Better Auth is served. Defaults to `/api/auth`. */
  readonly prefix?: string;
}

/** What a successful call of an endpoint leaves: an audit entry and an outbox event of the same name (AUTHZ-05, section 7.5). */
const RECORDED: Readonly<Record<string, string>> = {
  '/sign-up/email': 'auth.user.signed-up',
  '/sign-in/email': 'auth.session.created',
  '/sign-out': 'auth.session.revoked',
  '/reset-password': 'auth.password.reset',
  '/verify-email': 'auth.email.verified',
  // The second factor: the secret is made (`enrolled`), a code is accepted (`verified`, which also turns it on), and so on.
  '/two-factor/enable': 'auth.mfa.enrolled',
  '/two-factor/verify-totp': 'auth.mfa.verified',
  '/two-factor/verify-backup-code': 'auth.mfa.backup-code-used',
  '/two-factor/generate-backup-codes': 'auth.mfa.backup-codes-renewed',
  '/two-factor/disable': 'auth.mfa.disabled',
  '/magic-link/verify': 'auth.session.created',
  '/passkey/verify-registration': 'auth.passkey.added',
  '/passkey/verify-authentication': 'auth.session.created',
  '/passkey/delete-passkey': 'auth.passkey.removed',
};

/** What a refused attempt leaves, in an entry of its own, because the request is rolled back. */
const FAILED: Readonly<Record<string, string>> = {
  '/sign-in/email': 'auth.signin.failed',
  '/passkey/verify-authentication': 'auth.signin.failed',
  '/two-factor/verify-totp': 'auth.mfa.failed',
  '/two-factor/verify-backup-code': 'auth.mfa.failed',
};

/** A GET that changes data, and so needs the transaction like a POST does. */
const WRITING_GETS = new Set(['/verify-email', '/magic-link/verify']);

/** Thrown inside the transaction to roll it back, with the answer that the caller gets. */
class RolledBack extends Error {
  readonly response: Response;
  constructor(response: Response) {
    super(`The request was answered ${response.status}.`);
    this.response = response;
  }
}

async function userIdOf(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    const user = typeof body === 'object' && body !== null && 'user' in body ? body.user : undefined;
    return typeof user === 'object' && user !== null && 'id' in user && typeof user.id === 'string'
      ? user.id
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Serves Better Auth under `/api/auth` (AUTH-09). A request that changes something runs in one transaction. A status below 400
 * commits it, together with the audit entry and the outbox event, so a sign up never leaves a user without its audit, nor an audit
 * without its user. Any other status rolls everything back, and the counters of the limits are counted again outside the
 * transaction, so a failed attempt still weighs. A failed sign in leaves `auth.signin.failed` in an entry of its own.
 */
export function registerAuthRoutes(server: HttpServer, options: AuthRoutesOptions): void {
  const { auth, db } = options;
  const prefix = options.prefix ?? '/api/auth';
  const limiter = limiterOf(auth);

  server.mount({
    prefix,
    handler: async (request) => {
      const path = new URL(request.url).pathname.slice(prefix.length);
      // The keys are made by code (`createApiKey`). The routes of Better Auth would let a signed in user choose the permissions and
      // the tenant of a key, so they are not served (AUTH-07).
      if (path.startsWith('/api-key/') || path === '/api-key') {
        return new Response(JSON.stringify({ message: 'Not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      const writes = request.method !== 'GET' || WRITING_GETS.has(path);
      if (!writes) return auth.handler(request);
      const recorded = RECORDED[path];

      const attempt = async (): Promise<Response> => {
        try {
          return await runInTransaction(db, async (em) => {
            const response = await auth.handler(request);
            if (response.status >= 400) throw new RolledBack(response);
            if (recorded !== undefined) {
              const actor = (await userIdOf(response)) ?? requestContext.get()?.userId;
              if (actor !== undefined && requestContext.get()?.userId === undefined)
                requestContext.update({ userId: actor });
              recordAudit(em, {
                action: recorded,
                entity: 'authUser',
                ...(actor === undefined ? {} : { recordId: actor }),
              });
              emitEvent(em, { name: recorded, payload: actor === undefined ? {} : { userId: actor } });
              await em.flush();
            }
            return response;
          });
        } catch (error) {
          if (error instanceof RolledBack) return error.response;
          throw error;
        }
      };

      const { value, consumed } =
        limiter === undefined ? { value: await attempt(), consumed: [] } : await limiter.capture(attempt);
      if (value.status >= 400) {
        // The transaction was rolled back, and with it the counters that the request had written.
        await limiter?.replay(consumed);
        const failed = FAILED[path];
        if (failed !== undefined && (value.status === 401 || value.status === 400)) {
          // Best effort: a failure to write the entry never changes the answer.
          try {
            const em = db.fork();
            recordAudit(em, { action: failed, entity: 'authUser' });
            await em.flush();
          } catch {
            // The audit table is the one place that cannot report its own failure.
          }
        }
      }
      return value;
    },
  });
}
