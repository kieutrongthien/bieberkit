/**
 * BieberKit
 *
 * @file        packages/queue/src/shared.ts
 * @description What every driver of the queue shares: the registry of jobs and of events, the check of a dispatch, and the run of one delivery (Q-01, Q-02, Q-10).
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
import { reportError } from '@bieberkit/core';
import type { ErrorReporter, Logger } from '@bieberkit/core';
import type { OutboxMessage } from '@bieberkit/data/orm';
import { captureContext, checkInput, runAs } from './context.ts';
import type { CarriedContext } from './context.ts';
import { QUEUE_NAMES, queueError } from './contract.ts';
import type { DispatchOptions, JobContext, JobDef, QueueName } from './contract.ts';

export interface Subscription {
  readonly job: JobDef;
  readonly map: (message: OutboxMessage) => unknown;
}

export interface Shared {
  readonly jobs: ReadonlyMap<string, JobDef>;
  readonly subscriptions: Map<string, Subscription>;
  readonly logger: Logger;
  /** Receives a job that failed for good (OBS-06). */
  readonly reporter: ErrorReporter;
  readonly now: () => number;
}

/** A job that was checked and is ready to be stored or run. */
export interface Prepared {
  readonly job: JobDef;
  readonly input: unknown;
  readonly jobId: string;
  readonly queue: QueueName;
  readonly delayMs: number;
  readonly context: CarriedContext;
}

const MAX_INPUT_BYTES = 1024 * 1024;
const JOB_ID = /^[\x21-\x7e]{1,200}$/;

/** Checks a dispatch: the job is known, the input fits its schema, the id and the delay are sane. */
export async function prepare(
  shared: Shared,
  job: JobDef,
  input: unknown,
  options: DispatchOptions = {},
  context: CarriedContext = captureContext(),
): Promise<Prepared> {
  if (shared.jobs.get(job.name) === undefined) {
    throw queueError(
      'QUEUE_JOB_UNKNOWN',
      500,
      `The job ${job.name} is not registered with this queue.`,
      'Pass the job in the `jobs` of createQueue, or contribute it from a module.',
    );
  }
  const checked = await checkInput(job.name, job.input, input);
  // The same limit for every driver, so a job that fits on one fits on all. Put a large body in the storage and the path of it in the job.
  if (Buffer.byteLength(JSON.stringify(checked ?? null)) > MAX_INPUT_BYTES) {
    throw queueError(
      'QUEUE_INPUT_TOO_LARGE',
      413,
      `The input of ${job.name} is over 1 MiB.`,
      'Keep the data in the storage or the database, and put its id in the input of the job.',
    );
  }
  const queue = options.queue ?? job.queue;
  if (!QUEUE_NAMES.includes(queue))
    throw queueError('QUEUE_JOB_INVALID', 400, `"${queue}" is not a queue.`, `Use ${QUEUE_NAMES.join(', ')}.`);
  const jobId = options.jobId ?? randomUUID();
  if (!JOB_ID.test(jobId))
    throw queueError(
      'QUEUE_JOB_INVALID',
      400,
      'The job id has 1 to 200 visible characters.',
      'Use a short id with no spaces.',
    );
  const delayMs = options.delayMs ?? 0;
  if (!Number.isFinite(delayMs) || delayMs < 0)
    throw queueError(
      'QUEUE_JOB_INVALID',
      400,
      'The delay must be 0 or more milliseconds.',
      'Use a number of milliseconds.',
    );
  return { job, input: checked, jobId, queue, delayMs, context };
}

export type Outcome =
  | { readonly ok: true; readonly result?: string }
  | { readonly ok: false; readonly retry: boolean; readonly error: string; readonly cause: unknown };

const MAX_RESULT_BYTES = 1024 * 1024;

/** The result of a job as JSON text, or `undefined` when there is none, or it is not JSON, or it is over 1 MiB (it is logged, and the job is still done). */
function encodeResult(shared: Shared, name: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = undefined;
  }
  if (text === undefined) {
    shared.logger.warn('the result of a job is not JSON and was not kept', { job: name });
    return undefined;
  }
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES) {
    shared.logger.warn('the result of a job is over 1 MiB and was not kept', { job: name });
    return undefined;
  }
  return text;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one delivery of a job as the code that dispatched it. The input is checked again, and a job whose stored input no longer fits
 * its schema is not retried, because the same input cannot start to pass (Q-02). A handler that throws, or that runs over its
 * timeout, is a failed delivery to retry.
 */
export async function runDelivery(
  shared: Shared,
  delivery: { jobId: string; name: string; input: string; attempt: number; context: CarriedContext },
): Promise<Outcome> {
  const job = shared.jobs.get(delivery.name);
  if (job === undefined)
    return {
      ok: false,
      retry: false,
      error: `The job ${delivery.name} is not registered with this worker.`,
      cause: new Error(`The job ${delivery.name} is not registered with this worker.`),
    };
  let input: unknown;
  try {
    input = await checkInput(job.name, job.input, JSON.parse(delivery.input));
  } catch (error) {
    return { ok: false, retry: false, error: error instanceof Error ? error.message : String(error), cause: error };
  }
  const requestId = delivery.context.requestId ?? `job-${delivery.jobId}`;
  const context: JobContext = {
    jobId: delivery.jobId,
    attempt: delivery.attempt,
    ...(delivery.context.tenantId === undefined ? {} : { tenantId: delivery.context.tenantId }),
    ...(delivery.context.userId === undefined ? {} : { userId: delivery.context.userId }),
    requestId,
    log: shared.logger.child({ jobId: delivery.jobId, job: job.name }),
  };
  let timer: NodeJS.Timeout | undefined;
  try {
    const value: unknown = await Promise.race([
      runAs(delivery.context, requestId, async () => job.handler(input, context)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`The job ran over its timeout of ${job.timeoutMs} ms.`)),
          job.timeoutMs,
        );
      }),
    ]);
    const result = encodeResult(shared, job.name, value);
    return result === undefined ? { ok: true } : { ok: true, result };
  } catch (error) {
    return { ok: false, retry: true, error: error instanceof Error ? error.message : String(error), cause: error };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** A job that will not run again: it is logged, and reported with its name, its queue and the tenant and user that dispatched it. */
export function reportDead(
  shared: Shared,
  job: { jobId: string; name: string; queue: string; attempt: number; context: CarriedContext },
  cause: unknown,
): void {
  shared.logger.error('job failed for good', {
    jobId: job.jobId,
    job: job.name,
    queue: job.queue,
    attempt: job.attempt,
    reason: cause instanceof Error ? cause.message : String(cause),
  });
  reportError(shared.reporter, cause, {
    source: 'job',
    requestId: job.context.requestId ?? `job-${job.jobId}`,
    ...(job.context.tenantId === undefined ? {} : { tenantId: job.context.tenantId }),
    ...(job.context.userId === undefined ? {} : { userId: job.context.userId }),
    job: { name: job.name, id: job.jobId, queue: job.queue, attempt: job.attempt },
  });
}

export { sleep };
