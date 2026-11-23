/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/redis-atomic.ts
 * @description The strongly consistent keys of the cache on Redis or Valkey: set if absent, compare and delete, and a counter with expiry.
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

import type { Redis } from 'ioredis';
import type { Atomic } from '../../contract.ts';

/** Deletes the key only if it holds the value, in one step, so a lock that expired is never released by its old owner. */
const DELETE_IF = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;
/** Counts from zero and keeps the key for `ttl` after the last call. */
const INCREMENT = `local n = redis.call('INCR', KEYS[1]) redis.call('PEXPIRE', KEYS[1], ARGV[1]) return n`;

export function redisAtomic(client: Redis): Atomic {
  return {
    async add(key, value, ttlMs) {
      return (await client.set(key, value, 'PX', ttlMs, 'NX')) === 'OK';
    },
    async get(key) {
      return (await client.get(key)) ?? undefined;
    },
    async set(key, value, ttlMs) {
      await client.set(key, value, 'PX', ttlMs);
    },
    async delete(key) {
      await client.del(key);
    },
    async deleteIf(key, value) {
      return Number(await client.eval(DELETE_IF, 1, key, value)) === 1;
    },
    async increment(key, ttlMs) {
      return Number(await client.eval(INCREMENT, 1, key, String(ttlMs)));
    },
  };
}
