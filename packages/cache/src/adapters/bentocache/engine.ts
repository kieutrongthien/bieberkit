/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/engine.ts
 * @description The cache engine on BentoCache drivers (file and redis), and the check of the eviction policy of the Redis that holds the cache (Q-08).
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

import { BentoCache, bentostore } from 'bentocache';
import { fileDriver } from 'bentocache/drivers/file';
import { redisDriver } from 'bentocache/drivers/redis';
import { Redis } from 'ioredis';
import { cacheError } from '../../contract.ts';
import type { CacheEngine } from '../../contract.ts';
import { createMemoryEngine } from '../../memory-engine.ts';
import { redisAtomic } from './redis-atomic.ts';

export type BentocacheEngineOptions =
  | {
      /** One directory per node. It is not shared, so `atomic` is per process (C-02, CFG-07). */
      readonly driver: 'file';
      readonly directory: string;
    }
  | {
      /** The Redis or Valkey that holds the cache, with an eviction policy (`CACHE_REDIS_URL`, Q-08). */
      readonly driver: 'redis';
      readonly url: string;
    };

/**
 * An engine whose values live in a BentoCache driver. BentoCache is used as one shared level here: the short memory level in front
 * of Redis is `createLayeredEngine`, so that its TTL is the 5 seconds of DATA-13 and not the TTL of the entry.
 */
export function bentocacheEngine(options: BentocacheEngineOptions): CacheEngine {
  let client: Redis | undefined;
  let layer;
  if (options.driver === 'redis') {
    client = new Redis(options.url, { maxRetriesPerRequest: 2, lazyConnect: false });
    layer = redisDriver({ connection: client });
  } else {
    layer = fileDriver({ directory: options.directory });
  }
  const bento = new BentoCache({ default: 'cache', stores: { cache: bentostore().useL2Layer(layer) } });
  const local = options.driver === 'file' ? createMemoryEngine({ maxEntries: 100_000 }).atomic : undefined;
  const atomic = client === undefined ? local : redisAtomic(client);
  if (atomic === undefined) throw cacheError('CACHE_CONFIG_INVALID', 500, 'No atomic keys.', 'Report this as a bug.');
  return {
    name: options.driver,
    async get(key) {
      return (await bento.get<string>({ key })) ?? undefined;
    },
    async set(key, value, ttlMs) {
      await bento.set({ key, value, ttl: ttlMs });
    },
    async delete(key) {
      await bento.delete({ key });
    },
    atomic,
    async close() {
      await bento.disconnect();
      if (client !== undefined && client.status !== 'end') await client.quit().catch(() => client?.disconnect());
    },
  };
}

/**
 * The eviction policy of the Redis at `url`. A cache needs one that evicts (`allkeys-lru`, or `volatile-*` because every key has a
 * TTL). `noeviction` is the right policy for the queue instance and the wrong one here (Q-08).
 */
export async function checkEvictionPolicy(url: string): Promise<{ readonly ok: boolean; readonly policy: string }> {
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  try {
    const answer = await client.config('GET', 'maxmemory-policy');
    const policy = Array.isArray(answer) ? String(answer[1] ?? 'unknown') : 'unknown';
    return { ok: policy !== 'noeviction' && policy !== 'unknown', policy };
  } finally {
    client.disconnect();
  }
}
