/**
 * BieberKit
 *
 * @file        packages/cache/src/read-your-writes.test.ts
 * @description Tests of the cache store of read your own writes: the window, two processes on one store, and a first level that does not hide it (DATA-13).
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
import { createLayeredEngine } from './layered-engine.ts';
import { createMemoryEngine } from './memory-engine.ts';
import { createCacheReadYourWrites } from './read-your-writes.ts';

describe('DATA-13 the cache store of read your own writes', () => {
  it('DATA-13 remembers a user for the window and then forgets it', async () => {
    let now = 0;
    const store = createCacheReadYourWrites(createCache({ engine: createMemoryEngine({ now: () => now }) }));
    expect(await store.recently('u1')).toBe(false);
    await store.record('u1');
    now = 4_999;
    expect(await store.recently('u1')).toBe(true);
    now = 5_000;
    expect(await store.recently('u1')).toBe(false);
  });

  it('DATA-13 takes the window that it is given, and users do not share it', async () => {
    let now = 0;
    const store = createCacheReadYourWrites(createCache({ engine: createMemoryEngine({ now: () => now }) }), {
      windowMs: 100,
    });
    await store.record('u1');
    expect(await store.recently('u2')).toBe(false);
    now = 100;
    expect(await store.recently('u1')).toBe(false);
  });

  it('DATA-13 a write on one process is seen at once by another that shares the store, whatever its first level holds', async () => {
    const shared = createMemoryEngine();
    const node = () =>
      createCacheReadYourWrites(createCache({ engine: createLayeredEngine({ first: createMemoryEngine(), shared }) }));
    const a = node();
    const b = node();
    expect(await b.recently('u1')).toBe(false);
    await a.record('u1');
    expect(await b.recently('u1')).toBe(true);
  });

  it('DATA-13 two apps that share a store, with other prefixes, do not meet', async () => {
    const engine = createMemoryEngine();
    const one = createCacheReadYourWrites(createCache({ engine, prefix: 'one' }));
    const two = createCacheReadYourWrites(createCache({ engine, prefix: 'two' }));
    await one.record('u1');
    expect(await two.recently('u1')).toBe(false);
  });
});
