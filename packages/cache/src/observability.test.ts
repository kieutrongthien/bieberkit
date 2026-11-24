/**
 * BieberKit
 *
 * @file        packages/cache/src/observability.test.ts
 * @description Tests of what the cache records: a span for each call that names the operation and never the key, and the lookups that give the hit ratio (OBS-02, OBS-03, ADR 0023).
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

import { createMemorySpanExporter, createMetrics, createTracer, requestContext } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { createMemoryEngine } from './memory-engine.ts';

function observed() {
  const exporter = createMemorySpanExporter();
  const metrics = createMetrics();
  const cache = createCache({ engine: createMemoryEngine(), tracer: createTracer({ exporter }), metrics });
  return { cache, metrics, spans: exporter.spans };
}

const names = (spans: readonly { name: string }[]): string[] => spans.map((span) => span.name);

describe('OBS-02 spans of the cache', () => {
  it('OBS-02 each call is a client span that names the operation and says hit or miss', async () => {
    const { cache, spans } = observed();
    await cache.get('deal:1');
    await cache.set('deal:1', { n: 1 });
    await cache.get('deal:1');
    await cache.has('deal:1');
    await cache.forget('deal:1');
    expect(names(spans)).toEqual(['cache get', 'cache set', 'cache get', 'cache has', 'cache forget']);
    expect(spans.every((span) => span.kind === 'client')).toBe(true);
    expect(spans.map((span) => span.attributes['bk.cache.hit'])).toEqual([false, undefined, true, true, undefined]);
  });

  it('OBS-02 a span never holds a key, which can hold an id or an address', async () => {
    const { cache, spans } = observed();
    await cache.set('user:alice@example.com', 1);
    await cache.get('user:alice@example.com');
    await cache.tags(['crm']).set('deal:hidden-id', 1);
    const text = JSON.stringify(spans, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value));
    for (const secret of ['alice', 'example.com', 'user:', 'deal:', 'hidden-id']) expect(text).not.toContain(secret);
  });

  it('OBS-02 remember, lock and the atomic calls have spans, and a call inside a request is in its trace', async () => {
    const { cache, spans } = observed();
    await requestContext.run({ requestId: 'r', traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }, async () => {
      await cache.remember('k', 1_000, () => 5);
      const lock = await cache.lock('l', 1_000);
      await lock?.release();
      await cache.atomic.add('n', 1, 1_000);
      await cache.atomic.get('n');
      await cache.atomic.set('n', 2, 1_000);
      await cache.atomic.delete('n');
    });
    expect(names(spans)).toEqual([
      'cache remember',
      'cache lock',
      'cache atomic add',
      'cache atomic get',
      'cache atomic set',
      'cache atomic delete',
    ]);
    expect(spans.every((span) => span.traceId === 'a'.repeat(32) && span.parentSpanId === 'b'.repeat(16))).toBe(true);
  });

  it('OBS-02 a call that fails fails its span and throws what it threw', async () => {
    const { cache, spans } = observed();
    await expect(cache.set('k', 1, -5)).rejects.toMatchObject({ code: 'CACHE_TTL_INVALID' });
    expect(spans[0]).toMatchObject({ name: 'cache set', failed: true });
  });
});

describe('OBS-03 the hit ratio', () => {
  it('OBS-03 counts a hit and a miss for get, has and remember, and nothing for the atomic calls', async () => {
    const { cache, metrics } = observed();
    await cache.get('a'); // miss
    await cache.set('a', 1);
    await cache.get('a'); // hit
    await cache.has('a'); // hit
    await cache.has('zzz'); // miss
    await cache.remember('r', 1_000, () => 1); // miss, then stored
    await cache.remember('r', 1_000, () => 1); // hit
    await cache.atomic.get('a');
    const text = await metrics.render();
    expect(text).toContain('# TYPE bk_cache_lookups_total counter');
    expect(text).toContain('bk_cache_lookups_total{result="hit"} 3');
    expect(text).toContain('bk_cache_lookups_total{result="miss"} 3');
  });
});

describe('OBS-02 a cache with no tracer', () => {
  it('OBS-02 works as before', async () => {
    const cache = createCache({ engine: createMemoryEngine() });
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
  });
});
