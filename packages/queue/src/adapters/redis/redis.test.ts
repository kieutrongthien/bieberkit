/**
 * BieberKit
 *
 * @file        packages/queue/src/adapters/redis/redis.test.ts
 * @description Tests of the redis driver on a real Valkey with noeviction: the nine cases of the contract, the ids, the dead letters, retry and discard, stalled jobs, the outbox, the prefix and the config (Q-11, ADR 0010).
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
import { afterAll, describe, expect, it } from 'vitest';
import { createMemoryReporter, requestContext } from '@bieberkit/core';
import { defineJob } from '../../contract.ts';
import { createQueue } from '../../queue.ts';
import { queueContractSuite } from '../../testing/contract-suite.ts';
import { describeQueueRedis } from '../../testing/redis.ts';
import { createQueueFromConfig, createRedisQueue } from './index.ts';
import { decodeId, encodeId } from './queue.ts';

const empty = z.object({});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const waitFor = async (done: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await sleep(15);
  }
};

describe('Q-01 the ids of BullMQ', () => {
  it('Q-01 an id that is a whole number or has a colon or a percent is made valid, and comes back as it was', () => {
    for (const id of ['1', '123456', 'a:b', 'a%3Ab', '100%', 'sched:daily:2026-11-24T00:00', 'ob-0190f6b2', 'tên-việt', '::', '%%']) {
      const stored = encodeId(id);
      expect(stored).not.toMatch(/^\d+$/);
      expect(stored).not.toContain(':');
      expect(decodeId(stored)).toBe(id);
    }
  });

  it('Q-01 two different ids never become the same stored id', () => {
    const ids = ['a:b', 'a%3Ab', 'a%253Ab', 'a%', 'a%25', '%3A', ':'];
    expect(new Set(ids.map(encodeId)).size).toBe(ids.length);
  });
});

describeQueueRedis('Q-11 the redis driver', ({ url, prefix, clean }) => {
  afterAll(clean);

  queueContractSuite('the redis driver (BullMQ on Valkey)', async (jobs) => {
    const queue = await createRedisQueue({ url, jobs, prefix: prefix() });
    return { queue, close: () => queue.close() };
  });

  const make = async (jobs: Parameters<typeof createRedisQueue>[0]['jobs'], extra: Partial<Parameters<typeof createRedisQueue>[0]> = {}) =>
    createRedisQueue({ url, jobs, prefix: prefix(), ...extra });

  describe('Q-04 dead letters', () => {
    const failing = defineJob<{ n: number }>({
      name: 'r.fail',
      input: z.object({ n: z.number() }),
      attempts: 1,
      handler: async (input) => {
        throw new Error(`boom ${String(input.n)}`);
      },
    });

    it('Q-04 pages the dead jobs newest first with a cursor, once each, and filters by queue', async () => {
      const queue = await make([failing]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      for (let n = 0; n < 5; n += 1) {
        await queue.dispatch(failing, { n }, { jobId: `d-${String(n)}` });
        await sleep(15);
      }
      await waitFor(async () => (await queue.deadLetters({ limit: 200 })).jobs.length === 5);
      const seen: string[] = [];
      let cursor: string | undefined;
      const sizes: number[] = [];
      for (let page = 0; page < 5; page += 1) {
        const result = await queue.deadLetters({ limit: 2, ...(cursor === undefined ? {} : { cursor }) });
        sizes.push(result.jobs.length);
        seen.push(...result.jobs.map((job) => job.id));
        if (result.nextCursor === null) break;
        cursor = result.nextCursor;
      }
      expect(sizes).toEqual([2, 2, 1]);
      expect(new Set(seen).size).toBe(5);
      expect(seen[0]).toBe('d-4');
      expect(seen.at(-1)).toBe('d-0');
      expect((await queue.deadLetters({ queue: 'reports' })).jobs).toEqual([]);
      expect((await queue.deadLetters({ queue: 'default' })).jobs).toHaveLength(5);
      const first = (await queue.deadLetters({ limit: 1 })).jobs[0];
      expect(first).toMatchObject({ id: 'd-4', name: 'r.fail', input: { n: 4 }, attempts: 1, queue: 'default' });
      expect(first?.error).toContain('boom 4');
      expect(first?.diedAt).toBeGreaterThan(Date.now() - 60_000);
      await worker.stop();
      await queue.close();
    });

    it('Q-04 retry counts the deliveries again from zero, and discard removes the job and its id', async () => {
      let runs = 0;
      const flaky = defineJob({
        name: 'r.flaky',
        input: empty,
        attempts: 2,
        backoffMs: () => 10,
        handler: async () => {
          runs += 1;
          if (runs <= 2) throw new Error('first two fail');
        },
      });
      const queue = await make([flaky]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      await queue.dispatch(flaky, {}, { jobId: 'f-1' });
      await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
      expect((await queue.deadLetters()).jobs[0]?.attempts).toBe(2);
      await queue.retry('f-1');
      await waitFor(async () => runs === 3 && (await queue.stats()).default.done === 1);
      expect((await queue.stats()).default).toMatchObject({ dead: 0, done: 1 });

      await worker.stop();
      await queue.close();
    });

    it('Q-04 refuses to retry or discard a job that does not exist or is not dead, and says which', async () => {
      const ok = defineJob({ name: 'r.ok', input: empty, handler: async () => undefined });
      const queue = await make([ok]);
      await queue.dispatch(ok, {}, { jobId: 'waiting-1' });
      await expect(queue.retry('missing')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_FOUND', status: 404 });
      await expect(queue.discard('missing')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_FOUND' });
      await expect(queue.retry('waiting-1')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_DEAD', status: 409 });
      await expect(queue.discard('waiting-1')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_DEAD' });
      await queue.close();
    });

    it('Q-04 a dead job is removed by discard, and its id can be used again', async () => {
      const queue = await make([failing]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      await queue.dispatch(failing, { n: 1 }, { jobId: 'again-1' });
      await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
      expect((await queue.dispatch(failing, { n: 1 }, { jobId: 'again-1' })).duplicate).toBe(true);
      await queue.discard('again-1');
      expect((await queue.deadLetters()).jobs).toEqual([]);
      expect((await queue.dispatch(failing, { n: 2 }, { jobId: 'again-1' })).duplicate).toBe(false);
      await worker.stop();
      await queue.close();
    });
  });

  describe('Q-02 input and ids', () => {
    it('Q-02 refuses an input that does not fit before anything is stored, and an id that is not allowed', async () => {
      const job = defineJob<{ id: string }>({ name: 'r.input', input: z.object({ id: z.string() }), handler: async () => undefined });
      const queue = await make([job]);
      // The test gives an input that the types forbid, on purpose.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      await expect(queue.dispatch(job, { id: 1 } as never)).rejects.toMatchObject({ code: 'QUEUE_INPUT_INVALID' });
      await expect(queue.dispatch(job, { id: 'x' }, { jobId: 'has space' })).rejects.toBeDefined();
      expect(await queue.stats()).toMatchObject({ default: { waiting: 0 } });
      await queue.close();
    });

    it('Q-01 ids that are numbers, or have colons or percent signs, work and come back as given', async () => {
      const seen: string[] = [];
      const job = defineJob({ name: 'r.ids', input: empty, handler: async (_input, context) => void seen.push(context.jobId) });
      const queue = await make([job]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      for (const id of ['12345', 'sched:daily:2026-11-24', '100%', 'a%3Ab']) await queue.dispatch(job, {}, { jobId: id });
      await waitFor(() => seen.length === 4);
      expect(seen.toSorted()).toEqual(['100%', '12345', 'a%3Ab', 'sched:daily:2026-11-24']);
      await worker.stop();
      await queue.close();
    });

    it('Q-02 a job whose stored input no longer fits its schema is not tried again, and is dead at once, reported', async () => {
      const reporter = createMemoryReporter();
      const loose = defineJob({ name: 'r.drift', input: z.object({ n: z.number() }), attempts: 5, handler: async () => undefined });
      const strict = defineJob({ name: 'r.drift', input: z.object({ n: z.string() }), attempts: 5, handler: async () => undefined });
      const name = prefix();
      const producer = await createRedisQueue({ url, jobs: [loose], prefix: name });
      const consumer = await createRedisQueue({ url, jobs: [strict], prefix: name, errorReporter: reporter });
      await producer.dispatch(loose, { n: 1 }, { jobId: 'drift-1' });
      const worker = consumer.createWorker({ pollMs: 20 });
      worker.start();
      await waitFor(async () => (await consumer.deadLetters()).jobs.length === 1);
      expect((await consumer.deadLetters()).jobs[0]).toMatchObject({ id: 'drift-1', attempts: 1 });
      expect(reporter.reports).toHaveLength(1);
      await worker.stop();
      await producer.close();
      await consumer.close();
    });
  });

  describe('Q-05 stalled jobs', () => {
    it('Q-05 a job whose worker dies on every delivery is dead after its stalls, and is reported once', async () => {
      const reporter = createMemoryReporter();
      let deliveries = 0;
      const poison = defineJob({
        name: 'r.poison',
        input: empty,
        attempts: 5,
        handler: async () => {
          deliveries += 1;
          await new Promise(() => undefined);
        },
      });
      const queue = await make([poison], { errorReporter: reporter });
      await queue.dispatch(poison, {}, { jobId: 'poison-1' });
      for (let round = 0; round < 5 && (await queue.deadLetters()).jobs.length === 0; round += 1) {
        const worker = queue.createWorker({ pollMs: 20, leaseMs: 250, heartbeatMs: 80 });
        worker.start();
        await sleep(700);
        worker.crash();
        await sleep(300);
      }
      const closing = queue.createWorker({ pollMs: 20, leaseMs: 250, heartbeatMs: 80 });
      closing.start();
      await waitFor(async () => (await queue.deadLetters()).jobs.length === 1, 20_000);
      expect((await queue.deadLetters()).jobs[0]?.error).toContain('stalled');
      expect(deliveries).toBeGreaterThanOrEqual(2);
      expect(reporter.reports).toHaveLength(1);
      await closing.stop();
      await queue.close();
    }, 40_000);
  });

  describe('Q-06 the outbox', () => {
    it('Q-06 an event of the outbox becomes a job with the tenant and user of the message, and a message that comes twice is one job', async () => {
      const seen: { tenant: string | undefined; user: string | undefined; id: string }[] = [];
      const job = defineJob<{ id: string }>({
        name: 'r.event',
        input: z.object({ id: z.string() }),
        handler: async (input) => {
          const known = requestContext.get();
          seen.push({ tenant: known?.tenantId, user: known?.userId, id: input.id });
        },
      });
      const queue = await make([job]);
      queue.subscribe('crm.deal.won', job);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      const tenantId = randomUUID();
      const userId = randomUUID();
      const message = { id: 'm1', jobId: 'ob-aaaa', name: 'crm.deal.won', version: 1, tenantId, userId, payload: { id: 'd1' }, createdAt: new Date() };
      // The transaction of the dispatcher is not used by this driver.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const claiming = {} as never;
      await queue.publisher.publish(message, claiming);
      await queue.publisher.publish(message, claiming);
      await queue.publisher.publish({ ...message, name: 'crm.deal.lost', jobId: 'ob-bbbb' }, claiming);
      await waitFor(() => seen.length === 1);
      await sleep(150);
      expect(seen).toEqual([{ tenant: tenantId, user: userId, id: 'd1' }]);
      await worker.stop();
      await queue.close();
    });
  });

  describe('Q-07 purge and stats', () => {
    it('Q-07 counts the jobs by state and queue, and purge removes the finished ones that are old enough', async () => {
      const job = defineJob({ name: 'r.count', input: empty, handler: async () => undefined });
      const late = defineJob({ name: 'r.later', queue: 'reports', input: empty, handler: async () => undefined });
      const queue = await make([job, late]);
      await queue.dispatch(late, {}, { delayMs: 60_000 });
      await queue.dispatch(job, {});
      await queue.dispatch(job, {});
      expect(await queue.stats()).toMatchObject({ default: { waiting: 2, done: 0 }, reports: { waiting: 1 } });
      const worker = queue.createWorker({ pollMs: 20, queues: ['default'] });
      worker.start();
      await waitFor(async () => (await queue.stats()).default.done === 2);
      expect(await queue.purge()).toBe(0);
      expect(await queue.purge({ olderThanMs: 0 })).toBe(2);
      expect((await queue.stats()).default.done).toBe(0);
      await worker.stop();
      await queue.close();
    });
  });

  describe('the prefix and the config', () => {
    it('a job of one prefix is never seen by a queue of another that shares the server', async () => {
      let ran = 0;
      const job = defineJob({ name: 'r.shared', input: empty, handler: async () => void (ran += 1) });
      const one = await make([job]);
      const two = await make([job]);
      const worker = two.createWorker({ pollMs: 20 });
      worker.start();
      await one.dispatch(job, {}, { jobId: 'same-id' });
      await sleep(400);
      expect(ran).toBe(0);
      expect((await two.dispatch(job, {}, { jobId: 'same-id' })).duplicate).toBe(false);
      await waitFor(() => ran === 1);
      await worker.stop();
      await one.close();
      await two.close();
    });

    it('QUEUE_DRIVER selects the queue, and redis without REDIS_URL is an error that names the variable', async () => {
      const job = defineJob({ name: 'r.config', input: empty, handler: async () => undefined });
      const sync = await createQueueFromConfig({ QUEUE_DRIVER: 'sync', REDIS_URL: undefined }, { jobs: [job] });
      expect(sync.driver).toBe('sync');
      const redis = await createQueueFromConfig({ QUEUE_DRIVER: 'redis', REDIS_URL: url }, { jobs: [job], prefix: prefix() });
      expect(redis.driver).toBe('redis');
      await redis.close();
      await expect(createQueueFromConfig({ QUEUE_DRIVER: 'redis', REDIS_URL: undefined }, { jobs: [job] })).rejects.toThrow(/REDIS_URL/);
      await expect(createQueueFromConfig({ QUEUE_DRIVER: 'database', REDIS_URL: undefined }, { jobs: [job] })).rejects.toThrow(/database/);
    });

    it('createQueue says where the redis driver is, and a job that is registered twice is refused', async () => {
      const job = defineJob({ name: 'r.twice', input: empty, handler: async () => undefined });
      // @ts-expect-error The test names a driver that createQueue does not have, on purpose.
      await expect(createQueue({ driver: 'redis', jobs: [job] })).rejects.toMatchObject({
        code: 'QUEUE_DRIVER_UNSUPPORTED',
        fix: expect.stringContaining('createRedisQueue'),
      });
      await expect(createRedisQueue({ url, jobs: [job, job], prefix: prefix() })).rejects.toMatchObject({ code: 'QUEUE_JOB_INVALID' });
    });
  });
});
