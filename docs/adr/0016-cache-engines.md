<!--
  BieberKit

  @file        docs/adr/0016-cache-engines.md
  @description ADR 0016: the cache sits on BentoCache drivers and ioredis behind one engine contract, with a memory level of 5 seconds in front of Valkey.
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

# 0016. Cache engines: BentoCache drivers and ioredis behind one engine contract

- Status: Proposed
- Date: 2026-11-23
- Deciders: Bieber Kieu
- Requirements: C-01 to C-03, DATA-13, Q-08, CFG-07, PKG-03, P9, 13.1

## Context

The cache contract (spec 15.2) needs a value store with a TTL on every key, a short memory level in front of Valkey (DATA-13), a stampede lock (C-03), tags with generations (DATA-13), and a few keys that are the same on every node at once: locks, tag generations, and the claims of `Idempotency-Key` (13.1). The roadmap names BentoCache. Reading its 1.6.1 sources shows three things that decide the shape:

1. Its memory level (L1) lives as long as the entry, and its only way to clear L1 on other nodes is a bus. DATA-13 asks for a short L1 TTL (5 seconds) because the bus is asynchronous, so the L1 TTL must be ours.
2. Its `getOrSet` lock is per process. C-03 asks for one caller across processes.
3. It has no set-if-absent, no compare-and-delete and no counter, which a lock, a generation and a claim need.

## Options

| Option                                                                                                | For                                                                                                       | Against                                                                                  |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A. BentoCache with its own L1, L2 and bus                                                             | Least code of ours                                                                                        | L1 lives as long as the entry (stale on other nodes), the lock is per process, no atomic |
| B. Only `ioredis`, with a file and a memory engine                                                    | One small dependency, full control                                                                        | No `database` driver later, our own file driver                                          |
| C. A small engine contract, BentoCache as a driver of the shared level, `ioredis` for the atomic keys | The layers and the locks follow the spec. `file`, and later `database` and DynamoDB, come from BentoCache | Two libraries, and BentoCache is used for a part of what it can do                       |

## Decision

Option C. `@bieberkit/cache` defines `CacheEngine` (`get`, `set`, `delete` with a TTL, and `atomic`). The package ships a memory engine and `createLayeredEngine` (a first level of at most 5 seconds in front of a shared level, with `atomic` always the shared level's). `@bieberkit/cache/bentocache` is the only code that imports `bentocache` and `ioredis` (PKG-03). It gives the shared level on a BentoCache driver (`file`, `redis`) and implements `atomic` on Redis with `SET NX PX`, `INCR` with `PEXPIRE`, and a Lua compare-and-delete. `remember`, tags, locks and the tenant view are written once over the contract, so they behave the same on every engine and the shared contract suite proves it. The cache needs its own Valkey with an eviction policy (Q-08), and `checkEvictionPolicy` reads it for `bieberkit doctor`.

Runtime dependencies added (P9):

| Package      | Version | Used by                       | License | Maintainers (npm)               | Reason                                                                                                       |
| ------------ | ------- | ----------------------------- | ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bentocache` | 1.6.1   | cache (`/bentocache` subpath) | MIT     | julien-r44                      | The `file` driver now, and the `database` and DynamoDB drivers later, behind the engine contract             |
| `ioredis`    | 5.11.1  | cache (`/bentocache` subpath) | MIT     | ioredis-robot, dmaier-redislabs | The Redis client of BentoCache (its peer range is `^5.3.2`) and of `atomic`. Valkey speaks the same protocol |

The tree behind `bentocache` is `@boringnode/bus`, `@julr/utils`, `@poppinss/exception`, `async-mutex`, `lru-cache` and `p-timeout`. Every license is MIT, except `lru-cache` (BlueOak-1.0.0, a permissive license) and `cluster-key-slot` and `denque` under `ioredis` (Apache-2.0). None has an install script. `ioredis` stays on 5.x because the peer range of BentoCache stops there. BullMQ (M1.5 slice Q2) will need to use the same major.

## Consequences

- Easier: `CACHE_DRIVER` changes an engine and nothing else. A new engine passes `cacheEngineContractSuite` or it is not an engine. The cache and the queue can each have their own Valkey.
- Harder: a `file` engine has per node `atomic`, so a lock on it is per process. That is the rule of CFG-07 (`file` and `memory` only with `APP_SINGLE_NODE=true` in production). We use a part of BentoCache, and a new major of it needs a look at the L2 calls only.
- Ruled out: BentoCache's own bus and L1 for the cache of this framework, until a bus with a bounded delay exists.

## Spec changes

- 15.2: add C-04, the first level of 5 seconds in front of `redis` and the `atomic` keys that skip it. Done in this series.
