/**
 * BieberKit
 *
 * @file        packages/queue/src/sync.test.ts
 * @description Tests of the sync driver: the contract cases that apply to it, and its own rules (Q-01, Q-02, Q-11).
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

// These tests give inputs that the types forbid, on purpose.
/* oxlint-disable typescript/no-unsafe-type-assertion */
import { randomUUID } from 'node:crypto';
import * as z from 'zod/mini';
import { describe, expect, it } from 'vitest';
import { createMemoryReporter, requestContext } from '@bieberkit/core';
import { defineJob, QueueError } from './contract.ts';
import { createQueue } from './queue.ts';
import { queueContractSuite } from './testing/index.ts';

queueContractSuite(
  'the sync driver',
  async (jobs) => {
    const queue = await createQueue({ driver: 'sync', jobs });
    return { queue, close: () => queue.close() };
  },
  // No crash to recover from, no second worker, no queues that run beside each other: the job runs in the process that dispatches it.
  { skip: [6, 7, 8] },
);

describe('Q-02 the sync driver', () => {
  const job = defineJob<{ id: string }>({
    name: 'sync.check',
    input: z.object({ id: z.string() }),
    handler: async () => undefined,
  });

  it('Q-02 refuses an input that does not fit before anything runs', async () => {
    let runs = 0;
    const counted = defineJob<{ id: string }>({
      name: 'sync.counted',
      input: z.object({ id: z.string() }),
      handler: async () => void (runs += 1),
    });
    const queue = await createQueue({ driver: 'sync', jobs: [counted] });
    await expect(queue.dispatch(counted, { id: 1 } as never)).rejects.toMatchObject({
      code: 'QUEUE_INPUT_INVALID',
      status: 400,
    });
    expect(runs).toBe(0);
  });

  it('Q-02 refuses a job that no module registered, and a job registered twice', async () => {
    const queue = await createQueue({ driver: 'sync', jobs: [] });
    await expect(queue.dispatch(job, { id: 'x' })).rejects.toMatchObject({ code: 'QUEUE_JOB_UNKNOWN' });
    await expect(createQueue({ driver: 'sync', jobs: [job, job] })).rejects.toBeInstanceOf(QueueError);
  });

  it('Q-01 a failure that is thrown after the last delivery leaves a dead job, and dispatch still answers', async () => {
    const failing = defineJob({
      name: 'sync.fail',
      input: z.object({}),
      attempts: 2,
      backoffMs: () => 5,
      handler: async () => {
        throw new Error('nope');
      },
    });
    const queue = await createQueue({ driver: 'sync', jobs: [failing] });
    expect(await queue.dispatch(failing, {}, { jobId: 'f1' })).toEqual({ id: 'f1', duplicate: false });
    expect((await queue.deadLetters()).jobs[0]).toMatchObject({ id: 'f1', error: 'nope', attempts: 2 });
    await queue.discard('f1');
    expect((await queue.deadLetters()).jobs).toEqual([]);
  });

  it('Q-04 refuses to retry or discard a job that is not dead, or that does not exist', async () => {
    const ok = defineJob({ name: 'sync.ok', input: z.object({}), handler: async () => undefined });
    const queue = await createQueue({ driver: 'sync', jobs: [ok] });
    await queue.dispatch(ok, {}, { jobId: 'ok1' });
    await expect(queue.retry('ok1')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_DEAD', status: 409 });
    await expect(queue.discard('missing')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_FOUND', status: 404 });
    expect((await queue.stats()).default.done).toBe(1);
    expect(await queue.purge()).toBe(1);
  });

  it('Q-02 refuses a driver that does not exist and the database driver without a database', async () => {
    await expect(createQueue({ driver: 'database', jobs: [] })).rejects.toMatchObject({
      code: 'QUEUE_DRIVER_UNSUPPORTED',
    });
    await expect(createQueue({ driver: 'redis' as never, jobs: [] })).rejects.toMatchObject({
      code: 'QUEUE_DRIVER_UNSUPPORTED',
    });
  });
});

describe('OBS-06 the sync driver reports a job that failed for good', () => {
  const failing = defineJob({
    name: 'sync.report',
    queue: 'reports',
    input: z.object({}),
    attempts: 3,
    backoffMs: () => 1,
    handler: async () => {
      throw new Error('the report job broke');
    },
  });

  it('OBS-06 reports once, after the last delivery, with the job, the queue, the tenant and the user of the dispatcher', async () => {
    const reporter = createMemoryReporter();
    const queue = await createQueue({ driver: 'sync', jobs: [failing], errorReporter: reporter });
    const tenantId = randomUUID();
    const userId = randomUUID();
    await requestContext.run({ requestId: 'req-1', tenantId, userId }, () =>
      queue.dispatch(failing, {}, { jobId: 'report-1' }),
    );
    await queue.close();
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toMatchObject({ message: 'the report job broke' });
    expect(reporter.reports[0]?.context).toMatchObject({
      source: 'job',
      requestId: 'req-1',
      tenantId,
      userId,
      job: { name: 'sync.report', id: 'report-1', queue: 'reports', attempt: 3 },
    });
  });

  it('OBS-06 does not report a job that fails and then works, or one that works', async () => {
    const reporter = createMemoryReporter();
    let runs = 0;
    const flaky = defineJob({
      name: 'sync.flaky',
      input: z.object({}),
      attempts: 3,
      backoffMs: () => 1,
      handler: async () => {
        runs += 1;
        if (runs < 3) throw new Error('not yet');
      },
    });
    const queue = await createQueue({ driver: 'sync', jobs: [flaky], errorReporter: reporter });
    await queue.dispatch(flaky, {});
    await queue.close();
    expect(runs).toBe(3);
    expect(reporter.reports).toEqual([]);
  });

  it('OBS-06 a reporter that throws does not stop the job from being dead and the queue from working', async () => {
    const queue = await createQueue({
      driver: 'sync',
      jobs: [failing],
      errorReporter: {
        report: () => {
          throw new Error('reporter down');
        },
        flush: async () => false,
      },
    });
    await queue.dispatch(failing, {}, { jobId: 'report-2' });
    expect((await queue.deadLetters()).jobs).toHaveLength(1);
    await queue.close();
  });
});

describe('Q-11 the result of a job on the sync driver', () => {
  it('Q-11 a result that is not JSON, or is over 1 MiB, is not kept, and the job is still done', async () => {
    const odd = defineJob({ name: 'sync.odd', input: z.object({}), handler: async () => ({ big: 10n }) as never });
    const huge = defineJob({ name: 'sync.huge', input: z.object({}), handler: async () => 'x'.repeat(1_100_000) });
    const fine = defineJob({ name: 'sync.fine', input: z.object({}), handler: async () => 'x'.repeat(500_000) });
    const queue = await createQueue({ driver: 'sync', jobs: [odd, huge, fine] });
    await queue.dispatch(odd, {}, { jobId: 'odd-1' });
    await queue.dispatch(huge, {}, { jobId: 'huge-1' });
    await queue.dispatch(fine, {}, { jobId: 'fine-1' });
    expect(await queue.status('odd-1')).toMatchObject({ status: 'done' });
    expect(await queue.status('odd-1')).not.toHaveProperty('result');
    expect(await queue.status('huge-1')).toMatchObject({ status: 'done' });
    expect(await queue.status('huge-1')).not.toHaveProperty('result');
    expect((await queue.status('fine-1'))?.result).toHaveLength(500_000);
  });
});
