/**
 * BieberKit
 *
 * @file        packages/queue/src/contract.ts
 * @description The contract of the queue: jobs, their context, the queue and the worker that every driver implements (Q-01 to Q-04, Q-10, Q-11).
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

import { BkError } from '@bieberkit/core';
import type { Logger } from '@bieberkit/core';
import type { OutboxMessage, OutboxPublisher } from '@bieberkit/data/orm';
import type { SchemaValue } from '@bieberkit/data';

/** The queues that exist by default, so a long job never blocks an urgent one (Q-03). */
export const QUEUE_NAMES = ['critical', 'default', 'reports'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const isQueueName = (value: unknown): value is QueueName => QUEUE_NAMES.some((name) => name === value);

export const emptyCounts = (): { waiting: number; active: number; done: number; dead: number } => ({
  waiting: 0,
  active: 0,
  done: 0,
  dead: 0,
});

/** An error of the queue. Its code starts with `QUEUE_`. */
export class QueueError extends BkError {}

export function queueError(code: string, status: number, message: string, fix: string): QueueError {
  return new QueueError(message, { code, status, fix });
}

/** What a handler may return, and the queue keeps for the caller: anything that is JSON. */
export type JobResult = null | boolean | number | string | readonly JobResult[] | { readonly [key: string]: JobResult };

/** Where a job is, and what it answered. */
export interface JobStatus {
  readonly id: string;
  readonly name: string;
  readonly queue: QueueName;
  readonly status: 'waiting' | 'active' | 'done' | 'dead';
  readonly attempts: number;
  /** What the handler returned, for a job that is done. Kept as long as the job is (7 days). */
  readonly result?: JobResult;
  /** The last error, for a job that failed. */
  readonly error?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly createdAt: number;
  readonly finishedAt?: number;
}

/** What a handler gets besides its input. The tenant and the user are those of the code that dispatched the job (Q-10). */
export interface JobContext {
  /** The stable id of the job. The same on every delivery (Q-01). */
  readonly jobId: string;
  /** The delivery that this is, from 1. It is informational: a redelivery after a crash may or may not count (ADR 0010). */
  readonly attempt: number;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId: string;
  readonly log: Logger;
}

export interface JobInput<Input> {
  /** `<module>.<job>`, lower case. */
  readonly name: string;
  readonly queue?: QueueName;
  /** The schema of the input (Zod). It is checked on dispatch and again before the handler runs (Q-02). */
  readonly input: SchemaValue;
  /** Deliveries before the job is dead. Defaults to 3. */
  readonly attempts?: number;
  /** Milliseconds to wait after the nth failed delivery. Defaults to 200 ms doubled each time, at most an hour. */
  readonly backoffMs?: (attempt: number) => number;
  /** A handler that runs longer is a failed delivery. Defaults to 5 minutes. */
  readonly timeoutMs?: number;
  /** Must be idempotent: delivery is at least once (Q-01). */
  handler(input: Input, context: JobContext): Promise<JobResult | void> | JobResult | void;
}

/** The descriptor of a job. It holds no connection, so a module can declare it anywhere. */
export interface JobDef<Input = unknown> {
  readonly kind: 'job';
  readonly name: string;
  readonly queue: QueueName;
  readonly input: SchemaValue;
  readonly attempts: number;
  readonly backoffMs: (attempt: number) => number;
  readonly timeoutMs: number;
  handler(input: Input, context: JobContext): Promise<JobResult | void> | JobResult | void;
}

export interface DispatchOptions {
  /** The stable id. A second dispatch with the same id does nothing and answers the first (Q-01). */
  readonly jobId?: string;
  /** Milliseconds before the job may run. */
  readonly delayMs?: number;
  /** Overrides the queue of the job. */
  readonly queue?: QueueName;
}

export interface Dispatched {
  readonly id: string;
  /** True when a job with this id existed already and nothing was added. */
  readonly duplicate: boolean;
}

export interface DeadJob {
  readonly id: string;
  readonly name: string;
  readonly queue: QueueName;
  readonly input: unknown;
  readonly error: string;
  readonly attempts: number;
  readonly tenantId?: string;
  /** When the job died, in epoch milliseconds. */
  readonly diedAt: number;
}

export interface DeadLetterPage {
  readonly jobs: DeadJob[];
  readonly nextCursor: string | null;
}

export type QueueStats = Readonly<Record<QueueName, Readonly<Record<'waiting' | 'active' | 'done' | 'dead', number>>>>;

/**
 * Tells a worker that a job was added, from any process, so that it does not wait for its next poll. A source is a hint and never the
 * truth: the poll stays, and a hint that is lost costs one poll time (Q-06).
 */
export interface WakeSource {
  /**
   * Calls `onWake(queue)` when a job is added to `queue`, and `onWake(undefined)` when the worker should look at every queue (the source
   * has just connected, or connected again, and may have missed hints). Answers a function that stops listening.
   */
  listen(onWake: (queue: QueueName | undefined) => void): Promise<() => Promise<void>>;
}

export interface WorkerOptions {
  /** The queues to take jobs from. Defaults to all three. */
  readonly queues?: readonly QueueName[];
  /** Jobs that run at once, for each queue (a number) or by queue. Defaults to 4. A queue has its own slots, so a busy one never blocks another. */
  readonly concurrency?: number | Partial<Readonly<Record<QueueName, number>>>;
  /** Milliseconds between looks at an empty queue. Defaults to 200. With a `wake` source it can be much longer, because a new job wakes the worker. */
  readonly pollMs?: number;
  /** Wakes the worker when a job is added by another process. For PostgreSQL: `pgWakeSource` of `@bieberkit/queue/postgres`. */
  readonly wake?: WakeSource;
  /** How long a claimed job is the worker's before another may take it. Defaults to 30 000. */
  readonly leaseMs?: number;
  /** How often the lease is renewed while a job runs. Defaults to a third of the lease. */
  readonly heartbeatMs?: number;
  /** How long `stop` waits for the jobs that run. Defaults to 10 000. */
  readonly stopTimeoutMs?: number;
}

export interface Worker {
  start(): void;
  /** Stops taking jobs and waits for the ones that run, up to `stopTimeoutMs`. */
  stop(): Promise<void>;
  /** For tests: stops at once and leaves what runs unfinished and its lease unreleased, as a killed process would. */
  crash(): void;
}

export interface Queue {
  readonly driver: 'sync' | 'database' | 'redis';
  /** Adds a job. The input is checked first (`QUEUE_INPUT_INVALID`). */
  dispatch<Input>(job: JobDef<Input>, input: Input, options?: DispatchOptions): Promise<Dispatched>;
  /** Maps one outbox event to a job. `map` defaults to the payload; a second mapping for that event throws `QUEUE_SUBSCRIPTION_DUPLICATE`. */
  subscribe<Input>(event: string, job: JobDef<Input>, map?: (message: OutboxMessage) => Input): void;
  /** The publisher for the dispatcher of the outbox (MOD-18). */
  readonly publisher: OutboxPublisher;
  createWorker(options?: WorkerOptions): Worker;
  /** Where the job with this id is, and what it answered. `undefined` when there is no such job. */
  status(jobId: string): Promise<JobStatus | undefined>;
  deadLetters(options?: { queue?: QueueName; limit?: number; cursor?: string }): Promise<DeadLetterPage>;
  /** Puts a dead job back, with its deliveries counted again from zero. */
  retry(jobId: string): Promise<void>;
  discard(jobId: string): Promise<void>;
  stats(): Promise<QueueStats>;
  /** Removes finished jobs older than `olderThanMs` (7 days by default). Dead jobs stay until they are discarded. */
  purge(options?: { olderThanMs?: number }): Promise<number>;
  /**
   * Resolves when the jobs that this process started from the outbox have finished. The sync driver runs such a job after the
   * transaction that published it, as the other drivers do, so the job may use the database; they have nothing to wait for (BPL-04).
   */
  settle(): Promise<void>;
  close(): Promise<void>;
}

const JOB_NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const MAX_ATTEMPTS = 20;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_BACKOFF_MS = 3_600_000;

/** 200 ms, 400 ms, 800 ms and on, at most an hour. */
export const defaultBackoffMs = (attempt: number): number =>
  Math.min(200 * 2 ** Math.max(attempt - 1, 0), MAX_BACKOFF_MS);

/** Declares a job. It checks the declaration and returns a plain descriptor. */
export function defineJob<Input = unknown>(job: JobInput<Input>): JobDef<Input> {
  if (!JOB_NAME.test(job.name)) {
    throw queueError(
      'QUEUE_JOB_INVALID',
      500,
      `"${job.name}" is not a job name.`,
      'Name it like crm.deal.notify: lower case, a module and a job.',
    );
  }
  const queue = job.queue ?? 'default';
  if (!QUEUE_NAMES.includes(queue))
    throw queueError('QUEUE_JOB_INVALID', 500, `"${queue}" is not a queue.`, `Use ${QUEUE_NAMES.join(', ')}.`);
  const attempts = job.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_ATTEMPTS)
    throw queueError(
      'QUEUE_JOB_INVALID',
      500,
      `${job.name}: attempts must be a whole number from 1 to ${MAX_ATTEMPTS}.`,
      'Use 3 unless the job says otherwise.',
    );
  const timeoutMs = job.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1)
    throw queueError(
      'QUEUE_JOB_INVALID',
      500,
      `${job.name}: timeoutMs must be a positive number.`,
      'Give the longest run of the job in milliseconds.',
    );
  return {
    kind: 'job',
    name: job.name,
    queue,
    input: job.input,
    attempts,
    backoffMs: job.backoffMs ?? defaultBackoffMs,
    timeoutMs,
    handler: (input, context) => job.handler(input, context),
  };
}
