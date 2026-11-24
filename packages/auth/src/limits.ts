/**
 * BieberKit
 *
 * @file        packages/auth/src/limits.ts
 * @description The limits on sign in, sign up and password reset: counters in the database, per address and per account, that count a failed request too (AUTH-06, AUTH-10, SEC-10).
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

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { uuid7 } from '@bieberkit/data';
import { requestKysely } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';

/** At most `max` requests in `window` seconds. */
export interface Limit {
  readonly window: number;
  readonly max: number;
}

/** A limit per address of the client and a limit per account (the email of the request). */
export interface Limit2 {
  readonly perIp?: Limit;
  readonly perAccount?: Limit;
}

export interface AuthLimits {
  readonly signIn?: Limit2;
  readonly signUp?: Limit2;
  readonly passwordReset?: Limit2;
  /** The magic link: the request by email, and the use of the link. */
  readonly magicLink?: Limit2;
  /** The second factor: a TOTP code and a backup code. Only per address, because Better Auth locks the account of the code itself. */
  readonly mfa?: Limit2;
}

/** What a project gets when it says nothing (SEC-10). */
export const DEFAULT_LIMITS: Required<AuthLimits> = {
  signIn: { perIp: { window: 60, max: 5 }, perAccount: { window: 900, max: 10 } },
  signUp: { perIp: { window: 60, max: 5 } },
  passwordReset: { perIp: { window: 900, max: 3 }, perAccount: { window: 900, max: 3 } },
  magicLink: { perIp: { window: 60, max: 5 }, perAccount: { window: 900, max: 5 } },
  mfa: { perIp: { window: 60, max: 10 } },
};

export interface Consumption {
  readonly key: string;
  readonly rule: Limit;
}

export interface ConsumeResult {
  readonly allowed: boolean;
  readonly retryAfter: number | null;
}

/** The storage that Better Auth asks for: one atomic step that records a request and says whether it may go on. */
export interface RateStorage {
  consume(key: string, rule: Limit): Promise<ConsumeResult>;
}

export interface RateLimiter {
  readonly storage: RateStorage;
  /** Runs `run`, and lists every counter that it used. */
  capture<T>(run: () => Promise<T>): Promise<{ readonly value: T; readonly consumed: readonly Consumption[] }>;
  /** Counts again what a rolled back request had counted, so a failed request still weighs (AUTH-06). */
  replay(consumed: readonly Consumption[]): Promise<void>;
}

/** The rules of Better Auth for the paths that are limited per address, and the rules per account by path. */
export function rulesOf(limits: AuthLimits = {}): {
  readonly perIp: Readonly<Record<string, Limit>>;
  readonly perAccount: Readonly<Record<string, Limit>>;
} {
  const pick = (name: keyof AuthLimits): Limit2 => ({ ...DEFAULT_LIMITS[name], ...limits[name] });
  const signIn = pick('signIn');
  const signUp = pick('signUp');
  const reset = pick('passwordReset');
  const link = pick('magicLink');
  const mfa = pick('mfa');
  const on = (rule: Limit | undefined, paths: string[]): [string, Limit][] =>
    rule === undefined ? [] : paths.map((path) => [path, rule]);
  return {
    perIp: Object.fromEntries([
      ...on(signIn.perIp, ['/sign-in/email']),
      ...on(signUp.perIp, ['/sign-up/email']),
      ...on(reset.perIp, ['/request-password-reset', '/reset-password']),
      ...on(link.perIp, ['/sign-in/magic-link', '/magic-link/verify']),
      ...on(mfa.perIp, ['/two-factor/verify-totp', '/two-factor/verify-backup-code', '/passkey/verify-authentication']),
    ]),
    perAccount: Object.fromEntries([
      ...on(signIn.perAccount, ['/sign-in/email']),
      ...on(reset.perAccount, ['/request-password-reset']),
      ...on(link.perAccount, ['/sign-in/magic-link']),
    ]),
  };
}

/** The key of an account counter: the hash of the address, never the address (PDP-06). */
export function accountKey(path: string, email: string): string {
  return `account:${path}:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
}

/**
 * The counters live in `bk_auth_rate_limits`, so every replica sees them. One statement records a request and reads the count, so
 * requests at the same time cannot all pass a stale read. A counter is a fixed window: it starts at the first request, and a
 * request after the window starts a new one.
 */
export function createRateLimiter(db: Database): RateLimiter {
  const requests = new AsyncLocalStorage<Consumption[]>();

  const storage: RateStorage = {
    async consume(key, rule) {
      requests.getStore()?.push({ key, rule });
      const kysely = requestKysely(db);
      const now = Date.now();
      const start = now - rule.window * 1000;
      const insert = kysely.insertInto('authRateLimit').values({ id: uuid7(), key, count: 1, lastRequest: now });
      let row: Record<string, unknown> | undefined;
      if (db.dialect === 'mysql') {
        // MySQL has no RETURNING, and it evaluates the assignments in the order that they are written.
        await insert
          .onDuplicateKeyUpdate({
            count: sql`if(last_request <= ${start}, 1, count + 1)`,
            lastRequest: sql`if(last_request <= ${start}, ${now}, last_request)`,
          })
          .execute();
        row = await kysely
          .selectFrom('authRateLimit')
          .select(['count', 'lastRequest'])
          .where('key', '=', key)
          .executeTakeFirst();
      } else {
        row = await insert
          .onConflict((conflict) =>
            conflict.column('key').doUpdateSet({
              count: sql`case when bk_auth_rate_limits.last_request <= ${start} then 1 else bk_auth_rate_limits.count + 1 end`,
              lastRequest: sql`case when bk_auth_rate_limits.last_request <= ${start} then ${now} else bk_auth_rate_limits.last_request end`,
            }),
          )
          .returning(['count', 'lastRequest'])
          .executeTakeFirst();
      }
      const used = Number(row?.['count'] ?? 1);
      const began = Number(row?.['lastRequest'] ?? row?.['last_request'] ?? now);
      if (used <= rule.max) return { allowed: true, retryAfter: null };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((began + rule.window * 1000 - now) / 1000)) };
    },
  };

  return {
    storage,
    async capture(run) {
      const consumed: Consumption[] = [];
      const value = await requests.run(consumed, run);
      return { value, consumed };
    },
    async replay(consumed) {
      // Outside `capture`, so a replay is not itself captured.
      for (const item of consumed) await storage.consume(item.key, item.rule);
    },
  };
}
