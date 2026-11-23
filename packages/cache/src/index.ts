/**
 * BieberKit
 *
 * @file        packages/cache/src/index.ts
 * @description Public API of @bieberkit/cache: the cache, the memory engine, the shared Idempotency-Key store and the errors.
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

export { createCache } from './cache.ts';
export type { AtomicCache, Cache, CacheOptions, CacheReader, Lock, LockOptions, TaggedCache } from './cache.ts';
export { CacheError } from './contract.ts';
export type { Atomic, CacheEngine, CacheValue } from './contract.ts';
export { createCacheIdempotencyStore } from './idempotency.ts';
export type { CacheIdempotencyOptions } from './idempotency.ts';
export { createLayeredEngine } from './layered-engine.ts';
export type { LayeredEngineOptions } from './layered-engine.ts';
export { createMemoryEngine } from './memory-engine.ts';
export type { MemoryEngineOptions } from './memory-engine.ts';
