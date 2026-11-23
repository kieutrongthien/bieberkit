/**
 * BieberKit
 *
 * @file        packages/cache/src/memory-engine.ts
 * @description The cache engine that keeps values in the memory of one process, with expiry and a size limit.
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

import type { Atomic, CacheEngine } from './contract.ts';

export interface MemoryEngineOptions {
  /** Entries kept before the least recently used goes. Defaults to 10,000. */
  readonly maxEntries?: number;
  readonly now?: () => number;
}

interface Entry {
  value: string;
  expires: number;
}

/**
 * A map with expiry for one process: `CACHE_DRIVER=memory`, and the engine of tests (C-02). `atomic` is the same map, so it is
 * atomic inside the process and nowhere else.
 */
export function createMemoryEngine(options: MemoryEngineOptions = {}): CacheEngine {
  const limit = options.maxEntries ?? 10_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();

  const live = (key: string): Entry | undefined => {
    const found = entries.get(key);
    if (found === undefined) return undefined;
    if (found.expires <= now()) {
      entries.delete(key);
      return undefined;
    }
    return found;
  };
  const put = (key: string, value: string, ttlMs: number): void => {
    entries.delete(key);
    entries.set(key, { value, expires: now() + ttlMs });
    // A Map keeps the order of insertion, so the first key is the one that was written or read longest ago.
    while (entries.size > limit) {
      const oldest = entries.keys().next();
      if (oldest.done === true) break;
      entries.delete(oldest.value);
    }
  };

  const atomic: Atomic = {
    async add(key, value, ttlMs) {
      if (live(key) !== undefined) return false;
      put(key, value, ttlMs);
      return true;
    },
    async get(key) {
      return live(key)?.value;
    },
    async set(key, value, ttlMs) {
      put(key, value, ttlMs);
    },
    async delete(key) {
      entries.delete(key);
    },
    async deleteIf(key, value) {
      if (live(key)?.value !== value) return false;
      entries.delete(key);
      return true;
    },
    async increment(key, ttlMs) {
      const next = Number(live(key)?.value ?? '0') + 1;
      put(key, String(next), ttlMs);
      return next;
    },
  };

  return {
    name: 'memory',
    async get(key) {
      const found = live(key);
      if (found === undefined) return undefined;
      // A read makes the entry the most recent one.
      entries.delete(key);
      entries.set(key, found);
      return found.value;
    },
    async set(key, value, ttlMs) {
      put(key, value, ttlMs);
    },
    async delete(key) {
      entries.delete(key);
    },
    atomic,
    async close() {
      entries.clear();
    },
  };
}
