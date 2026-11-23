/**
 * BieberKit
 *
 * @file        packages/queue/src/queue.ts
 * @description createQueue: the queue of a project on the driver that its configuration names (QUEUE_DRIVER).
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

import { createLogger } from '@bieberkit/core';
import type { Logger } from '@bieberkit/core';
import type { Database } from '@bieberkit/data/orm';
import { queueError } from './contract.ts';
import type { JobDef, Queue } from './contract.ts';
import { createDatabaseQueue } from './drivers/database.ts';
import { createSyncQueue } from './drivers/sync.ts';
import type { Shared } from './shared.ts';

export interface CreateQueueOptions {
  readonly driver: 'sync' | 'database';
  /** Every job that this process may run or dispatch. A module contributes its jobs to this list. */
  readonly jobs: readonly JobDef[];
  /** The database of the `database` driver. It needs the tables of `queueMigrationSteps`. */
  readonly db?: Database;
  readonly logger?: Logger;
  /** The clock, in epoch milliseconds. For tests. */
  readonly now?: () => number;
}

/**
 * Makes the queue. The driver is a choice of configuration and nothing in the code of a job depends on it (Q-11): every driver
 * passes the same suite. The `redis` driver comes with BullMQ in the next slice.
 */
export async function createQueue(options: CreateQueueOptions): Promise<Queue> {
  const jobs = new Map<string, JobDef>();
  for (const job of options.jobs) {
    if (jobs.has(job.name))
      throw queueError('QUEUE_JOB_INVALID', 500, `The job ${job.name} is registered twice.`, 'Register each job once.');
    jobs.set(job.name, job);
  }
  const shared: Shared = {
    jobs,
    subscriptions: new Map(),
    logger: options.logger ?? createLogger({ level: 'info', role: 'worker' }),
    now: options.now ?? Date.now,
  };
  if (options.driver === 'sync') return createSyncQueue(shared);
  if (options.driver === 'database') {
    if (options.db === undefined)
      throw queueError(
        'QUEUE_DRIVER_UNSUPPORTED',
        500,
        'The database driver needs a database.',
        'Pass `db` to createQueue.',
      );
    return createDatabaseQueue(options.db, shared);
  }
  throw queueError(
    'QUEUE_DRIVER_UNSUPPORTED',
    500,
    `The queue driver "${String(options.driver)}" does not exist.`,
    'Use sync or database.',
  );
}
