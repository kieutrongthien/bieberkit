<!--
  BieberKit

  @file        docs/adr/0019-queue-wake-listen-notify.md
  @description ADR 0019: a worker on PostgreSQL is woken by LISTEN/NOTIFY, announced in the transaction of the insert, with pg as a dependency of an adapter.
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

# 0019. Queue wake: LISTEN/NOTIFY on PostgreSQL

- Status: Proposed
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: Q-06, Q-03, PKG-03, P9

## Context

A worker of the `database` driver finds new jobs by polling (200 ms by default). Polling is correct and simple, but every worker queries every queue five times a second for nothing, and a job added by another process waits for up to one poll. On PostgreSQL the server can tell a worker the moment a job is committed.

## Options

| Option                                               | For                                                                                                                             | Against                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A. Poll only                                         | Nothing new                                                                                                                     | A wait of up to a poll for every job, and queries for nothing            |
| B. `pg_notify` in the insert, `LISTEN` in an adapter | Delivered at commit, so a worker never wakes for a job that is not there. Works across processes and replicas. No extra service | One connection for each worker process outside the pool; PostgreSQL only |
| C. A broker (Valkey pub/sub)                         | Works with any database                                                                                                         | Needs a Valkey, for a driver whose point is to need none                 |

## Decision

Option B. `insertJob` runs `select pg_notify('bk_jobs', <queue>)` in the same transaction as the insert, so the notification is held until the commit and a rolled back insert wakes nobody. A `WakeSource` is a port of `WorkerOptions`; the worker calls `listen` when it starts and the function that it answers when it stops. `@bieberkit/queue/postgres` is the only code that imports `pg`: `pgWakeSource({ url })` holds one connection with `LISTEN`, connects again with a growing wait when it is lost, and asks the worker to look at every queue each time it connects, because notifications that came while it was away are gone. A source is a hint and never the truth: the poll stays, a source that cannot connect is a warning and the worker polls, and with a source the poll time can be long (30 seconds is enough). The other dialects have no notification and poll as before.

Runtime dependency added (P9):

| Package | Version | Used by                     | License | Maintainers (npm) | Reason                                                            |
| ------- | ------- | --------------------------- | ------- | ----------------- | ----------------------------------------------------------------- |
| `pg`    | 8.23.1  | queue (`/postgres` subpath) | MIT     | brianc            | A connection that `LISTEN`s. The pool of MikroORM cannot hold one |

`pg` is already in the tree: `@mikro-orm/postgresql` depends on it, at the same version. The queue pins the same version, so there is one copy. `@types/pg` (MIT, DefinitelyTyped) is a development dependency. `pg` and its five packages have no install script.

## Consequences

- Easier: a job that another process adds starts within a few milliseconds, and an idle worker is quiet.
- Harder: each worker process holds one more connection on PostgreSQL, outside the pool, which a pooler in transaction mode (PgBouncer) cannot serve: `LISTEN` needs a direct connection or a pooler in session mode. The source takes its own URL for that reason.
- Ruled out: waking from a broker, and notifications that the application sends outside the insert.

## Spec changes

- 15.1: add Q-13 (a worker on PostgreSQL may be woken by a notification that is sent with the insert and delivered at the commit; the poll stays as the fallback). Done in this series.
