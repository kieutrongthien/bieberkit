/**
 * BieberKit
 *
 * @file        packages/queue/src/index.ts
 * @description Public API of @bieberkit/queue: the contract of the queue, jobs, the sync and database drivers, the worker, the outbox glue and the scheduler (Q-01 to Q-11).
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

/** npm name of this package. */
export const packageName = '@bieberkit/queue';

export { defineJob, QUEUE_NAMES, QueueError, queueError, defaultBackoffMs } from './contract.ts';
export type {
  DeadJob,
  DeadLetterPage,
  DispatchOptions,
  Dispatched,
  JobContext,
  JobDef,
  JobInput,
  JobResult,
  JobStatus,
  Queue,
  QueueName,
  QueueStats,
  Worker,
  WorkerOptions,
} from './contract.ts';
export { parseCron } from './cron.ts';
export type { Cron } from './cron.ts';
export { registerOutbox } from './outbox.ts';
export { applySubscriptions } from './subscriptions.ts';
export type { QueueSubscription } from './subscriptions.ts';
import type { QueueSubscription } from './subscriptions.ts';
export { createWorkerPool } from './pool.ts';
export type { PoolStats, RunOptions, WorkerPool, WorkerPoolOptions } from './pool.ts';
export { createQueue } from './queue.ts';
export type { CreateQueueOptions } from './queue.ts';
export { createScheduler } from './scheduler.ts';
export type { Schedule, Scheduler, SchedulerOptions } from './scheduler.ts';
export { JOBS_TABLE, LOCKS_TABLE, QUEUE_PLUGIN, queueMigrationSteps } from './tables.ts';

import type { JobDef } from './contract.ts';

declare module '@bieberkit/core' {
  interface ModuleContributions {
    /** The jobs of the module (Q-02). They are given to `createQueue` with the jobs of the other modules. */
    jobs?: readonly JobDef[];
    /** Outbox events mapped to the jobs contributed by the module (BPL-04). */
    subscriptions?: readonly QueueSubscription[];
  }
}
import type { Queue as ServiceQueue } from './contract.ts';

declare module '@bieberkit/core' {
  interface ServiceRegistry {
    /** The configured queue; a worker runs only in its process role. */
    queue: ServiceQueue;
  }
}
