/**
 * BieberKit
 *
 * @file        packages/queue/src/drivers/sync.ts
 * @description The sync driver: a job runs in the process that dispatches it, for tests and for development (QUEUE_DRIVER=sync).
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

import type { OutboxPublisher } from '@bieberkit/data/orm';
import { carry } from '../context.ts';
import { emptyCounts, queueError } from '../contract.ts';
import type {
  DeadJob,
  DeadLetterPage,
  DispatchOptions,
  Dispatched,
  JobDef,
  Queue,
  QueueName,
  QueueStats,
  JobStatus,
  Worker,
} from '../contract.ts';
import { dispatching, prepare, reportDead, runDelivery, sleep } from '../shared.ts';
import type { Shared } from '../shared.ts';

interface Entry {
  status: 'active' | 'done' | 'dead';
  readonly job: JobDef;
  readonly queue: QueueName;
  readonly input: unknown;
  readonly context: Prepared['context'];
  error: string;
  attempts: number;
  diedAt: number;
  result: string | undefined;
  readonly createdAt: number;
  finishedAt: number | undefined;
}

type Prepared = Awaited<ReturnType<typeof prepare>>;

/**
 * Runs the job when it is dispatched, and answers when it is finished or dead. It retries with the backoff of the job, in the
 * process, and keeps dead jobs in memory. It has no redelivery after a crash and no second worker (Q-11 marks those cases as
 * not applicable to it).
 */
export function createSyncQueue(shared: Shared): Queue {
  const records = new Map<string, Entry>();

  async function execute(jobId: string, record: Entry): Promise<void> {
    record.status = 'active';
    for (let attempt = record.attempts + 1; ; attempt += 1) {
      record.attempts = attempt;
      const outcome = await runDelivery(shared, {
        jobId,
        name: record.job.name,
        queue: record.queue,
        input: JSON.stringify(record.input),
        attempt,
        context: record.context,
      });
      if (outcome.ok) {
        record.status = 'done';
        record.result = outcome.result;
        record.finishedAt = shared.now();
        return;
      }
      record.error = outcome.error;
      if (!outcome.retry || attempt >= record.job.attempts) {
        record.status = 'dead';
        record.diedAt = shared.now();
        record.finishedAt = record.diedAt;
        reportDead(
          shared,
          { jobId, name: record.job.name, queue: record.queue, attempt, context: record.context },
          outcome.cause,
        );
        return;
      }
      await sleep(record.job.backoffMs(attempt));
    }
  }

  async function dispatch<Input>(job: JobDef<Input>, input: Input, options?: DispatchOptions): Promise<Dispatched> {
    return dispatching(shared, job.name, async (span) => {
      const prepared = await prepare(shared, job, input, options);
      span.setAttribute('bk.queue', prepared.queue);
      return start(prepared);
    });
  }

  async function start(prepared: Prepared): Promise<Dispatched> {
    if (records.has(prepared.jobId)) return { id: prepared.jobId, duplicate: true };
    const record: Entry = {
      status: 'active',
      job: prepared.job,
      queue: prepared.queue,
      input: prepared.input,
      context: prepared.context,
      error: '',
      attempts: 0,
      diedAt: 0,
      result: undefined,
      createdAt: shared.now(),
      finishedAt: undefined,
    };
    records.set(prepared.jobId, record);
    if (prepared.delayMs > 0) await sleep(prepared.delayMs);
    await execute(prepared.jobId, record);
    return { id: prepared.jobId, duplicate: false };
  }

  const publisher: OutboxPublisher = {
    async publish(message) {
      const subscription = shared.subscriptions.get(message.name);
      if (subscription === undefined) return;
      const prepared = await prepare(
        shared,
        subscription.job,
        subscription.map(message),
        { jobId: message.jobId },
        carry(message),
      );
      await start(prepared);
    },
  };

  const dead = (jobId: string): Entry => {
    const found = records.get(jobId);
    if (found === undefined)
      throw queueError('QUEUE_JOB_NOT_FOUND', 404, 'The job does not exist.', 'Check the id of the job.');
    if (found.status !== 'dead')
      throw queueError(
        'QUEUE_JOB_NOT_DEAD',
        409,
        'Only a dead job can be retried or discarded.',
        'Look in the dead letters.',
      );
    return found;
  };

  return {
    driver: 'sync',
    dispatch,
    subscribe(event, job, map) {
      shared.subscriptions.set(event, {
        job: job,
        map: map === undefined ? (message) => message.payload : map,
      });
    },
    publisher,
    createWorker(): Worker {
      return { start: () => undefined, stop: async () => undefined, crash: () => undefined };
    },
    async status(jobId): Promise<JobStatus | undefined> {
      const record = records.get(jobId);
      if (record === undefined) return undefined;
      return {
        id: jobId,
        name: record.job.name,
        queue: record.queue,
        status: record.status,
        attempts: record.attempts,
        ...(record.result === undefined ? {} : { result: JSON.parse(record.result) }),
        ...(record.error === '' ? {} : { error: record.error }),
        ...(record.context.tenantId === undefined ? {} : { tenantId: record.context.tenantId }),
        ...(record.context.userId === undefined ? {} : { userId: record.context.userId }),
        createdAt: record.createdAt,
        ...(record.finishedAt === undefined ? {} : { finishedAt: record.finishedAt }),
      };
    },
    async deadLetters(options = {}): Promise<DeadLetterPage> {
      const jobs: DeadJob[] = [...records.entries()]
        .filter(
          ([, record]) => record.status === 'dead' && (options.queue === undefined || record.queue === options.queue),
        )
        .map(([id, record]) => ({
          id,
          name: record.job.name,
          queue: record.queue,
          input: record.input,
          error: record.error,
          attempts: record.attempts,
          ...(record.context.tenantId === undefined ? {} : { tenantId: record.context.tenantId }),
          diedAt: record.diedAt,
        }))
        .toSorted((a, b) => b.diedAt - a.diedAt || a.id.localeCompare(b.id));
      return { jobs: jobs.slice(0, options.limit ?? 50), nextCursor: null };
    },
    async retry(jobId) {
      const record = dead(jobId);
      record.attempts = 0;
      record.error = '';
      await execute(jobId, record);
    },
    async discard(jobId) {
      dead(jobId);
      records.delete(jobId);
    },
    async stats(): Promise<QueueStats> {
      const out = { critical: emptyCounts(), default: emptyCounts(), reports: emptyCounts() };
      for (const record of records.values()) out[record.queue][record.status] += 1;
      return out;
    },
    async purge(): Promise<number> {
      let removed = 0;
      for (const [id, record] of records) {
        if (record.status === 'done') {
          records.delete(id);
          removed += 1;
        }
      }
      return removed;
    },
    async close() {
      records.clear();
    },
  };
}
