/**
 * BieberKit
 *
 * @file        packages/cache/src/memory-engine.test.ts
 * @description Tests of the memory engine: the shared engine suite, the size limit and expiry.
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
import { createMemoryEngine } from './memory-engine.ts';
import { cacheEngineContractSuite } from './testing/contract-suite.ts';

cacheEngineContractSuite('memory', { make: async () => createMemoryEngine() });

describe('C-02 memory engine', () => {
  it('C-02 drops the entry that was used least recently when it is full', async () => {
    const engine = createMemoryEngine({ maxEntries: 2 });
    await engine.set('a', '1', 10_000);
    await engine.set('b', '2', 10_000);
    await engine.get('a');
    await engine.set('c', '3', 10_000);
    expect(await engine.get('a')).toBe('1');
    expect(await engine.get('b')).toBeUndefined();
    expect(await engine.get('c')).toBe('3');
  });

  it('C-02 uses the clock that it is given', async () => {
    let now = 1_000;
    const engine = createMemoryEngine({ now: () => now });
    await engine.set('k', 'v', 100);
    now = 1_099;
    expect(await engine.get('k')).toBe('v');
    now = 1_100;
    expect(await engine.get('k')).toBeUndefined();
  });
});
