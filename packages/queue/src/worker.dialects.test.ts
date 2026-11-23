/**
 * BieberKit
 *
 * @file        packages/queue/src/worker.dialects.test.ts
 * @description Tests of the worker of the database driver: its slots, its lease and heartbeat, its timeout and its stop (Q-03, Q-05).
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
import * as z from 'zod/mini';
import { expect, it } from 'vitest';
import { createMemoryReporter, requestContext } from '@bieberkit/core';
import { rawKysely } from '@bieberkit/data/orm';
import { defineJob } from './contract.ts';
import { createQueue } from './queue.ts';
import { JOBS_TABLE } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const empty = z.object({});
const waitFor = async (done: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};

describeDialects('Q-03 the worker', ({ open }) => {
  it('Q-03 never runs more jobs of a queue than it has slots for', async () => {
    const db = await open([]);
    let active = 0;
    let peak = 0;
    let done = 0;
    const job = defineJob({
      name: 'w.slots',
      input: empty,
      handler: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
        done += 1;
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 10, concurrency: { default: 3 } });
    worker.start();
    for (let n = 0; n < 12; n += 1) await queue.dispatch(job, {});
    await waitFor(() => done === 12);
    expect(peak).toBe(3);
    await worker.stop();
  });

  it('Q-03 takes only the queues that it is given', async () => {
    const db = await open([]);
    let ran = 0;
    const job = defineJob({ name: 'w.only', queue: 'reports', input: empty, handler: async () => void (ran += 1) });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 10, queues: ['critical', 'default'] });
    worker.start();
    await queue.dispatch(job, {});
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(ran).toBe(0);
    expect((await queue.stats()).reports.waiting).toBe(1);
    await worker.stop();
  });

  it('Q-05 renews the lease while a job runs, so a long job is not taken by another worker', async () => {
    const db = await open([]);
    let runs = 0;
    const job = defineJob({
      name: 'w.long',
      input: empty,
      handler: async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 900));
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const one = queue.createWorker({ pollMs: 20, leaseMs: 300, heartbeatMs: 80 });
    const two = queue.createWorker({ pollMs: 20, leaseMs: 300, heartbeatMs: 80 });
    one.start();
    two.start();
    await queue.dispatch(job, {});
    await waitFor(async () => (await queue.stats()).default.done === 1);
    expect(runs).toBe(1);
    await one.stop();
    await two.stop();
  });

  it('Q-05 a job whose lease ran out on every delivery is dead, and does not run for ever', async () => {
    const db = await open([]);
    const job = defineJob({
      name: 'w.lost',
      input: empty,
      attempts: 2,
      handler: async () => new Promise(() => undefined),
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    await queue.dispatch(job, {}, { jobId: 'lost-1' });
    for (let round = 0; round < 3; round += 1) {
      const worker = queue.createWorker({ pollMs: 15, leaseMs: 200, heartbeatMs: 50 });
      worker.start();
      await new Promise((resolve) => setTimeout(resolve, 120));
      worker.crash();
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    const closing = queue.createWorker({ pollMs: 15, leaseMs: 200, heartbeatMs: 50 });
    closing.start();
    await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
    expect((await queue.deadLetters()).jobs[0]?.error).toContain('lease');
    await closing.stop();
  });

  it('Q-01 a handler that runs over its timeout is a failed delivery, and the next delivery may succeed', async () => {
    const db = await open([]);
    let runs = 0;
    const job = defineJob({
      name: 'w.timeout',
      input: empty,
      timeoutMs: 80,
      attempts: 2,
      backoffMs: () => 10,
      handler: async () => {
        runs += 1;
        if (runs === 1) await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 15 });
    worker.start();
    await queue.dispatch(job, {});
    await waitFor(async () => (await queue.stats()).default.done === 1);
    expect(runs).toBe(2);
    await worker.stop();
  });

  it('Q-05 stop waits for the jobs that run and then takes nothing more', async () => {
    const db = await open([]);
    let finished = 0;
    const job = defineJob({
      name: 'w.stop',
      input: empty,
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        finished += 1;
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 10, concurrency: 2 });
    worker.start();
    await queue.dispatch(job, {});
    await queue.dispatch(job, {});
    await waitFor(async () => (await queue.stats()).default.active === 2);
    await worker.stop();
    expect(finished).toBe(2);
    await queue.dispatch(job, {});
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(finished).toBe(2);
    expect((await queue.stats()).default.waiting).toBe(1);
  });

  it('Q-05 a claim writes the worker, the lease and the delivery count in the row', async () => {
    const db = await open([]);
    const job = defineJob({
      name: 'w.row',
      input: empty,
      handler: async () => new Promise((resolve) => setTimeout(resolve, 300)),
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 10, leaseMs: 5000 });
    worker.start();
    await queue.dispatch(job, {}, { jobId: 'row-1' });
    await waitFor(async () => (await queue.stats()).default.active === 1);
    const row = await (
      await rawKysely(db)
    )
      .selectFrom(JOBS_TABLE)
      .select(['status', 'locked_by', 'locked_until', 'attempts'])
      .where('job_id', '=', 'row-1')
      .executeTakeFirst();
    expect(row).toMatchObject({ status: 'active', attempts: 1 });
    expect(String(row?.['locked_by'])).toMatch(/^w-/);
    expect(Number(row?.['locked_until'])).toBeGreaterThan(Date.now());
    await worker.stop();
  });
});

describeDialects('OBS-06 the worker reports a job that failed for good', ({ open }) => {
  it('OBS-06 reports a job that used its last attempt, once, with the context that it was dispatched with', async () => {
    const db = await open([]);
    const reporter = createMemoryReporter();
    const job = defineJob({
      name: 'w.report',
      queue: 'critical',
      input: empty,
      attempts: 2,
      backoffMs: () => 10,
      handler: async () => {
        throw new Error('broken for good');
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db, errorReporter: reporter });
    const tenantId = randomUUID();
    const userId = randomUUID();
    await requestContext.run({ requestId: 'req-w', tenantId, userId }, () =>
      queue.dispatch(job, {}, { jobId: 'rep-1' }),
    );
    const worker = queue.createWorker({ pollMs: 10 });
    worker.start();
    await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
    await worker.stop();
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toMatchObject({ message: 'broken for good' });
    expect(reporter.reports[0]?.context).toMatchObject({
      source: 'job',
      requestId: 'req-w',
      tenantId,
      userId,
      job: { name: 'w.report', id: 'rep-1', queue: 'critical', attempt: 2 },
    });
  });

  it('OBS-06 does not report a job that works after a retry', async () => {
    const db = await open([]);
    const reporter = createMemoryReporter();
    let runs = 0;
    const job = defineJob({
      name: 'w.retry-ok',
      input: empty,
      attempts: 3,
      backoffMs: () => 10,
      handler: async () => {
        runs += 1;
        if (runs === 1) throw new Error('once');
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db, errorReporter: reporter });
    await queue.dispatch(job, {});
    const worker = queue.createWorker({ pollMs: 10 });
    worker.start();
    await waitFor(() => runs === 2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await worker.stop();
    expect(reporter.reports).toEqual([]);
  });

  it('OBS-06 reports a job whose lease ran out on every delivery', async () => {
    const db = await open([]);
    const reporter = createMemoryReporter();
    const job = defineJob({
      name: 'w.lost-report',
      input: empty,
      attempts: 1,
      handler: async () => new Promise(() => undefined),
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db, errorReporter: reporter });
    await queue.dispatch(job, {}, { jobId: 'lost-r' });
    for (let round = 0; round < 2; round += 1) {
      const worker = queue.createWorker({ pollMs: 15, leaseMs: 200, heartbeatMs: 50 });
      worker.start();
      await new Promise((resolve) => setTimeout(resolve, 120));
      worker.crash();
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    const closing = queue.createWorker({ pollMs: 15, leaseMs: 200, heartbeatMs: 50 });
    closing.start();
    await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
    await closing.stop();
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toMatchObject({ message: expect.stringContaining('lease') });
    expect(reporter.reports[0]?.context.job).toMatchObject({ name: 'w.lost-report', id: 'lost-r' });
  });
});
