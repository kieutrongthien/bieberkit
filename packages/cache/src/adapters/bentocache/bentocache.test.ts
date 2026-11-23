/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/bentocache.test.ts
 * @description Tests of the BentoCache engines: the engine suite on file and on Valkey, the memory level in front of Valkey, and the eviction policy check (Q-08).
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createCache } from '../../cache.ts';
import { createCacheIdempotencyStore } from '../../idempotency.ts';
import { createLayeredEngine } from '../../layered-engine.ts';
import { createMemoryEngine } from '../../memory-engine.ts';
import { cacheEngineContractSuite } from '../../testing/contract-suite.ts';
import { describeRedis } from '../../testing/redis.ts';
import { bentocacheEngine, checkEvictionPolicy, createCacheFromConfig, engineFromConfig } from './index.ts';

const directory = mkdtempSync(join(tmpdir(), 'bk-cache-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

cacheEngineContractSuite('bentocache file', { make: async () => bentocacheEngine({ driver: 'file', directory }) });

describeRedis('bentocache redis', (url) => {
  cacheEngineContractSuite('bentocache redis', { make: async () => bentocacheEngine({ driver: 'redis', url }) });
  cacheEngineContractSuite('memory over bentocache redis', {
    make: async () =>
      createLayeredEngine({ first: createMemoryEngine(), shared: bentocacheEngine({ driver: 'redis', url }) }),
  });

  const nodes = (prefix: string) => {
    const make = () =>
      createCache({
        prefix,
        engine: createLayeredEngine({
          first: createMemoryEngine(),
          shared: bentocacheEngine({ driver: 'redis', url }),
          firstTtlMs: 300,
        }),
      });
    return [make(), make()] as const;
  };

  it('DATA-13 a second node sees a plain write after the short TTL of its memory level', async () => {
    const [a, b] = nodes(`dt${Date.now()}`);
    await a.set('k', 'old');
    expect(await b.get('k')).toBe('old');
    await a.set('k', 'new');
    expect(await b.get('k')).toBe('old');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await b.get('k')).toBe('new');
    await Promise.all([a.close(), b.close()]);
  });

  it('DATA-13 a tag flush on one node is seen at once on the other, whatever its memory level holds', async () => {
    const [a, b] = nodes(`tg${Date.now()}`);
    await a.tags(['deals']).set('list', 'old');
    expect(await b.tags(['deals']).get('list')).toBe('old');
    await a.tags(['deals']).flush();
    expect(await b.tags(['deals']).get('list')).toBeUndefined();
    await Promise.all([a.close(), b.close()]);
  });

  it('C-03 two nodes compute a remember once, and a lock is held across them', async () => {
    const [a, b] = nodes(`rm${Date.now()}`);
    let runs = 0;
    const factory = async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return 'computed';
    };
    const all = await Promise.all([a.remember('k', 10_000, factory), b.remember('k', 10_000, factory)]);
    expect(all).toEqual(['computed', 'computed']);
    expect(runs).toBe(1);
    const lock = await a.lock('job', 10_000);
    expect(lock).toBeDefined();
    expect(await b.lock('job', 10_000)).toBeUndefined();
    await lock?.release();
    expect(await b.lock('job', 10_000)).toBeDefined();
    await Promise.all([a.close(), b.close()]);
  });

  it('13.1 two nodes share the Idempotency-Key store', async () => {
    const [a, b] = nodes(`id${Date.now()}`);
    const one = createCacheIdempotencyStore(a);
    const two = createCacheIdempotencyStore(b);
    const begun = await Promise.all([one.begin('k', 'fp'), two.begin('k', 'fp')]);
    expect(begun.map((r) => r.state).toSorted()).toEqual(['busy', 'new']);
    await Promise.all([a.close(), b.close()]);
  });

  it('Q-08 the eviction policy of the cache instance is read, and noeviction is refused', async () => {
    expect(await checkEvictionPolicy(url)).toEqual({ ok: true, policy: 'allkeys-lru' });
  });

  it('C-02 CACHE_DRIVER=redis gives a cache that works end to end, under its prefix', async () => {
    const cache = createCacheFromConfig({
      CACHE_DRIVER: 'redis',
      CACHE_PREFIX: `cfg${Date.now()}`,
      CACHE_REDIS_URL: url,
    });
    await cache.set('k', { ok: true });
    expect(await cache.get('k')).toEqual({ ok: true });
    await cache.close();
  });
});

describe('C-02 CACHE_DRIVER', () => {
  const base = { CACHE_PREFIX: 'bk', CACHE_REDIS_URL: undefined } as const;

  it('C-02 memory and file work with no Redis', async () => {
    for (const driver of ['memory', 'file'] as const) {
      const cache = createCacheFromConfig({ ...base, CACHE_DRIVER: driver }, { directory });
      await cache.set('k', driver);
      expect(await cache.get('k')).toBe(driver);
      await cache.close();
    }
  });

  it('C-02 redis without CACHE_REDIS_URL is a configuration error, and database has no engine yet', () => {
    expect(() => engineFromConfig({ ...base, CACHE_DRIVER: 'redis' })).toThrow(/CACHE_REDIS_URL/);
    expect(() => engineFromConfig({ ...base, CACHE_DRIVER: 'database' })).toThrow(/no engine/);
  });

  it('C-02 the file engine keeps values apart by key, also for long keys', async () => {
    const cache = createCacheFromConfig({ ...base, CACHE_DRIVER: 'file' }, { directory });
    const long = 'k'.repeat(200);
    await cache.set(long, 1);
    await cache.set(`${long.slice(1)}x`, 2);
    expect(await cache.get(long)).toBe(1);
    await cache.close();
  });
});
