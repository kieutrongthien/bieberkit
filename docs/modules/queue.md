<!--
  BieberKit

  @file        docs/modules/queue.md
  @description Module spec of @bieberkit/queue: the contract, the sync and database drivers, the worker, the outbox glue and the scheduler (slice Q1 of M1.5).
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

# @bieberkit/queue

- Package: `@bieberkit/queue`
- Layer: contracts (it may import `@bieberkit/core` and `@bieberkit/data`)
- Spec sections: 15.1, 7.5, ADR 0010
- Status: **Slice Q1 is prepared on 2026-11-23.** The roadmap item is **[M]**: it is the maintainer's call, so it is not ticked and the branch is not merged. Slice Q2 (the `redis` driver on BullMQ) is next.

## Purpose

Runs work after the request: jobs that are retried, delayed, scheduled and restored with the tenant and the user of the code that made them. One contract and one suite of tests for every driver, so switching `QUEUE_DRIVER` changes no application code.

## Public API (slice Q1)

```ts
defineJob<Input>({ name, queue?, input, attempts?, backoffMs?, timeoutMs?, handler(input, context) }): JobDef<Input>
createQueue({ driver: 'sync' | 'database', jobs, db?, logger?, now? }): Promise<Queue>

interface Queue {
  dispatch(job, input, { jobId?, delayMs?, queue? }): Promise<{ id, duplicate }>
  subscribe(event, job, map?): void                  // an event of the outbox is a job
  publisher: OutboxPublisher                         // for the dispatcher of the outbox
  createWorker({ queues?, concurrency?, pollMs?, leaseMs?, heartbeatMs?, stopTimeoutMs? }): Worker
  deadLetters({ queue?, limit?, cursor? }): Promise<{ jobs, nextCursor }>
  retry(jobId); discard(jobId); stats(); purge({ olderThanMs? }); close()
}
registerOutbox(db, queue, options?): OutboxDispatcher   // the dispatcher of the outbox with the publisher of the queue
createScheduler(queue, schedules, { db, owner?, lockMs?, now? }): Promise<Scheduler>     // tick(at?), start(), stop()
parseCron(expression): { matches(date) }
queueMigrationSteps                                  // plugin '@bieberkit/queue': bk_jobs, bk_locks
// @bieberkit/queue/testing
queueContractSuite(name, make, { skip? })            // the nine cases of ADR 0010
```

`@bieberkit/data/orm` gains `rawKysely(db)` and exports `retryOnDeadlock`.

## Rules

1. **A job is a descriptor.** `name` is `<module>.<job>` in lower case, `queue` is `critical`, `default` or `reports`, `attempts` is 1 to 20 (3 by default), `backoffMs` is 200 ms doubled each time up to an hour, `timeoutMs` is 5 minutes. A module contributes jobs through the key `jobs` of `ModuleContributions`. A job that no module gave to `createQueue` is `QUEUE_JOB_UNKNOWN`.
2. **Input is checked twice (Q-02).** On `dispatch` (`QUEUE_INPUT_INVALID`, 400, nothing is stored) and again before the handler runs. A stored input that no longer fits is a dead job with the reason and is not retried.
3. **The context travels (Q-10).** `tenantId`, `userId` and `requestId` of `requestContext` are stored with the job, and the worker runs the handler inside that context. A job dispatched outside a request has none, and a tenant entity refuses it as everywhere else.
4. **Delivery is at least once (Q-01).** A dispatch with a `jobId` that exists answers `duplicate: true` and adds nothing, also for a finished job, until `purge` removes it (7 days). The attempt number is informational: a redelivery after a crash may count it again.
5. **The database driver** keeps jobs in `bk_jobs` (`status` `waiting`, `active`, `done`, `dead`). A claim is one short transaction: `FOR UPDATE SKIP LOCKED` on PostgreSQL and MySQL, and the one writer of SQLite. A claimed job is the worker's for a lease that a heartbeat renews. A job whose lease ran out is claimed again, and one that has no delivery left is dead. A failed delivery goes back to `waiting` after the backoff, and the last one is `dead` with its error. Times are epoch milliseconds, and ids are text, so the same statements work on every dialect and with the transaction that the outbox dispatcher hands to the publisher.
6. **The worker has slots for each queue (Q-03).** Each queue has its own loop and its own number of slots (`concurrency` is one number for every queue, or a number for each), so a busy `reports` never keeps `critical` waiting. `stop()` waits for the jobs that run, up to `stopTimeoutMs`. `crash()` is for tests: it leaves what runs unfinished and the lease unreleased.
7. **The outbox glue (Q-06, MOD-18).** `queue.subscribe(event, job)` says that an event is a job. The publisher inserts the job with the transaction that claimed the outbox row, with `job_id = ob-<id>`, so the move is one commit and a redelivered row cannot run twice. An input that the job refuses keeps the row. An event that no job asked for is not delivered by this dispatcher and is removed with its batch.
8. **The scheduler (Q-07).** Schedules are five field cron expressions in UTC. The lock of a schedule is a row of `bk_locks`, taken by `update ... where until < now` and a read of the owner, held for 50 s, and the job id names the tick (`sched:<name>:<minute>`). A tick that was missed is skipped.
9. **Dead letters (Q-04).** `deadLetters` pages by a cursor, newest first. `retry` puts a job back with its deliveries counted from zero, `discard` deletes it, and both refuse a job that is not dead (`QUEUE_JOB_NOT_DEAD`, 409) or does not exist (`QUEUE_JOB_NOT_FOUND`, 404). The routes and the screen are M1.8.
10. **The `sync` driver** runs the job in the process that dispatches it, with the same checks, the same context and the same backoff, and answers when the job is finished or dead. It has no crash and no second worker.

## Errors

| Code                       | Status  | Fix                                                             |
| -------------------------- | ------- | --------------------------------------------------------------- |
| `QUEUE_INPUT_INVALID`      | 400     | Send the input that the job declares                            |
| `QUEUE_JOB_INVALID`        | 500/400 | The name, the queue, the attempts, the id or the delay of a job |
| `QUEUE_JOB_UNKNOWN`        | 500     | Give the job to `createQueue`                                   |
| `QUEUE_DRIVER_UNSUPPORTED` | 500     | Use `sync` or `database` (`redis` comes with slice Q2)          |
| `QUEUE_JOB_NOT_FOUND`      | 404     | Check the id of the job                                         |
| `QUEUE_JOB_NOT_DEAD`       | 409     | Only a dead job can be retried or discarded                     |
| `QUEUE_CRON_INVALID`       | 500     | Write five fields: minute hour day month weekday                |

## Tests

`define-job`, `cron`, `sync`, `database.dialects` (the nine cases of ADR 0010 and the rules of this driver), `worker.dialects`, `outbox.dialects`, `scheduler.dialects`. The contract suite is `queueContractSuite` and the `sync` driver skips the cases that need a crash, a second worker or queues that run beside each other (6, 7 and 8).

## Left out of slice Q1

- **The `redis` driver on BullMQ** and the `LISTEN/NOTIFY` wake on PostgreSQL (slice Q2, with `bullmq` and `ioredis`, and a row in ADR 0015).
- **`worker_threads` pool** (Q-09), **bulk requests of 101 to 500 rows as a job** (API-14, PERF-05) and **`bieberkit doctor`** reading `maxmemory-policy`.
- **MariaDB.** ADR 0010 measured it, and it is not in the dialects of this repository, so the suite does not run on it.
- **Time zones for cron.** Schedules are in UTC.
- **Mail, cache, storage and the error reporter**, the other items of M1.5, each with its own slice and its own `Proposed` ADR for its library.

## Found while implementing

- **A job id is text, and the job table has no UUID type.** The dispatcher of the outbox hands its raw Kysely transaction to the publisher, with no conversion of values, so `bk_jobs` keeps ids as `varchar(36)` and times as `bigint`.
- **An `active` job whose lease ran out may have no delivery left.** The claim counts the delivery and would run it once more than `attempts`, so it is made dead instead, with the reason.
- **Case 6 needs a slot count for each queue.** One shared pool lets four slow `reports` jobs keep `critical` waiting, so each queue has its own loop and slots.

## Worker pool for CPU-heavy work (Q-09)

Prepared on 2026-11-23. `createWorkerPool` runs a task on a `worker_threads` thread, so a PDF, a spreadsheet or an image transform that holds the CPU for seconds does not stop the timers, the heartbeats and the other jobs of the worker role. It needs no dependency.

```ts
createWorkerPool({ size?, maxQueued?, idleMs?, maxHeapMb?, logger? }): WorkerPool
pool.run<Result>(task: URL | string, input, { timeoutMs?, signal?, transfer? }): Promise<Result>
pool.stats(): { threads, busy, queued, completed, failed }
pool.close()
```

1. **A task is a module.** Its default export is `async (input) => result`. `task` is the URL or the absolute path of a file of the project, never a value that a user can choose: a relative path, a name, `http:`, `data:` or `node:` is `QUEUE_TASK_INVALID`. Input and result are copied (structured clone); an input that cannot be cloned is `QUEUE_TASK_INVALID`, and `transfer` moves buffers instead.
2. **A job uses it.** A handler of a job calls `pool.run`, so retries, the dead-letter list, the context of the dispatcher and the lease are the ones of any job. The thread has no request context, so the task gets the ids it needs in its input.
3. **Size and queue.** At most `size` threads (cores minus one, between 1 and 4), made when needed. A task waits in a FIFO queue of at most `maxQueued` (100), and one that does not fit is `QUEUE_POOL_FULL` (503). A thread with no task for `idleMs` (30 s) ends, and the next task starts a new one.
4. **A task that goes wrong costs its thread, not the process.** Over its `timeoutMs` (60 s): the thread is ended and the call is `QUEUE_TASK_TIMEOUT` (504). A thread that ends (`process.exit`), throws outside the task or passes `maxHeapMb` (256): `QUEUE_TASK_CRASHED`. A task that throws: `QUEUE_TASK_FAILED`, with the error of the task, its name, message and stack, as the `cause`, and the thread goes on. In every case the tasks behind it run on a thread of their own.
5. **Cancelling.** An `AbortSignal` takes a task out of the queue, or ends the thread of a task that runs (`QUEUE_TASK_ABORTED`).
6. **Closing.** `close` fails the tasks that wait and the ones that run with `QUEUE_POOL_CLOSED` and ends the threads. A closed pool refuses tasks.
7. **Source and build.** The code of a thread is a string inside the pool, so it works the same from the source and from the build. A task in TypeScript runs on Node 24.12 and later, which strip the types.

Tests: `pool.test.ts` (22 cases, on Node 24.12 and 26): result and clone, the task URL, errors, an event loop that stays free (a task that burns 400 ms does not delay a timer of 10 ms by more than 150 ms), size, order, reuse, a full queue, idle threads, a timeout, an exit, an error outside the task, memory, aborting and closing.
