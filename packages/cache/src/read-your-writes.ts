/**
 * BieberKit
 *
 * @file        packages/cache/src/read-your-writes.ts
 * @description A shared store for read your own writes, on the strongly consistent keys of the cache, so that the next request of a user is sent to the primary by any process (DATA-13).
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

import type { ReadYourWrites } from '@bieberkit/data/orm';
import type { Cache } from './cache.ts';

const key = (userId: string): string => `ryw:${userId}`;

export interface CacheReadYourWritesOptions {
  /** How long the reads of a user go to the primary after its write. Defaults to 5 seconds. */
  readonly windowMs?: number;
}

/**
 * Keeps "this user wrote lately" in `cache.atomic`, which never comes from a first level, so the process that serves the next request
 * of the user sees the write of the first one at once. Give it to `useReadYourWrites` at boot, when the database has replicas.
 */
export function createCacheReadYourWrites(cache: Cache, options: CacheReadYourWritesOptions = {}): ReadYourWrites {
  const windowMs = options.windowMs ?? 5_000;
  return {
    record: (userId) => cache.atomic.set(key(userId), 1, windowMs),
    async recently(userId) {
      return (await cache.atomic.get(key(userId))) !== undefined;
    },
  };
}
