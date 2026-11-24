<!--
  BieberKit

  @file        packages/cache/api/index.api.md
  @description API report of @bieberkit/cache: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/cache

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { IdempotencyStore } from "@bieberkit/http";
import { ReadYourWrites } from "@bieberkit/data/orm";
import { a as Lock, c as createCache, i as CacheReader, n as Cache, o as LockOptions, r as CacheOptions, s as TaggedCache, t as AtomicCache } from "./cache-CvFo_4dY.js";
import { i as CacheValue, n as CacheEngine, r as CacheError, t as Atomic } from "./contract--ExGYgOW.js";
interface CacheIdempotencyOptions {
  readonly ttlMs?: number;
  readonly pendingTtlMs?: number;
}
export declare function createCacheIdempotencyStore(cache: Cache, options?: CacheIdempotencyOptions): IdempotencyStore;
interface CacheReadYourWritesOptions {
  readonly windowMs?: number;
}
export declare function createCacheReadYourWrites(cache: Cache, options?: CacheReadYourWritesOptions): ReadYourWrites;
interface LayeredEngineOptions {
  readonly first: CacheEngine;
  readonly shared: CacheEngine;
  readonly firstTtlMs?: number;
}
export declare function createLayeredEngine(options: LayeredEngineOptions): CacheEngine;
interface MemoryEngineOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
}
export declare function createMemoryEngine(options?: MemoryEngineOptions): CacheEngine;
declare module "@bieberkit/core" {
  interface ServiceRegistry {
    cache: Cache;
  }
}
export { type Atomic, type AtomicCache, type Cache, type CacheEngine, CacheError, type CacheIdempotencyOptions, type CacheOptions, type CacheReadYourWritesOptions, type CacheReader, type CacheValue, type LayeredEngineOptions, type Lock, type LockOptions, type MemoryEngineOptions, type TaggedCache, createCache };
```
