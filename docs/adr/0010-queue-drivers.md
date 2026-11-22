<!--
  BieberKit

  @file        docs/adr/0010-queue-drivers.md
  @description Proposed queue design: BullMQ on Valkey and a database driver behind one contract, with outbox dispatch rules found by the spike.
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

# 0010. Queue drivers: BullMQ on Valkey and a database driver

- Status: Proposed
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Requirements: Q-01 to Q-08, Q-10, MOD-18, WP-01, PKG-02, PKG-03, SEC-11, P9, P12, spec sections 7.5 and 15.1

## Context

Spec 15.1 offers three queue drivers behind one contract: `sync`, `database` (our own) and `redis` (BullMQ on Valkey). Jobs are dispatched after commit through the outbox (Q-06, MOD-18). The roadmap asks for a spike of BullMQ on Valkey and the `database` driver behind one contract, with outbox dispatch using `SKIP LOCKED`.

The spike found that BullMQ 6 now ships a PostgreSQL backend with the same `Queue` and `Worker` API (PostgreSQL 13 or later). That is a third option the spec did not consider.

## Options

| Option                                                                                                                | For                                                                                      | Against                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. BullMQ on Valkey for `redis`, our own `database` driver for PostgreSQL, MySQL, MariaDB and SQLite (as in the spec) | Production gets the fastest path. Every dialect has a queue with no Valkey. One contract | We maintain the `database` driver                                                                                                                        |
| B. BullMQ everywhere: Valkey, or its PostgreSQL backend, plus our own driver only for MySQL and SQLite                | Less of our own code on PostgreSQL                                                       | We still need our own driver for MySQL and SQLite. A third code path to test. No gain on PostgreSQL (see Evidence)                                       |
| C. Our own `database` driver only                                                                                     | No Valkey to run                                                                         | About 4 times lower throughput than BullMQ on Valkey on PostgreSQL, and up to 28 times lower on SQLite. Misses the production default in spec section 15 |

## Decision

Option A. Do not ship the BullMQ PostgreSQL backend. Rules, each backed by a measurement below:

1. **One contract, one test suite.** The nine contract tests below run against every driver, and a new driver must pass them.
2. **`database` driver.** A `bk_jobs` table with a unique `job_id`, a lease (`locked_until`) renewed by a heartbeat, and exponential backoff. Claim with `FOR UPDATE SKIP LOCKED` on PostgreSQL, MySQL and MariaDB, and with `BEGIN IMMEDIATE` on SQLite (ADR 0008). Dead jobs keep their row and error. Finished rows are kept as long as the outbox retention (7 days, MOD-18), so the unique `job_id` keeps deduplicating.
3. **BullMQ settings.** `removeOnFail: false` is the dead-letter list. `removeOnComplete` keeps jobs for at least 1 hour (24 hours recommended). `removeOnComplete: true` is forbidden, because it turns a redelivered outbox row into a duplicate run.
4. **Outbox dispatcher.** Claim 100 rows with `FOR UPDATE SKIP LOCKED`, dispatch with `jobId = ob-<outbox id>`, delete, commit. On MySQL and MariaDB delete **one row at a time by primary key**, and also retry on a deadlock error. On PostgreSQL wake up through `LISTEN/NOTIFY`, elsewhere poll every second. SQLite runs one dispatcher.
5. **Dispatch inside the transaction for the `database` driver.** The dispatcher inserts into `bk_jobs` in its own transaction, so moving a row from the outbox to the queue is atomic. This is required on SQLite and removes the crash window on every dialect. With BullMQ the window remains and the stable `jobId` covers it.
6. **Scheduler lock (Q-07).** Valkey: `SET key owner NX PX ttl` per tick. Database: a `bk_locks` row per tick, taken by an `UPDATE ... WHERE until < now` and a read of the owner.
7. **Valkey (Q-08).** Run with `maxmemory-policy noeviction`. `bieberkit doctor` reads it with `CONFIG GET maxmemory-policy`.
8. **Dependencies.** BullMQ is pinned exactly. `msgpackr-extract`, its optional native accelerator, has an install script and must not be added to `allowBuilds`.

## Evidence

Spike on 2026-11-22, Node.js 26.13.1, PostgreSQL 15.20 and 18.7, MySQL 8.4.13, MariaDB 11.8.9, SQLite 3.54.1, Valkey 8.1.12 (`noeviction`), BullMQ 6.7.8, ioredis 6.0.0. The databases ran in containers on tmpfs on one machine, so the numbers compare drivers and are not production figures. Sources are in `bieberkit-spikes/queue-spike` next to the repository.

**Contract tests.** All nine passed on `database` over PostgreSQL 15, PostgreSQL 18, MySQL 8.4, MariaDB 11 and SQLite, on BullMQ over Valkey, and on BullMQ over PostgreSQL 15:

1. delivery restores tenant, actor and Unicode input (Q-10);
2. one run for three dispatches of the same `jobId`, sequential and concurrent (Q-01);
3. three attempts with exponential backoff (gaps 200 to 206 ms, then 402 to 411 ms; BullMQ on Valkey 209 and 502 ms);
4. dead-letter list keeps the error, and retry clears it (Q-04);
5. a delayed job runs after its delay (800 ms delay ran at 802 to 896 ms);
6. a busy `reports` queue does not block `critical` (203 to 227 ms, Q-03);
7. a killed worker's job is redelivered (database driver 1.13 to 1.17 s, BullMQ 1.51 to 1.53 s with a 1.5 s lease);
8. two workers, 200 jobs: each ran exactly once, peak parallelism 8;
9. 2,000 no-op jobs, two workers of 10 (table below).

| Driver                                     | Jobs per second                                  |
| ------------------------------------------ | ------------------------------------------------ |
| BullMQ on Valkey                           | 10,811                                           |
| `database`, PostgreSQL 15 / 18             | 2,845 / 2,789                                    |
| BullMQ on PostgreSQL 15                    | 2,778 (dispatch alone took 700 ms against 83 ms) |
| `database`, MySQL 8.4                      | 1,247                                            |
| `database`, MariaDB 11                     | 546                                              |
| `database`, SQLite, one process            | 393                                              |
| `database`, SQLite, three worker processes | 239 (600 of 600 ran once, no lock errors)        |

BullMQ on PostgreSQL matched our driver on PostgreSQL, so it brings no gain there. Valkey is 4 times faster than the best database result.

**Differences to handle.** On redelivery after a crash BullMQ reports attempt 1 again and the `database` driver reports attempt 2. Handlers must not depend on the attempt number being a delivery count.

**Outbox.**

- A rolled-back transaction leaves no outbox row and no job. A committed one is dispatched once (Q-06). Checked on all four engines.
- Two dispatchers, 1,000 rows: PostgreSQL 15 gave 500 and 500 rows with none dispatched twice. MySQL gave 600 and 400.
- Three dispatchers, 10 rounds of 1,000 rows, deleting with `delete ... where id in (...)` in batches of 100: PostgreSQL 0 deadlocks; MySQL 8.4 17 and MariaDB 11 34 deadlocks, with 1,314 and 2,312 rows dispatched more than once after the rollbacks. `READ COMMITTED` did not help (13 and 25 deadlocks). Deleting one row at a time by primary key gave 0 deadlocks and 0 repeats at the same batch size, for 8 to 25 percent more time (1,101 ms against 886 ms on MySQL).
- Crash after dispatch and before commit, 5 rows redispatched: the `database` driver ran each job once (the unique `job_id` remained), BullMQ with a 1 hour retention ran each once, and BullMQ with `removeOnComplete: true` ran them 10 times.
- Dispatching into the `database` queue through a second SQLite connection while the dispatcher held the write lock failed with `database is locked` after 5,005 ms. In one transaction, a crash left the outbox at 5 rows and the jobs at 0, and the retry moved all 5. The same held on PostgreSQL 15 and MySQL 8.4.
- `LISTEN/NOTIFY` woke the dispatcher in a median of 0.1 ms (maximum 0.3 ms), against about 500 ms on average for polling every second.
- Scheduler lock: 50 of 50 ticks ran once with two contenders, on Valkey and on the database lock for all four engines.

**Dependencies (P9).** `bullmq` 6.7.8 (MIT, modified 2026-11-21): 11 packages with optional ones, licenses MIT, Apache-2.0, ISC and 0BSD. Its only install script belongs to the optional `msgpackr-extract`, and every test passed with scripts disabled. `ioredis` 6.0.0 (MIT, modified 2026-10-12), a peer dependency. Maintainers are to be confirmed before acceptance.

**Not tested:** Valkey persistence and failover; behavior when Valkey memory is full under `noeviction`; BullMQ job schedulers and flows; the `worker_threads` pool (Q-09); the admin dead-letter screen; job priorities and large payloads; the `sync` driver; BullMQ on PostgreSQL with several processes; and the full outbox run on PostgreSQL 18 and MariaDB (MariaDB ran the rollback check and the delete test only).

## Consequences

- Easier: one contract, tested the same way on every driver. Any dialect can run jobs without Valkey. The outbox hand-off is atomic with the `database` driver.
- Harder: we own the `database` driver, its lease and heartbeat, and the dispatcher's deadlock handling. The contract suite must run in CI on all dialects (M1.5).
- Constraint: handlers stay idempotent (Q-01), and the attempt number is informational.
- Ruled out: BullMQ's PostgreSQL backend, `removeOnComplete: true`, and range deletes in the outbox on MySQL and MariaDB.

## Spec changes

To apply when the maintainer accepts this ADR:

- Section 3, Queue row: BullMQ 6, pinned exactly.
- Q-05: add MariaDB, and say that SQLite uses `BEGIN IMMEDIATE` through the driver override of ADR 0008.
- Q-01: BullMQ keeps completed jobs for at least 1 hour, never `removeOnComplete: true`; the attempt number is not a delivery count.
- Q-07: name the two lock implementations.
- MOD-18: delete outbox rows one at a time by primary key on MySQL and MariaDB, retry on deadlock, and enlist the job insert in the dispatcher's transaction for the `database` driver.
- New Q-11: every driver passes the shared contract suite.

## Follow-ups

- Add the roadmap items for the contract suite, the dispatcher rules and the `doctor` check once the spec has the IDs.
- A later spike for Valkey persistence, full-memory behavior and BullMQ job schedulers.
- Q-09 (`worker_threads` pool) is not covered here.
