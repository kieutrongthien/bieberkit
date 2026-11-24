/**
 * BieberKit
 *
 * @file        packages/data/src/orm/wake-signal.test.ts
 * @description Tests of the wake signal of the outbox dispatcher: a wake ends a sleep, a wake that came while nobody slept is not lost, and the sleep ends by itself (MOD-18).
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
import { createWakeSignal } from './outbox.ts';

const timed = async (run: () => Promise<void>): Promise<number> => {
  const started = Date.now();
  await run();
  return Date.now() - started;
};

describe('MOD-18 the wake signal', () => {
  it('MOD-18 a sleep ends by itself after its time', async () => {
    const signal = createWakeSignal();
    const took = await timed(() => signal.sleep(80));
    expect(took).toBeGreaterThanOrEqual(70);
  });

  it('MOD-18 a wake during a sleep ends it at once', async () => {
    const signal = createWakeSignal();
    const sleeping = timed(() => signal.sleep(60_000));
    await new Promise((resolve) => setTimeout(resolve, 20));
    signal.wake();
    expect(await sleeping).toBeLessThan(1_000);
  });

  it('MOD-18 a wake while nobody sleeps is kept, and the next sleep does not wait', async () => {
    const signal = createWakeSignal();
    signal.wake();
    expect(await timed(() => signal.sleep(60_000))).toBeLessThan(1_000);
  });

  it('MOD-18 a kept wake serves one sleep only, and two wakes in a row are one', async () => {
    const signal = createWakeSignal();
    signal.wake();
    signal.wake();
    await signal.sleep(60_000);
    const second = timed(() => signal.sleep(150));
    expect(await second).toBeGreaterThanOrEqual(130);
  });

  it('MOD-18 a wake after the sleep ended by itself is kept for the next one', async () => {
    const signal = createWakeSignal();
    await signal.sleep(10);
    signal.wake();
    expect(await timed(() => signal.sleep(60_000))).toBeLessThan(1_000);
  });

  it('MOD-18 many wakes while a sleep runs end it once, and one of them is kept for the next sleep', async () => {
    const signal = createWakeSignal();
    const sleeping = signal.sleep(60_000);
    signal.wake();
    signal.wake();
    signal.wake();
    await sleeping;
    // The first wake ended the sleep. The others found nobody asleep, so one of them is kept for the next sleep.
    expect(await timed(() => signal.sleep(60_000))).toBeLessThan(1_000);
    expect(await timed(() => signal.sleep(120))).toBeGreaterThanOrEqual(100);
  });
});
