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
import * as z from 'zod/mini';
import { describe, expect, it } from 'vitest';
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
