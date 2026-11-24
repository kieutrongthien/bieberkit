/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/secondary-storage.ts
 * @description The session store of Better Auth on Valkey: get, set with a lifetime, delete, an atomic get and delete, and a counter that keeps its first lifetime (AUTH-02).
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

import { Redis } from 'ioredis';

/** The shape that Better Auth asks of a secondary storage. It is written out here so that this package does not depend on Better Auth. */
export interface RedisSecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Closes the connection. Call it when the application stops. */
  close(): Promise<void>;
}

export interface RedisSecondaryStorageOptions {
  /** The Valkey of sessions and counters (`REDIS_URL`), the one with `noeviction`: a session that is evicted signs a user out. */
  readonly url: string;
  /** Isolates apps that share one server. Defaults to `bk`. */
  readonly prefix?: string;
}

/** Counts from one, and gives the key its lifetime only when it is made, so a window of counting never moves. */
const INCREMENT = `local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return n`;

/**
 * The secondary storage of Better Auth on Valkey (AUTH-02): sessions are found in one hop by every web replica, and the database stays
 * the source of truth when `session.storeSessionInDatabase` is on. Every key is under `<prefix>:auth:`. A value that is not text is
 * refused by Redis itself, and Better Auth writes text.
 */
export function redisSecondaryStorage(options: RedisSecondaryStorageOptions): RedisSecondaryStorage {
  const prefix = `${options.prefix ?? 'bk'}:auth:`;
  const client = new Redis(options.url, { maxRetriesPerRequest: 2 });
  client.on('error', () => undefined);
  return {
    async get(key) {
      return client.get(prefix + key);
    },
    async getAndDelete(key) {
      return client.getdel(prefix + key);
    },
    async increment(key, ttlSeconds) {
      return Number(await client.eval(INCREMENT, 1, prefix + key, String(Math.max(1, Math.ceil(ttlSeconds)))));
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds === undefined || ttlSeconds <= 0) await client.set(prefix + key, value);
      else await client.set(prefix + key, value, 'EX', Math.ceil(ttlSeconds));
    },
    async delete(key) {
      await client.del(prefix + key);
    },
    async close() {
      if (client.status !== 'end') await client.quit().catch(() => client.disconnect());
    },
  };
}
