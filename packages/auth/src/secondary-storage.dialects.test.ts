/**
 * BieberKit
 *
 * @file        packages/auth/src/secondary-storage.dialects.test.ts
 * @description Tests of the sessions on Valkey with a real server: a session is written to Valkey and to the database, found by another replica, still good when Valkey loses its data, and gone at sign out (AUTH-02).
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

import { randomBytes } from 'node:crypto';
import { describe, expect, inject, it } from 'vitest';
import { redisSecondaryStorage } from '@bieberkit/cache/bentocache';
import type { AuthSecondaryStorage } from './better-auth.ts';
import { authServer, cookieOf } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    cacheRedisUrl: string;
  }
}

interface Spy {
  readonly storage: AuthSecondaryStorage;
  readonly sets: string[];
  readonly deletes: string[];
  readonly gets: string[];
  close(): Promise<void>;
}

/** The store of Valkey, and what Better Auth asked of it. */
function spy(url: string, prefix: string): Spy {
  const real = redisSecondaryStorage({ url, prefix });
  const sets: string[] = [];
  const deletes: string[] = [];
  const gets: string[] = [];
  return {
    sets,
    deletes,
    gets,
    close: () => real.close(),
    storage: {
      get: async (key) => (gets.push(key), real.get(key)),
      getAndDelete: (key) => real.getAndDelete(key),
      increment: (key, ttl) => real.increment(key, ttl),
      set: async (key, value, ttl) => (sets.push(key), real.set(key, value, ttl)),
      delete: async (key) => (deletes.push(key), real.delete(key)),
    },
  };
}

const prefix = (): string => `ses${randomBytes(4).toString('hex')}`;
const url = inject('cacheRedisUrl');
const run = url === '' ? describe.skip : describe;

run('AUTH-02 sessions on Valkey', () => {
  describeDialects('AUTH-02 the sessions of Better Auth', ({ open }) => {
    it('AUTH-02 a sign in writes the session to Valkey and to the database, and get-session reads Valkey first', async () => {
      const store = spy(url, prefix());
      const app = await authServer(open, { secondaryStorage: store.storage });
      const { id, cookie } = await app.login('an@example.vn');
      expect(store.sets.some((key) => key.includes('session') || key.includes('active'))).toBe(true);
      // `login` signs up, which makes a session, and signs in, which makes another.
      expect(await app.count('bk_auth_sessions')).toBe(2);
      store.gets.length = 0;
      const answer = await app.api('GET', '/get-session', { cookie });
      expect(answer.status).toBe(200);
      expect(JSON.stringify(answer.body)).toContain(id);
      expect(store.gets.length).toBeGreaterThan(0);
      await store.close();
    });

    it('AUTH-02 another replica, with its own connection to the same Valkey and database, knows the session at once', async () => {
      const one = spy(url, 'shared-prefix-a');
      const first = await authServer(open, { secondaryStorage: one.storage });
      const { cookie } = await first.login('an@example.vn');
      const two = spy(url, 'shared-prefix-a');
      const second = await authServer(open, { db: first.db, secondaryStorage: two.storage });
      two.gets.length = 0;
      const answer = await second.api('GET', '/get-session', { cookie });
      expect(answer.status).toBe(200);
      expect(answer.body['user']).toBeDefined();
      expect(two.gets.length).toBeGreaterThan(0);
      await one.close();
      await two.close();
    });

    it('AUTH-02 a Valkey that lost its data signs nobody out: the session is still in the database', async () => {
      const first = spy(url, prefix());
      const app = await authServer(open, { secondaryStorage: first.storage });
      const { cookie } = await app.login('an@example.vn');
      // The same database, a Valkey that has nothing (another prefix): what happens after a restart without persistence.
      const empty = spy(url, prefix());
      const afterLoss = await authServer(open, { db: app.db, secondaryStorage: empty.storage });
      const answer = await afterLoss.api('GET', '/get-session', { cookie });
      expect(answer.status).toBe(200);
      expect(answer.body['user']).toBeDefined();
      await first.close();
      await empty.close();
    });

    it('AUTH-02 sign out removes the session from Valkey and from the database, and the cookie is no longer good', async () => {
      const store = spy(url, prefix());
      const app = await authServer(open, { secondaryStorage: store.storage });
      const { cookie } = await app.login('an@example.vn');
      store.deletes.length = 0;
      const before = await app.count('bk_auth_sessions');
      const out = await app.api('POST', '/sign-out', { cookie, payload: {} });
      expect(out.status).toBe(200);
      expect(store.deletes.length).toBeGreaterThan(0);
      expect(await app.count('bk_auth_sessions')).toBe(before - 1);
      const after = await app.api('GET', '/get-session', { cookie });
      expect(after.body['user']).toBeUndefined();
      await store.close();
    });

    it('AUTH-02 without Valkey the sessions are in the database only, as before', async () => {
      const app = await authServer(open);
      const { cookie } = await app.login('an@example.vn');
      expect(cookieOf(await app.signIn('an@example.vn'))).toBeDefined();
      expect((await app.api('GET', '/get-session', { cookie })).status).toBe(200);
      expect(await app.count('bk_auth_sessions')).toBeGreaterThanOrEqual(1);
    });
  });
});
