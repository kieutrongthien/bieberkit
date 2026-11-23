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
import type { Logger } from '@bieberkit/core';
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

export type Outcome = { readonly ok: true } | { readonly ok: false; readonly retry: boolean; readonly error: string };

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
    return { ok: false, retry: false, error: `The job ${delivery.name} is not registered with this worker.` };
  let input: unknown;
  try {
    input = await checkInput(job.name, job.input, JSON.parse(delivery.input));
  } catch (error) {
    return { ok: false, retry: false, error: error instanceof Error ? error.message : String(error) };
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
    await Promise.race([
      runAs(delivery.context, requestId, async () => job.handler(input, context)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`The job ran over its timeout of ${job.timeoutMs} ms.`)),
          job.timeoutMs,
        );
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return { ok: false, retry: true, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export { sleep };
