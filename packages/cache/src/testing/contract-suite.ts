/**
 * BieberKit
 *
 * @file        packages/cache/src/testing/contract-suite.ts
 * @description The suite of tests that every cache engine must pass, so that switching CACHE_DRIVER changes no application code (C-02).
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

import { afterAll, describe, expect, it } from 'vitest';
import type { CacheEngine } from '../contract.ts';

export interface EngineSubject {
  /** A new engine over an empty store. The suite closes it. */
  readonly make: () => Promise<CacheEngine>;
  /** Cleans up what `make` created (a directory, a container key space). */
  readonly cleanup?: () => Promise<void>;
}

const key = (name: string) => `suite:${name}:${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The cases every engine passes. `atomic` is strongly consistent, `get` and `set` are only consistent for one engine instance.
 * Timings are loose upper bounds so that CI does not make them flaky.
 */
export function cacheEngineContractSuite(name: string, subject: EngineSubject): void {
  describe(`${name} engine contract`, () => {
    const opened: CacheEngine[] = [];
    const open = async (): Promise<CacheEngine> => {
      const engine = await subject.make();
      opened.push(engine);
      return engine;
    };
    afterAll(async () => {
      await Promise.all(opened.map((engine) => engine.close()));
      await subject.cleanup?.();
    });

    it('C-02 keeps a value until it expires, and a miss is undefined', async () => {
      const engine = await open();
      const k = key('ttl');
      expect(await engine.get(k)).toBeUndefined();
      await engine.set(k, '{"a":1}', 400);
      expect(await engine.get(k)).toBe('{"a":1}');
      await sleep(700);
      expect(await engine.get(k)).toBeUndefined();
    });

    it('C-02 delete removes a value, and deleting a missing key is not an error', async () => {
      const engine = await open();
      const k = key('delete');
      await engine.set(k, 'x', 10_000);
      await engine.delete(k);
      await engine.delete(k);
      expect(await engine.get(k)).toBeUndefined();
    });

    it('C-02 a later set replaces the value and its TTL', async () => {
      const engine = await open();
      const k = key('replace');
      await engine.set(k, 'first', 200);
      await engine.set(k, 'second', 10_000);
      await sleep(500);
      expect(await engine.get(k)).toBe('second');
    });

    it('C-02 keeps values of 1 MB and any unicode', async () => {
      const engine = await open();
      const k = key('big');
      const value = JSON.stringify({ text: 'Tiếng Việt ✓ '.repeat(80_000) });
      await engine.set(k, value, 10_000);
      expect(await engine.get(k)).toBe(value);
    });

    it('C-03 atomic.add stores once among many callers', async () => {
      const engine = await open();
      const k = key('add');
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) => engine.atomic.add(k, `owner-${String(i)}`, 10_000)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      const owner = await engine.atomic.get(k);
      expect(owner).toBe(`owner-${String(results.indexOf(true))}`);
    });

    it('C-03 atomic.add succeeds again after the key expires or is deleted', async () => {
      const engine = await open();
      const k = key('add-again');
      expect(await engine.atomic.add(k, 'a', 200)).toBe(true);
      expect(await engine.atomic.add(k, 'b', 200)).toBe(false);
      await sleep(500);
      expect(await engine.atomic.add(k, 'c', 10_000)).toBe(true);
      await engine.atomic.delete(k);
      expect(await engine.atomic.add(k, 'd', 10_000)).toBe(true);
      expect(await engine.atomic.get(k)).toBe('d');
    });

    it('C-03 atomic.deleteIf deletes only the value that it is given', async () => {
      const engine = await open();
      const k = key('delete-if');
      await engine.atomic.set(k, 'mine', 10_000);
      expect(await engine.atomic.deleteIf(k, 'theirs')).toBe(false);
      expect(await engine.atomic.get(k)).toBe('mine');
      expect(await engine.atomic.deleteIf(k, 'mine')).toBe(true);
      expect(await engine.atomic.get(k)).toBeUndefined();
      expect(await engine.atomic.deleteIf(k, 'mine')).toBe(false);
    });

    it('DATA-13 atomic.increment counts every call once, from zero', async () => {
      const engine = await open();
      const k = key('increment');
      const counts = await Promise.all(Array.from({ length: 40 }, () => engine.atomic.increment(k, 10_000)));
      expect(counts.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
      expect(await engine.atomic.get(k)).toBe('40');
    });

    it('Q-08 atomic keys expire too', async () => {
      const engine = await open();
      const k = key('atomic-ttl');
      await engine.atomic.increment(k, 200);
      await sleep(500);
      expect(await engine.atomic.get(k)).toBeUndefined();
      expect(await engine.atomic.increment(k, 10_000)).toBe(1);
    });
  });
}
