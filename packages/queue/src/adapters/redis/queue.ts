/**
 * BieberKit
 *
 * @file        packages/queue/src/adapters/redis/queue.ts
 * @description The redis queue driver: BullMQ on Valkey behind the contract of the queue, with a queue and a worker of BullMQ for each of critical, default and reports (Q-03, Q-11, ADR 0010).
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

import { randomUUID } from 'node:crypto';
import { Queue as BullQueue, UnrecoverableError, Worker as BullWorker } from 'bullmq';
import type { Job, Processor } from 'bullmq';
import { Redis } from 'ioredis';
import type { ErrorReporter, Logger } from '@bieberkit/core';
import { QUEUE_NAMES, queueError } from '../../contract.ts';
import type { QueueError } from '../../contract.ts';
import type {
  DeadJob,
  DeadLetterPage,
  Dispatched,
  DispatchOptions,
  JobDef,
  Queue,
  QueueName,
  QueueStats,
  Worker,
  WorkerOptions,
} from '../../contract.ts';
import { createShared } from '../../queue.ts';
import { prepare, reportDead, runDelivery } from '../../shared.ts';
import type { Prepared } from '../../shared.ts';
import { slotsOf } from '../../worker.ts';

export interface RedisQueueOptions {
  /** The Valkey or Redis of the queue (`REDIS_URL`). It must have `maxmemory-policy noeviction` (Q-08). */
  readonly url: string;
  readonly jobs: readonly JobDef[];
  /** Isolates apps that share one server. Defaults to `bk`. */
  readonly prefix?: string;
  readonly logger?: Logger;
  readonly errorReporter?: ErrorReporter;
  readonly now?: () => number;
}

/** What a job keeps in Redis, in short names. The input is text, as in the table of the database driver. */
interface JobData {
  /** The job id of the caller (`dispatch` answers it). */
  readonly id: string;
  readonly name: string;
  readonly input: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId?: string;
  /** Who added it: a second `add` with the same id answers the first job, and the token says which one is ours (Q-01). */
  readonly token: string;
}

const SEVEN_DAYS_S = 7 * 86_400;
const SEVEN_DAYS_MS = SEVEN_DAYS_S * 1000;
const BACKOFF = 'bieberkit';

/** A BullMQ id cannot be a whole number or hold `:`. `j-` and a percent code for `%` and `:` make every id of ours a valid one. */
export const encodeId = (id: string): string => `j-${id.replaceAll('%', '%25').replaceAll(':', '%3A')}`;
export const decodeId = (stored: string): string => stored.slice(2).replaceAll('%3A', ':').replaceAll('%25', '%');

function isJobData(value: unknown): value is JobData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'input' in value &&
    typeof value.input === 'string' &&
    'token' in value &&
    typeof value.token === 'string'
  );
}

const isOurs = (job: Job, token: string): boolean => isJobData(job.data) && job.data.token === token;

/** The error of `retry` and `discard` for a job that is not there, or is not dead. */
const refusal = (job: Job | undefined): QueueError =>
  job === undefined
    ? queueError('QUEUE_JOB_NOT_FOUND', 404, 'The job does not exist.', 'Check the id of the job.')
    : queueError('QUEUE_JOB_NOT_DEAD', 409, 'Only a dead job can be retried or discarded.', 'Look in the dead letters.');

/** The queue on Valkey. One BullMQ queue for each of the three names, so that each has its own workers and its own slots. */
export async function createRedisQueue(options: RedisQueueOptions): Promise<Queue> {
  const shared = createShared(options);
  const prefix = options.prefix ?? 'bk';
  // BullMQ needs `maxRetriesPerRequest: null` on the connection of a worker: a blocking command must not be given up.
  const connection = new Redis(options.url, { maxRetriesPerRequest: null });
  connection.on('error', (error) => shared.logger.error('the queue connection failed', { reason: error.message }));
  const queues = new Map<QueueName, BullQueue>();
  const workers = new Set<Worker>();

  const queueOf = (name: QueueName): BullQueue => {
    const found = queues.get(name);
    if (found !== undefined) return found;
    const made = new BullQueue(name, { connection, prefix });
    made.on('error', (error) => shared.logger.error('a queue failed', { queue: name, reason: error.message }));
    queues.set(name, made);
    return made;
  };

  async function add(prepared: Prepared): Promise<Dispatched> {
    const token = randomUUID();
    const data: JobData = {
      id: prepared.jobId,
      name: prepared.job.name,
      input: JSON.stringify(prepared.input ?? null),
      token,
      ...(prepared.context.tenantId === undefined ? {} : { tenantId: prepared.context.tenantId }),
      ...(prepared.context.userId === undefined ? {} : { userId: prepared.context.userId }),
      ...(prepared.context.requestId === undefined ? {} : { requestId: prepared.context.requestId }),
    };
    const queue = queueOf(prepared.queue);
    const stored = encodeId(prepared.jobId);
    await queue.add(prepared.job.name, data, {
      jobId: stored,
      delay: prepared.delayMs,
      attempts: prepared.job.attempts,
      backoff: { type: BACKOFF },
      // Finished jobs stay for 7 days, as in the table of the database driver, because the id of a job that is kept is what makes a second dispatch a no-op.
      removeOnComplete: { age: SEVEN_DAYS_S },
      removeOnFail: false,
    });
    // `add` answers the job that it was given, also when one with this id existed, so the stored job says who was first.
    const first = await queue.getJob(stored);
    return { id: prepared.jobId, duplicate: first === undefined ? false : !isOurs(first, token) };
  }

  async function find(jobId: string): Promise<Job | undefined> {
    for (const name of QUEUE_NAMES) {
      const found = await queueOf(name).getJob(encodeId(jobId));
      if (found !== undefined) return found;
    }
    return undefined;
  }


  async function dispatch<Input>(job: JobDef<Input>, input: Input, dispatchOptions?: DispatchOptions): Promise<Dispatched> {
    return add(await prepare(shared, job, input, dispatchOptions));
  }

  const publisher: Queue['publisher'] = {
    async publish(message) {
      const subscription = shared.subscriptions.get(message.name);
      if (subscription === undefined) return;
      // The transaction of the dispatcher is not used: Redis has no part in it. If the row is not deleted after this, it is published
      // again, and the id of the message makes the second add a no-op (Q-01).
      await add(
        await prepare(shared, subscription.job, subscription.map(message), { jobId: message.jobId }, {
          ...(message.tenantId === undefined ? {} : { tenantId: message.tenantId }),
          ...(message.userId === undefined ? {} : { userId: message.userId }),
          ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
        }),
      );
    },
  };

  function deadJob(job: Job, queue: QueueName): DeadJob | undefined {
    if (!isJobData(job.data)) return undefined;
    return {
      id: job.data.id,
      name: job.data.name,
      queue,
      input: JSON.parse(job.data.input),
      error: job.failedReason,
      attempts: job.attemptsMade,
      ...(job.data.tenantId === undefined ? {} : { tenantId: job.data.tenantId }),
      diedAt: job.finishedOn ?? shared.now(),
    };
  }

  function createWorker(workerOptions: WorkerOptions = {}): Worker {
    const names = workerOptions.queues ?? QUEUE_NAMES;
    const leaseMs = workerOptions.leaseMs ?? 30_000;
    const stopTimeoutMs = workerOptions.stopTimeoutMs ?? 10_000;
    const running: BullWorker[] = [];
    const causes = new Map<string, unknown>();
    let started = false;

    const processor: Processor = async (job) => {
        if (!isJobData(job.data)) throw new UnrecoverableError('The job has no data of ours.');
        const data = job.data;
        const outcome = await runDelivery(shared, {
          jobId: data.id,
          name: data.name,
          input: data.input,
          attempt: job.attemptsStarted,
          context: {
            ...(data.tenantId === undefined ? {} : { tenantId: data.tenantId }),
            ...(data.userId === undefined ? {} : { userId: data.userId }),
            ...(data.requestId === undefined ? {} : { requestId: data.requestId }),
          },
        });
        if (outcome.ok) return;
        if (job.id !== undefined) causes.set(job.id, outcome.cause);
        // A job that cannot start to pass (an input that no longer fits) is not given another attempt.
        if (!outcome.retry) throw new UnrecoverableError(outcome.error);
        throw new Error(outcome.error);
      };

    const settled = (queue: QueueName) => (job: Job | undefined, error: Error) => {
      if (job === undefined || !isJobData(job.data)) return;
      const last =
        error instanceof UnrecoverableError ||
        job.attemptsMade >= (job.opts.attempts ?? 1) ||
        /stalled more than/.test(error.message);
      const cause = job.id === undefined ? undefined : causes.get(job.id);
      if (job.id !== undefined) causes.delete(job.id);
      if (!last) return;
      reportDead(
        shared,
        {
          jobId: job.data.id,
          name: job.data.name,
          queue,
          attempt: job.attemptsMade,
          context: {
            ...(job.data.tenantId === undefined ? {} : { tenantId: job.data.tenantId }),
            ...(job.data.userId === undefined ? {} : { userId: job.data.userId }),
            ...(job.data.requestId === undefined ? {} : { requestId: job.data.requestId }),
          },
        },
        cause ?? error,
      );
    };

    const worker: Worker = {
      start() {
        if (started) return;
        started = true;
        for (const name of names) {
          const bull = new BullWorker(name, processor, {
            connection,
            prefix,
            concurrency: Math.max(slotsOf(workerOptions, name), 1),
            lockDuration: leaseMs,
            ...(workerOptions.heartbeatMs === undefined ? {} : { lockRenewTime: workerOptions.heartbeatMs }),
            // A job whose worker died is found by the next check of any worker, and given again. A job that stalls three times is dead.
            stalledInterval: Math.max(Math.min(leaseMs, 30_000), 250),
            maxStalledCount: 2,
            settings: {
              backoffStrategy: (attemptsMade, _type, _error, job) =>
                shared.jobs.get(job?.name ?? '')?.backoffMs(attemptsMade) ?? 1000,
            },
          });
          bull.on('failed', settled(name));
          bull.on('error', (error) => shared.logger.error('a worker failed', { queue: name, reason: error.message }));
          running.push(bull);
        }
      },
      async stop() {
        const all = running.splice(0);
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<'late'>((resolve) => {
          timer = setTimeout(() => resolve('late'), stopTimeoutMs);
        });
        const closing = Promise.all(all.map((bull) => bull.close()));
        if ((await Promise.race([closing.then(() => 'done' as const), timeout])) === 'late') {
          await Promise.all(all.map((bull) => bull.close(true)));
        }
        if (timer !== undefined) clearTimeout(timer);
        started = false;
        workers.delete(worker);
      },
      crash() {
        // Stops at once and leaves the jobs that run unfinished, with their locks, as a killed process would.
        for (const bull of running.splice(0)) void bull.close(true);
        started = false;
      },
    };
    workers.add(worker);
    return worker;
  }

  const counts = async (): Promise<QueueStats> => {
    const out: Record<QueueName, Record<'waiting' | 'active' | 'done' | 'dead', number>> = {
      critical: { waiting: 0, active: 0, done: 0, dead: 0 },
      default: { waiting: 0, active: 0, done: 0, dead: 0 },
      reports: { waiting: 0, active: 0, done: 0, dead: 0 },
    };
    for (const name of QUEUE_NAMES) {
      const found = await queueOf(name).getJobCounts('waiting', 'prioritized', 'delayed', 'active', 'completed', 'failed');
      out[name] = {
        waiting: (found['waiting'] ?? 0) + (found['prioritized'] ?? 0) + (found['delayed'] ?? 0),
        active: found['active'] ?? 0,
        done: found['completed'] ?? 0,
        dead: found['failed'] ?? 0,
      };
    }
    return out;
  };

  return {
    driver: 'redis',
    dispatch,
    subscribe(event, job, map) {
      shared.subscriptions.set(event, { job, map: map === undefined ? (message) => message.payload : map });
    },
    publisher,
    createWorker,
    async deadLetters(dead = {}): Promise<DeadLetterPage> {
      const limit = Math.min(Math.max(dead.limit ?? 50, 1), 200);
      const offset = dead.cursor === undefined ? 0 : Number(Buffer.from(dead.cursor, 'base64url').toString('utf8'));
      const names = dead.queue === undefined ? QUEUE_NAMES : [dead.queue];
      const found: DeadJob[] = [];
      for (const name of names) {
        // Newest first, from each queue as far as this page can reach, and then merged.
        const jobs = await queueOf(name).getJobs(['failed'], 0, Math.max(offset, 0) + limit, false);
        for (const job of jobs) {
          const mapped = deadJob(job, name);
          if (mapped !== undefined) found.push(mapped);
        }
      }
      found.sort((a, b) => b.diedAt - a.diedAt || (a.id < b.id ? 1 : -1));
      const page = found.slice(offset, offset + limit);
      return {
        jobs: page,
        nextCursor: found.length > offset + limit ? Buffer.from(String(offset + limit)).toString('base64url') : null,
      };
    },
    async retry(jobId) {
      const job = await find(jobId);
      if (job === undefined || !(await job.isFailed())) throw refusal(job);
      await job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
    },
    async discard(jobId) {
      const job = await find(jobId);
      if (job === undefined || !(await job.isFailed())) throw refusal(job);
      await job.remove();
    },
    stats: counts,
    async purge(purgeOptions = {}) {
      const grace = purgeOptions.olderThanMs ?? SEVEN_DAYS_MS;
      let removed = 0;
      for (const name of QUEUE_NAMES) {
        for (;;) {
          const batch = await queueOf(name).clean(grace, 1000, 'completed');
          removed += batch.length;
          if (batch.length < 1000) break;
        }
      }
      return removed;
    },
    async close() {
      await Promise.all([...workers].map((worker) => worker.stop()));
      workers.clear();
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      queues.clear();
      connection.disconnect();
    },
  };
}
