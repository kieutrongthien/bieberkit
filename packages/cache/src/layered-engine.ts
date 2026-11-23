/**
 * BieberKit
 *
 * @file        packages/cache/src/layered-engine.ts
 * @description An engine that puts a short-lived memory level in front of a shared one, with atomic keys that always go to the shared one (DATA-13).
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

import type { CacheEngine } from './contract.ts';

export interface LayeredEngineOptions {
  /** The first level: fast and per process. */
  readonly first: CacheEngine;
  /** The shared level. It is the truth, and `atomic` is always its `atomic`. */
  readonly shared: CacheEngine;
  /** How long a value stays in the first level. Defaults to 5 seconds, because the other nodes are not told when it changes (DATA-13). */
  readonly firstTtlMs?: number;
}

/**
 * Reads try the first level and then the shared one. A value read from the shared level is kept in the first level for at most
 * `firstTtlMs`, so another node sees a change after that long. Writes and deletes go to both levels of this node. `atomic` is the
 * shared level's own, so locks, generations and claims are the same on every node at once (C-02).
 */
export function createLayeredEngine(options: LayeredEngineOptions): CacheEngine {
  const { first, shared } = options;
  const firstTtlMs = options.firstTtlMs ?? 5_000;
  return {
    name: `${first.name}+${shared.name}`,
    async get(key) {
      const near = await first.get(key);
      if (near !== undefined) return near;
      const value = await shared.get(key);
      if (value !== undefined) await first.set(key, value, firstTtlMs);
      return value;
    },
    async set(key, value, ttlMs) {
      await shared.set(key, value, ttlMs);
      await first.set(key, value, Math.min(ttlMs, firstTtlMs));
    },
    async delete(key) {
      await shared.delete(key);
      await first.delete(key);
    },
    atomic: shared.atomic,
    async close() {
      await first.close();
      await shared.close();
    },
  };
}
