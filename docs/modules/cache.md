<!--
  BieberKit

  @file        docs/modules/cache.md
  @description Module spec of @bieberkit/cache: the contract, the engines, tags with generations, locks, the tenant view and the shared store of Idempotency-Key.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
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

# @bieberkit/cache

- Package: `@bieberkit/cache`
- Layer: contracts (it may import `@bieberkit/core`, `@bieberkit/data` and `@bieberkit/http`)
- Spec sections: 15.2 (C-01 to C-03), DATA-13, Q-08, 13.1, CFG-07
- Status: **Prepared on 2026-11-23.** ADR 0016 (Proposed) lists the two libraries (P9).

## Purpose

One small API for values that may be lost (a cache) and for the few keys that must not be (locks, tag generations, the answers of `Idempotency-Key`). Application code never sees a driver: `CACHE_DRIVER` changes the engine and nothing else.

## Public API

```ts
createCache({ engine, prefix?, defaultTtlMs?, maxTtlMs?, logger? }): Cache

interface Cache {
  get<T>(key): Promise<T | undefined>
  set(key, value, ttlMs?): Promise<void>
  has(key): Promise<boolean>
  forget(key): Promise<void>
  remember<T>(key, ttlMs, factory): Promise<T>        // C-03: one caller computes, the others wait
  tags(tags: string[]): TaggedCache                    // the same calls, and flush(), flushAfterCommit()
  lock(key, ttlMs, { waitMs? }): Promise<Lock | undefined>
  atomic: { add, get, set, delete }                    // strongly consistent, never from a first level
  tenant: Cache                                        // keys of the tenant of the request (C-01)
  close(): Promise<void>
}

createMemoryEngine({ maxEntries?, now? }): CacheEngine         // for one process
createCacheIdempotencyStore(cache, { ttlMs?, pendingTtlMs? }): IdempotencyStore
// @bieberkit/cache/bentocache
bentocacheEngine({ driver: 'file', directory } | { driver: 'redis', url, memoryTtlMs? }): CacheEngine
createCacheFromConfig(config, { logger? }): Promise<Cache>      // CACHE_DRIVER, CACHE_REDIS_URL, CACHE_PREFIX
checkEvictionPolicy(url): Promise<{ ok, policy }>               // for `bieberkit doctor` (Q-08)
// @bieberkit/cache/testing
cacheContractSuite(name, make)                                  // every engine passes it
```

`@bieberkit/data/orm` gains `afterCommit(fn)`: the function runs after the transaction that is running commits, in order, never when it rolls back, and a failure is only a warning. Outside a transaction it runs at once.

## Rules

1. **Two kinds of key (the engine contract).** `get`, `set`, `delete` may be served from a first level (memory in front of Redis) and may be a few seconds old on another node. `atomic` is never cached: it goes to the shared store, so it can hold a lock, a counter or a claim. A value that must not be stale is written with `atomic`.
2. **Namespacing (C-01).** A stored key is `<prefix>:<scope><kind>:<key>`. `prefix` is `CACHE_PREFIX` (default `bk`). `scope` is empty on the root cache and `t:<tenantId>:` on `cache.tenant`. `kind` separates values (`v`), atomic values (`a`), locks (`l`) and tag generations (`g`), so no call can touch another kind. `cache.tenant` without a tenant in the request context throws `CACHE_TENANT_REQUIRED`: it never falls back to the root namespace.
3. **Every key has a TTL.** `set` and `remember` use `defaultTtlMs` (5 minutes) when none is given. A TTL that is not a positive integer, or is over `maxTtlMs` (7 days), is `CACHE_TTL_INVALID`. A cache with no expiry fills the instance (Q-08).
4. **Values are JSON.** A value that does not survive `JSON.stringify` (a function, a `bigint`, a cycle, `undefined`) is `CACHE_VALUE_INVALID`. `undefined` from `get` means a miss, so `null` is the way to cache "nothing". A key is 1 to 200 characters of `A-Za-z0-9_.:/@=-`, otherwise `CACHE_KEY_INVALID`.
5. **`remember` (C-03).** On a miss the caller takes a lock on the key (`atomic.add`), reads again, computes, stores and releases. Callers in the same process share one promise. Callers in other processes poll until the value appears or the lock is released, for at most `waitMs` (5 s), and then compute for themselves: a stuck holder slows callers, it never blocks them. A factory that throws stores nothing, releases the lock and throws to its caller.
6. **Tags (DATA-13).** `tags(['crm.deals'])` gives a cache whose keys also carry the generation of each tag. `flush()` bumps every generation with an atomic increment, so the old entries are never read again and expire by their own TTL. Generations are read through `atomic` on every call, so a node that has the old entry in its first level still misses. `flushAfterCommit()` does `flush()` through `afterCommit`: it is the call for code in a service, and a failed purge only warns.
7. **Locks.** `lock(key, ttlMs, { waitMs })` is `atomic.add` with a random token and answers `undefined` when the lock is held after `waitMs` (default 0). `release()` deletes the key only if the token is still ours (`deleteIf`), so a lock that expired and was taken by another caller is never released by the first one. The lock expires by itself after `ttlMs`.
8. **Engines.** `memory` is in the package: a map with expiry and a size limit (LRU), per process. The `bentocache` adapter gives `file` (per node) and `redis`, which is BentoCache with a memory first level (TTL 5 s, DATA-13) over Redis or Valkey; `atomic` of this engine goes straight to Redis (`SET NX PX`, `INCR` with `PEXPIRE`, a Lua compare-and-delete). The adapter is the only code that imports `bentocache` and `ioredis` (PKG-03). `CACHE_DRIVER=database` is `CACHE_DRIVER_UNSUPPORTED` until an engine exists.
9. **The cache instance (Q-08).** The `redis` engine reads `CACHE_REDIS_URL` and never `REDIS_URL` in production (the core config already decides). `checkEvictionPolicy` reads `maxmemory-policy`: `noeviction` is a failure for a cache, as it is the opposite of what a queue instance needs.
10. **Errors** are `CacheError` (a `BkError`) with codes `CACHE_KEY_INVALID`, `CACHE_VALUE_INVALID`, `CACHE_TTL_INVALID`, `CACHE_TENANT_REQUIRED`, `CACHE_DRIVER_UNSUPPORTED`, `CACHE_CONFIG_INVALID`. A failure of the store itself (Redis is down) is not hidden: `get`, `set`, `remember` throw, and the caller decides whether a cache miss is acceptable. `afterCommit` code already swallows it.
11. **The `Idempotency-Key` store.** `createCacheIdempotencyStore(cache)` implements `IdempotencyStore` of `@bieberkit/http` on `atomic`: `begin` does `add` of `{ fingerprint }` with `pendingTtlMs` (10 minutes), so two processes cannot both get `new`; `complete` keeps the answer with `ttlMs` (24 hours); `abandon` deletes the key. A key with another fingerprint is `mismatch`, a key without an answer is `busy`.

## Tests

- `cacheContractSuite` (`@bieberkit/cache/testing`), for every engine: round trip, expiry, delete, `atomic.add` once among many callers, `deleteIf`, `increment`, and values of 1 MB.
- `cache.test.ts` on the memory engine: namespacing and the tenant view, TTL and value rules, `remember` (50 concurrent callers compute once, a failing factory, a stuck lock), tags and generations, locks, `afterCommit`.
- `idempotency.test.ts`: the four states, two stores on one engine behave as two processes.
- `adapters/bentocache`: the suite on `file` and on `redis` (Valkey with `allkeys-lru`, `CACHE_TEST_REDIS_URL`; `BK_REQUIRE_DIALECTS=all` makes a missing URL fail), the first level of `redis` (a second node sees a write after the short TTL, and never through `atomic`), and `checkEvictionPolicy`.

## Checks for `bieberkit doctor` on the instances of Valkey (Q-08)

Prepared on 2026-11-24. `checkRedisInstances(config, { read? })` in `@bieberkit/cache/bentocache` answers a list of findings (`id`, `level` of `ok`, `warning` or `error`, `message`, `fix`), which `doctor` prints.

1. The queue instance (`QUEUE_DRIVER=redis`, `REDIS_URL`) must have `maxmemory-policy noeviction`: with another policy a full server deletes jobs. Any other value is an error with the command that fixes it.
2. The cache instance (`CACHE_DRIVER=redis`, `CACHE_REDIS_URL`) must have an evicting policy (`allkeys-*` or `volatile-*`, because every key has a TTL): with `noeviction` a full cache fails every write. A cache instance with no `maxmemory` is a warning, because its policy never runs.
3. The two must not be one server. A server has one policy, and logical databases of one server share it, so `redis://a:6379/0` and `redis://a:6379/5` are one instance. It is an error in production, and a warning in development, where `CACHE_REDIS_URL` falls back to `REDIS_URL`.
4. An instance of a driver that is not selected is not read. A driver that needs a URL and has none is an error.
5. An instance that cannot be reached is an error with its host and port, and never its user or password. One that does not allow `CONFIG` (managed services often turn it off) is a warning to check by hand, not an error.
6. The read is `CONFIG GET maxmemory-policy` and `maxmemory` with a connect timeout of 3 seconds and no retry.

Tests: `doctor.test.ts`: every rule above with a reader that is injected, and against the Valkey of the tests (the real read, a server that is not there, no password in a finding).
