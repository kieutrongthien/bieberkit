<!--
  BieberKit

  @file        packages/cache/api/cache.api.md
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
import { Logger } from "@bieberkit/core";
import { i as CacheValue, n as CacheEngine } from "./contract--ExGYgOW.js";
interface CacheOptions {
  readonly engine: CacheEngine;
  readonly prefix?: string;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
  readonly rememberLockMs?: number;
  readonly rememberWaitMs?: number;
  readonly logger?: Logger;
}
interface Lock {
  release(): Promise<boolean>;
}
interface LockOptions {
  readonly waitMs?: number;
}
interface CacheReader {
  get<T extends CacheValue = CacheValue>(key: string): Promise<T | undefined>;
  set(key: string, value: CacheValue, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  forget(key: string): Promise<void>;
  remember<T extends CacheValue>(key: string, ttlMs: number, factory: () => Promise<T> | T): Promise<T>;
}
interface TaggedCache extends CacheReader {
  flush(): Promise<void>;
  flushAfterCommit(): void;
}
interface AtomicCache {
  add(key: string, value: CacheValue, ttlMs: number): Promise<boolean>;
  get<T extends CacheValue = CacheValue>(key: string): Promise<T | undefined>;
  set(key: string, value: CacheValue, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}
interface Cache extends CacheReader {
  tags(tags: readonly string[]): TaggedCache;
  lock(key: string, ttlMs: number, options?: LockOptions): Promise<Lock | undefined>;
  readonly atomic: AtomicCache;
  readonly tenant: Cache;
  close(): Promise<void>;
}
declare function createCache(options: CacheOptions): Cache;
export { Lock as a, createCache as c, CacheReader as i, Cache as n, LockOptions as o, CacheOptions as r, TaggedCache as s, AtomicCache as t };
```
