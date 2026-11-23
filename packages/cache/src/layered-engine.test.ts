/**
 * BieberKit
 *
 * @file        packages/cache/src/layered-engine.test.ts
 * @description Tests of the layered engine: the engine suite, the short first level and atomic keys that skip it (DATA-13).
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
import { createLayeredEngine } from './layered-engine.ts';
import { createMemoryEngine } from './memory-engine.ts';
import { cacheEngineContractSuite } from './testing/contract-suite.ts';

cacheEngineContractSuite('layered memory over memory', {
  make: async () => createLayeredEngine({ first: createMemoryEngine(), shared: createMemoryEngine() }),
});

describe('DATA-13 layered engine', () => {
  it('DATA-13 another node sees a change after the TTL of the first level, and not before', async () => {
    let now = 0;
    const shared = createMemoryEngine({ now: () => now });
    const nodeA = createLayeredEngine({ first: createMemoryEngine({ now: () => now }), shared, firstTtlMs: 5_000 });
    const nodeB = createLayeredEngine({ first: createMemoryEngine({ now: () => now }), shared, firstTtlMs: 5_000 });
    await nodeA.set('k', 'old', 60_000);
    expect(await nodeB.get('k')).toBe('old');
    await nodeA.set('k', 'new', 60_000);
    expect(await nodeB.get('k')).toBe('old');
    now = 5_000;
    expect(await nodeB.get('k')).toBe('new');
  });

  it('DATA-13 a delete on this node is seen at once on this node', async () => {
    const engine = createLayeredEngine({ first: createMemoryEngine(), shared: createMemoryEngine() });
    await engine.set('k', 'v', 60_000);
    await engine.delete('k');
    expect(await engine.get('k')).toBeUndefined();
  });

  it('DATA-13 a short TTL is not stretched by the first level', async () => {
    let now = 0;
    const engine = createLayeredEngine({
      first: createMemoryEngine({ now: () => now }),
      shared: createMemoryEngine({ now: () => now }),
      firstTtlMs: 5_000,
    });
    await engine.set('k', 'v', 1_000);
    now = 1_000;
    expect(await engine.get('k')).toBeUndefined();
  });

  it('C-02 atomic keys never come from the first level: they are the shared ones', async () => {
    const shared = createMemoryEngine();
    const engine = createLayeredEngine({ first: createMemoryEngine(), shared });
    expect(engine.atomic).toBe(shared.atomic);
  });
});
