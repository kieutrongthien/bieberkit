/**
 * BieberKit
 *
 * @file        packages/data/src/orm/read-your-writes.test.ts
 * @description Tests of the memory store of read your own writes: the window, the clock, and the size of the map (DATA-13).
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
import { createMemoryReadYourWrites, READ_YOUR_WRITES_MS } from './read-your-writes.ts';

describe('DATA-13 the memory store', () => {
  it('DATA-13 a user is remembered for the window, 5 seconds by default, and then forgotten', async () => {
    expect(READ_YOUR_WRITES_MS).toBe(5_000);
    let now = 0;
    const store = createMemoryReadYourWrites({ now: () => now });
    expect(await store.recently('u1')).toBe(false);
    await store.record('u1');
    now = 4_999;
    expect(await store.recently('u1')).toBe(true);
    now = 5_000;
    expect(await store.recently('u1')).toBe(false);
  });

  it('DATA-13 a new write starts the window again, and users do not share it', async () => {
    let now = 0;
    const store = createMemoryReadYourWrites({ windowMs: 100, now: () => now });
    await store.record('u1');
    now = 90;
    await store.record('u1');
    now = 150;
    expect(await store.recently('u1')).toBe(true);
    expect(await store.recently('u2')).toBe(false);
  });

  it('DATA-13 users whose window is over are dropped when the map grows large', async () => {
    let now = 0;
    const store = createMemoryReadYourWrites({ windowMs: 10, now: () => now });
    for (let i = 0; i < 10_001; i += 1) await store.record(`user-${String(i)}`);
    now = 100;
    await store.record('fresh');
    expect(await store.recently('fresh')).toBe(true);
    expect(await store.recently('user-1')).toBe(false);
  });
});
