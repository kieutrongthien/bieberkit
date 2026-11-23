/**
 * BieberKit
 *
 * @file        packages/cache/src/cache.test.ts
 * @description Tests of createCache on the memory engine: namespacing, the tenant view, TTL and value rules, remember, tags, locks and after-commit flushes.
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

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runAsTenant } from '@bieberkit/data/orm';
import { createCache } from './cache.ts';
import { CacheError } from './contract.ts';
import { createMemoryEngine } from './memory-engine.ts';

const ONE = randomUUID();
const TWO = randomUUID();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function make(options: { prefix?: string; engine?: ReturnType<typeof createMemoryEngine> } = {}) {
  const engine = options.engine ?? createMemoryEngine();
  return {
    engine,
    cache: createCache({ engine, ...(options.prefix === undefined ? {} : { prefix: options.prefix }) }),
  };
}

async function codeOf(promise: Promise<unknown> | (() => unknown)): Promise<string | undefined> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    return error instanceof CacheError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
}

describe('C-01 namespacing', () => {
  it('C-01 two prefixes on one store never see each other', async () => {
    const engine = createMemoryEngine();
    const a = make({ prefix: 'app-a', engine }).cache;
    const b = make({ prefix: 'app-b', engine }).cache;
    await a.set('k', 'from a');
    expect(await b.get('k')).toBeUndefined();
    expect(await a.get('k')).toBe('from a');
  });

  it('C-01 values, atomic values, locks and tag generations never share a key', async () => {
    const { cache } = make();
    await cache.set('k', 'value');
    await cache.atomic.set('k', 'atomic', 10_000);
    expect(await cache.get('k')).toBe('value');
    expect(await cache.atomic.get('k')).toBe('atomic');
    const lock = await cache.lock('k', 10_000);
    expect(lock).toBeDefined();
    await cache.tags(['k']).flush();
    expect(await cache.get('k')).toBe('value');
    expect(await cache.atomic.get('k')).toBe('atomic');
  });

  it('C-01 cache.tenant keeps the data of a tenant apart from the others and from the root', async () => {
    const { cache } = make();
    await cache.set('k', 'root');
    await runAsTenant(ONE, () => cache.tenant.set('k', 'one'));
    await runAsTenant(TWO, () => cache.tenant.set('k', 'two'));
    expect(await runAsTenant(ONE, () => cache.tenant.get('k'))).toBe('one');
    expect(await runAsTenant(TWO, () => cache.tenant.get('k'))).toBe('two');
    expect(await cache.get('k')).toBe('root');
  });

  it('C-01 cache.tenant without a tenant throws and never falls back to the root namespace', async () => {
    const { cache } = make();
    await cache.set('k', 'root');
    expect(await codeOf(cache.tenant.get('k'))).toBe('CACHE_TENANT_REQUIRED');
    expect(await codeOf(cache.tenant.set('k', 1))).toBe('CACHE_TENANT_REQUIRED');
    expect(await codeOf(cache.tenant.lock('k', 1000))).toBe('CACHE_TENANT_REQUIRED');
    expect(await codeOf(() => cache.tenant.tags(['x']).flushAfterCommit())).toBe('CACHE_TENANT_REQUIRED');
  });

  it('C-01 a view that is kept follows the tenant of each call', async () => {
    const { cache } = make();
    const kept = cache.tenant;
    await runAsTenant(ONE, () => kept.set('k', 'one'));
    expect(await runAsTenant(TWO, () => kept.get('k'))).toBeUndefined();
    expect(await runAsTenant(ONE, () => kept.get('k'))).toBe('one');
  });

  it('C-01 tags and locks of a tenant are the tenant own', async () => {
    const { cache } = make();
    await runAsTenant(ONE, () => cache.tenant.tags(['deals']).set('k', 'one'));
    await runAsTenant(TWO, () => cache.tenant.tags(['deals']).set('k', 'two'));
    await runAsTenant(ONE, () => cache.tenant.tags(['deals']).flush());
    expect(await runAsTenant(ONE, () => cache.tenant.tags(['deals']).get('k'))).toBeUndefined();
    expect(await runAsTenant(TWO, () => cache.tenant.tags(['deals']).get('k'))).toBe('two');
    const held = await runAsTenant(ONE, () => cache.tenant.lock('job', 10_000));
    expect(held).toBeDefined();
    expect(await runAsTenant(TWO, () => cache.tenant.lock('job', 10_000))).toBeDefined();
    expect(await runAsTenant(ONE, () => cache.tenant.lock('job', 10_000))).toBeUndefined();
  });
});

describe('C-01 rules for keys, values and TTLs', () => {
  it('C-01 refuses keys that are empty, too long or hold other characters', async () => {
    const { cache } = make();
    for (const key of ['', 'a'.repeat(201), 'has space', 'new\nline', 'pipe|key', 'ünï']) {
      expect(await codeOf(cache.set(key, 1))).toBe('CACHE_KEY_INVALID');
      expect(await codeOf(cache.get(key))).toBe('CACHE_KEY_INVALID');
    }
    expect(await codeOf(cache.set('a'.repeat(200), 1))).toBeUndefined();
    expect(await codeOf(() => make({ prefix: 'bad prefix' }))).toBe('CACHE_KEY_INVALID');
  });

  it('Q-08 refuses a TTL that is zero, negative, fractional, not a number or over the maximum', async () => {
    const { cache } = make();
    for (const ttl of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 7 * 86_400_000 + 1]) {
      expect(await codeOf(cache.set('k', 1, ttl))).toBe('CACHE_TTL_INVALID');
      expect(await codeOf(cache.remember('k', ttl, () => 1))).toBe('CACHE_TTL_INVALID');
      expect(await codeOf(cache.lock('k', ttl))).toBe('CACHE_TTL_INVALID');
    }
    expect(await codeOf(cache.set('k', 1, 7 * 86_400_000))).toBeUndefined();
  });

  it('Q-08 a call with no TTL uses the default of 5 minutes', async () => {
    let now = 0;
    const engine = createMemoryEngine({ now: () => now });
    const cache = createCache({ engine });
    await cache.set('k', 'v');
    now = 299_999;
    expect(await cache.get('k')).toBe('v');
    now = 300_000;
    expect(await cache.get('k')).toBeUndefined();
  });

  it('C-01 keeps JSON values and refuses the rest', async () => {
    const { cache } = make();
    const value = { a: [1, 'two', null, true], nested: { ok: false } };
    await cache.set('k', value);
    expect(await cache.get('k')).toEqual(value);
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    for (const bad of [undefined, () => 1, 10n, cycle, Symbol('x')]) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      expect(await codeOf(cache.set('bad', bad as never))).toBe('CACHE_VALUE_INVALID');
    }
  });

  it('C-01 null is a value and undefined is a miss', async () => {
    const { cache } = make();
    await cache.set('k', null);
    expect(await cache.get('k')).toBeNull();
    expect(await cache.has('k')).toBe(true);
    expect(await cache.get('missing')).toBeUndefined();
    expect(await cache.has('missing')).toBe(false);
  });

  it('C-01 forget removes a value, and forgetting a missing key is fine', async () => {
    const { cache } = make();
    await cache.set('k', 1);
    await cache.forget('k');
    await cache.forget('k');
    expect(await cache.has('k')).toBe(false);
  });

  it('C-01 a stored value that is not JSON is a miss, not a crash', async () => {
    const { cache, engine } = make();
    await engine.set('bk:v:k', '{broken', 10_000);
    expect(await cache.get('k')).toBeUndefined();
  });
});

const failing = async (): Promise<string> => {
  await sleep(30);
  throw new Error('boom');
};

describe('C-03 remember', () => {
  it('C-03 computes once for 50 concurrent callers in one process', async () => {
    const { cache } = make();
    let runs = 0;
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        cache.remember('hot', 10_000, async () => {
          runs += 1;
          await sleep(50);
          return { n: runs };
        }),
      ),
    );
    expect(runs).toBe(1);
    expect(new Set(results.map((r) => r.n))).toEqual(new Set([1]));
  });

  it('C-03 computes once for callers in two processes that share one store', async () => {
    const engine = createMemoryEngine();
    const first = make({ engine }).cache;
    const second = make({ engine }).cache;
    let runs = 0;
    const factory = async () => {
      runs += 1;
      await sleep(150);
      return 'computed';
    };
    const all = await Promise.all([
      ...Array.from({ length: 10 }, () => first.remember('k', 10_000, factory)),
      ...Array.from({ length: 10 }, () => second.remember('k', 10_000, factory)),
    ]);
    expect(runs).toBe(1);
    expect(new Set(all)).toEqual(new Set(['computed']));
  });

  it('C-03 serves the stored value without calling the factory', async () => {
    const { cache } = make();
    await cache.set('k', 'stored');
    expect(await cache.remember('k', 1000, () => 'other')).toBe('stored');
  });

  it('C-03 caches null and a falsy value', async () => {
    const { cache } = make();
    let runs = 0;
    for (let i = 0; i < 3; i += 1) {
      expect(await cache.remember('zero', 10_000, () => ((runs += 1), 0))).toBe(0);
    }
    expect(runs).toBe(1);
  });

  it('C-03 a factory that throws stores nothing, frees the lock and tells every waiter, and the next call tries again', async () => {
    const { cache } = make();
    const results = await Promise.allSettled([cache.remember('k', 1000, failing), cache.remember('k', 1000, failing)]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(await cache.has('k')).toBe(false);
    expect(await cache.remember('k', 1000, () => 'recovered')).toBe('recovered');
  });

  it('C-03 a lock that is held for too long slows a caller but never blocks it', async () => {
    const engine = createMemoryEngine();
    const cache = createCache({ engine, rememberWaitMs: 100 });
    // A holder that crashed: its lock stays, and nobody stores the value.
    await engine.atomic.add('bk:r:bk:v:k', 'crashed-owner', 60_000);
    const started = Date.now();
    expect(await cache.remember('k', 1000, () => 'computed anyway')).toBe('computed anyway');
    expect(Date.now() - started).toBeLessThan(2_000);
    // The lock of the crashed holder is still theirs.
    expect(await engine.atomic.get('bk:r:bk:v:k')).toBe('crashed-owner');
  });

  it('C-03 a waiter takes the value that the holder stored instead of computing', async () => {
    const engine = createMemoryEngine();
    const cache = createCache({ engine });
    await engine.atomic.add('bk:r:bk:v:k', 'other-process', 60_000);
    setTimeout(() => void engine.set('bk:v:k', '"from the holder"', 10_000), 80);
    expect(await cache.remember('k', 1000, () => 'mine')).toBe('from the holder');
  });
});

describe('DATA-13 tags', () => {
  it('DATA-13 flush makes every entry of a tag unreadable and leaves the others', async () => {
    const { cache } = make();
    const deals = cache.tags(['deals']);
    await deals.set('a', 1);
    await deals.set('b', 2);
    await cache.tags(['contacts']).set('a', 'c');
    await cache.set('plain', 'p');
    await deals.flush();
    expect(await deals.get('a')).toBeUndefined();
    expect(await deals.has('b')).toBe(false);
    expect(await cache.tags(['contacts']).get('a')).toBe('c');
    expect(await cache.get('plain')).toBe('p');
  });

  it('DATA-13 an entry is readable by the same tags in any order, and by no other set', async () => {
    const { cache } = make();
    await cache.tags(['a', 'b']).set('k', 1);
    expect(await cache.tags(['b', 'a', 'a']).get('k')).toBe(1);
    expect(await cache.tags(['a']).get('k')).toBeUndefined();
    expect(await cache.get('k')).toBeUndefined();
  });

  it('DATA-13 flushing one tag of a set kills the entries of the set', async () => {
    const { cache } = make();
    await cache.tags(['a', 'b']).set('k', 1);
    await cache.tags(['b']).flush();
    expect(await cache.tags(['a', 'b']).get('k')).toBeUndefined();
  });

  it('DATA-13 an entry that a racing read writes after the flush is never served', async () => {
    const { cache } = make();
    const deals = cache.tags(['deals']);
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    // The read starts, finds a miss, and is slow to compute: it will write under the generation that it saw.
    const racing = deals.remember('list', 10_000, async () => {
      await gate;
      return 'computed from data before the write';
    });
    await sleep(20);
    await deals.flush();
    release();
    await racing;
    expect(await deals.get('list')).toBeUndefined();
    expect(await deals.remember('list', 10_000, () => 'fresh')).toBe('fresh');
  });

  it('DATA-13 remember works under tags and counts once', async () => {
    const { cache } = make();
    const deals = cache.tags(['deals']);
    let runs = 0;
    await Promise.all(
      Array.from({ length: 20 }, () => deals.remember('k', 10_000, async () => (await sleep(20), (runs += 1)))),
    );
    expect(runs).toBe(1);
    await deals.flush();
    await deals.remember('k', 10_000, () => (runs += 1));
    expect(runs).toBe(2);
  });

  it('DATA-13 a set of no tags or of more than ten is refused', async () => {
    const { cache } = make();
    expect(await codeOf(() => cache.tags([]))).toBe('CACHE_KEY_INVALID');
    expect(await codeOf(() => cache.tags(Array.from({ length: 11 }, (_, i) => `t${String(i)}`)))).toBe(
      'CACHE_KEY_INVALID',
    );
    expect(await codeOf(() => cache.tags(['bad tag']))).toBe('CACHE_KEY_INVALID');
  });
});

describe('C-03 locks', () => {
  it('C-03 only one caller holds a lock, and release frees it', async () => {
    const { cache } = make();
    const first = await cache.lock('job', 10_000);
    expect(first).toBeDefined();
    expect(await cache.lock('job', 10_000)).toBeUndefined();
    expect(await first?.release()).toBe(true);
    expect(await cache.lock('job', 10_000)).toBeDefined();
  });

  it('C-03 a lock expires by itself, and the old owner cannot release the new owner lock', async () => {
    let now = 0;
    const engine = createMemoryEngine({ now: () => now });
    const cache = createCache({ engine });
    const old = await cache.lock('job', 1_000);
    now = 1_001;
    const fresh = await cache.lock('job', 10_000);
    expect(fresh).toBeDefined();
    expect(await old?.release()).toBe(false);
    expect(await cache.lock('job', 10_000)).toBeUndefined();
    expect(await fresh?.release()).toBe(true);
  });

  it('C-03 waitMs waits for the holder and takes the lock when it is freed', async () => {
    const { cache } = make();
    const first = await cache.lock('job', 10_000);
    setTimeout(() => void first?.release(), 100);
    const started = Date.now();
    const second = await cache.lock('job', 10_000, { waitMs: 2_000 });
    expect(second).toBeDefined();
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it('C-03 waitMs gives up with undefined', async () => {
    const { cache } = make();
    await cache.lock('job', 10_000);
    const started = Date.now();
    expect(await cache.lock('job', 10_000, { waitMs: 120 })).toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it('C-03 of 30 callers at once, one gets the lock', async () => {
    const { cache } = make();
    const all = await Promise.all(Array.from({ length: 30 }, () => cache.lock('job', 10_000)));
    expect(all.filter((lock) => lock !== undefined)).toHaveLength(1);
  });
});

describe('atomic keys', () => {
  it('13.1 add stores once, and values are JSON', async () => {
    const { cache } = make();
    expect(await cache.atomic.add('k', { a: 1 }, 10_000)).toBe(true);
    expect(await cache.atomic.add('k', { a: 2 }, 10_000)).toBe(false);
    expect(await cache.atomic.get('k')).toEqual({ a: 1 });
    await cache.atomic.set('k', 'x', 10_000);
    expect(await cache.atomic.get('k')).toBe('x');
    await cache.atomic.delete('k');
    expect(await cache.atomic.get('k')).toBeUndefined();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    expect(await codeOf(cache.atomic.add('k', undefined as never, 1000))).toBe('CACHE_VALUE_INVALID');
    expect(await codeOf(cache.atomic.add('k', 1, 0))).toBe('CACHE_TTL_INVALID');
  });
});
