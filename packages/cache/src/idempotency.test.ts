/**
 * BieberKit
 *
 * @file        packages/cache/src/idempotency.test.ts
 * @description Tests of the Idempotency-Key store on the cache: the four states, two processes on one store, expiry and hashed keys (13.1).
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

import { describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { createCacheIdempotencyStore } from './idempotency.ts';
import { createMemoryEngine } from './memory-engine.ts';

const response = { status: 201, headers: { 'content-type': 'application/json' }, body: '{"id":"1"}' };

function stores() {
  const engine = createMemoryEngine();
  const a = createCacheIdempotencyStore(createCache({ engine }));
  const b = createCacheIdempotencyStore(createCache({ engine }));
  return { engine, a, b };
}

describe('13.1 cache idempotency store', () => {
  it('13.1 the first request is new, an equal one before the answer is busy, and one after the answer is a replay', async () => {
    const { a } = stores();
    expect(await a.begin('k', 'fp')).toEqual({ state: 'new' });
    expect(await a.begin('k', 'fp')).toEqual({ state: 'busy' });
    await a.complete('k', response);
    expect(await a.begin('k', 'fp')).toEqual({ state: 'replay', response });
  });

  it('13.1 the same key with another request is a mismatch, before and after the answer', async () => {
    const { a } = stores();
    await a.begin('k', 'fp');
    expect(await a.begin('k', 'other')).toEqual({ state: 'mismatch' });
    await a.complete('k', response);
    expect(await a.begin('k', 'other')).toEqual({ state: 'mismatch' });
  });

  it('13.1 abandon frees the key for a new try', async () => {
    const { a } = stores();
    await a.begin('k', 'fp');
    await a.abandon('k');
    expect(await a.begin('k', 'fp')).toEqual({ state: 'new' });
  });

  it('13.1 two processes on one store: exactly one gets new, and the other sees the same answer', async () => {
    const { a, b } = stores();
    const begun = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? a : b).begin('k', 'fp')));
    expect(begun.filter((r) => r.state === 'new')).toHaveLength(1);
    expect(begun.filter((r) => r.state === 'busy')).toHaveLength(19);
    await a.complete('k', response);
    expect(await b.begin('k', 'fp')).toEqual({ state: 'replay', response });
  });

  it('13.1 keys of any length and bytes are kept, and different keys are different', async () => {
    const { a } = stores();
    const long = `user-1\u0000POST /api/v1/deals\u0000${'x'.repeat(255)}`;
    expect(await a.begin(long, 'fp')).toEqual({ state: 'new' });
    expect(await a.begin(`${long}y`, 'fp')).toEqual({ state: 'new' });
    expect(await a.begin(long, 'fp')).toEqual({ state: 'busy' });
  });

  it('13.1 a request that never finishes frees its key after the pending TTL, and an answer is kept for the TTL', async () => {
    let now = 0;
    const engine = createMemoryEngine({ now: () => now });
    const store = createCacheIdempotencyStore(createCache({ engine }), { ttlMs: 10_000, pendingTtlMs: 1_000 });
    await store.begin('crashed', 'fp');
    await store.begin('done', 'fp');
    await store.complete('done', response);
    now = 1_000;
    expect(await store.begin('crashed', 'fp')).toEqual({ state: 'new' });
    expect((await store.begin('done', 'fp')).state).toBe('replay');
    now = 10_001;
    expect(await store.begin('done', 'fp')).toEqual({ state: 'new' });
  });

  it('13.1 complete after the key expired does nothing', async () => {
    let now = 0;
    const store = createCacheIdempotencyStore(createCache({ engine: createMemoryEngine({ now: () => now }) }), {
      pendingTtlMs: 100,
    });
    await store.begin('k', 'fp');
    now = 200;
    await store.complete('k', response);
    expect(await store.begin('k', 'fp')).toEqual({ state: 'new' });
  });

  it('13.1 the keys of two apps that share a store do not meet', async () => {
    const engine = createMemoryEngine();
    const one = createCacheIdempotencyStore(createCache({ engine, prefix: 'one' }));
    const two = createCacheIdempotencyStore(createCache({ engine, prefix: 'two' }));
    await one.begin('k', 'fp');
    expect(await two.begin('k', 'fp')).toEqual({ state: 'new' });
  });
});
