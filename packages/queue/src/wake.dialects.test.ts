/**
 * BieberKit
 *
 * @file        packages/queue/src/wake.dialects.test.ts
 * @description Tests of the wake of a worker: a job added by another process is taken at once on PostgreSQL, a notification waits for the commit, the listener connects again, and a source that fails never stops the worker (Q-06).
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

import * as z from 'zod/mini';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@bieberkit/core';
import { rawKysely } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { LISTENER_NAME, pgWakeSource } from './adapters/postgres/index.ts';
import { defineJob } from './contract.ts';
import type { QueueName, WakeSource } from './contract.ts';
import { createQueue } from './queue.ts';
import { JOBS_TABLE } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const empty = z.object({});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const waitFor = async (done: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await sleep(15);
  }
};

const listeners = async (db: Database): Promise<number> => {
  const kysely = await rawKysely(db);
  const result = await sql<{
    n: string;
  }>`select count(*) as n from pg_stat_activity where application_name = ${LISTENER_NAME} and datname = current_database()`.execute(
    kysely,
  );
  return Number(result.rows[0]?.n ?? 0);
};

const message = (jobId: string) => ({
  id: jobId,
  jobId,
  name: 'wake.event',
  version: 1,
  payload: {},
  createdAt: new Date(),
});

describeDialects('Q-06 the wake of a worker', ({ dialect, open, urlOf }) => {
  it('Q-06 a hint that arrives while the worker is busy with a claim is kept: the job is taken at once, not after the poll', async () => {
    const db = await open([]);
    let ran = 0;
    const job = defineJob({ name: 'wake.race', input: empty, handler: async () => void (ran += 1) });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    for (let round = 1; round <= 8; round += 1) {
      let hint: (() => void) | undefined;
      const source: WakeSource = {
        listen: async (onWake) => {
          hint = () => onWake('default');
          return async () => undefined;
        },
      };
      const worker = queue.createWorker({ pollMs: 30_000, wake: source });
      worker.start();
      // The first claim is on its way. The job is added and the hint comes at once, as another process would do.
      await queue.dispatch(job, {}, { jobId: `race-${String(round)}` });
      hint?.();
      await waitFor(() => ran === round, 5_000);
      await worker.stop();
    }
    expect(ran).toBe(8);
  }, 30_000);

  it('Q-06 a worker that stops before its source has started stops the source as soon as it is ready', async () => {
    const db = await open([]);
    let stopped = 0;
    const slow: WakeSource = {
      listen: async () => {
        await sleep(60);
        return async () => void (stopped += 1);
      },
    };
    const queue = await createQueue({ driver: 'database', jobs: [], db });
    const worker = queue.createWorker({ queues: [], wake: slow });
    worker.start();
    await worker.stop();
    await sleep(200);
    expect(stopped).toBe(1);
  });

  it('Q-06 a worker with a source of wakes starts it, stops it, and the dispatch of a job needs no notification', async () => {
    const db = await open([]);
    let listened = 0;
    let stopped = 0;
    const source: WakeSource = {
      listen: async () => {
        listened += 1;
        return async () => void (stopped += 1);
      },
    };
    let ran = 0;
    const job = defineJob({ name: 'wake.plain', input: empty, handler: async () => void (ran += 1) });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 20, wake: source });
    worker.start();
    await queue.dispatch(job, {});
    await waitFor(() => ran === 1);
    await worker.stop();
    expect([listened, stopped]).toEqual([1, 1]);
  });

  async function setup(wakeOptions: { retryMs?: number } = {}) {
    const db = await open([]);
    let ran = 0;
    const job = defineJob({ name: 'wake.one', input: empty, handler: async () => void (ran += 1) });
    const consumer = await createQueue({ driver: 'database', jobs: [job], db });
    // Another process: its own queue, with its own connections, on the same database.
    const producer = await createQueue({ driver: 'database', jobs: [job], db });
    const source = pgWakeSource({ url: urlOf(db), ...wakeOptions });
    return { db, job, consumer, producer, source, ran: () => ran };
  }

  describe.skipIf(dialect !== 'postgres')('on PostgreSQL', () => {
    it('Q-06 a worker that polls every 30 seconds takes a job that another process added within a moment', async () => {
      const { db, job, consumer, producer, source, ran } = await setup();
      const worker = consumer.createWorker({ pollMs: 30_000, wake: source });
      worker.start();
      await waitFor(async () => (await listeners(db)) === 1);
      await sleep(150);
      const started = Date.now();
      await producer.dispatch(job, {});
      await waitFor(() => ran() === 1, 3_000);
      expect(Date.now() - started).toBeLessThan(2_500);
      await worker.stop();
    });

    it('Q-06 the same worker with no source does not take it before its poll: the test measures what it says', async () => {
      const { job, consumer, producer, ran } = await setup();
      const worker = consumer.createWorker({ pollMs: 30_000 });
      worker.start();
      await sleep(150);
      await producer.dispatch(job, {});
      await sleep(1_000);
      expect(ran()).toBe(0);
      await worker.stop();
    });

    it('Q-06 the name of the queue is the hint, and a hint for a queue that the worker does not take is still harmless', async () => {
      const { db, source } = await setup();
      const hints: (QueueName | undefined)[] = [];
      const stop = await source.listen((queue) => void hints.push(queue));
      hints.length = 0;
      const queue = await createQueue({
        driver: 'database',
        jobs: [defineJob({ name: 'wake.crit', queue: 'critical', input: empty, handler: async () => undefined })],
        db,
      });
      const job = defineJob({ name: 'wake.crit', queue: 'critical', input: empty, handler: async () => undefined });
      await queue.dispatch(job, {});
      await waitFor(() => hints.length === 1);
      expect(hints).toEqual(['critical']);
      await stop();
    });

    it('Q-06 a job that is added twice with one id announces itself once', async () => {
      const { job, producer, source } = await setup();
      const hints: (QueueName | undefined)[] = [];
      const stop = await source.listen((queue) => void hints.push(queue));
      hints.length = 0;
      await producer.dispatch(job, {}, { jobId: 'same-1' });
      await producer.dispatch(job, {}, { jobId: 'same-1' });
      await sleep(300);
      expect(hints).toEqual(['default']);
      await stop();
    });

    it('Q-06 the notification waits for the commit: a rolled back insert wakes nobody, a committed one wakes after the commit', async () => {
      const { db, job, consumer, source } = await setup();
      consumer.subscribe('wake.event', job);
      const hints: (QueueName | undefined)[] = [];
      const stop = await source.listen((queue) => void hints.push(queue));
      hints.length = 0;
      const kysely = await rawKysely(db);
      await expect(
        kysely.transaction().execute(async (trx) => {
          await consumer.publisher.publish(message('ob-rolled'), trx);
          await sleep(100);
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      await sleep(300);
      expect(hints).toEqual([]);
      expect(await kysely.selectFrom(JOBS_TABLE).selectAll().execute()).toEqual([]);

      await kysely.transaction().execute(async (trx) => {
        await consumer.publisher.publish(message('ob-committed'), trx);
        await sleep(300);
        expect(hints).toEqual([]);
      });
      await waitFor(() => hints.length === 1);
      expect(hints).toEqual(['default']);
      await stop();
    });

    it('Q-06 a source that loses its connection connects again, says to look at every queue, and goes on', async () => {
      const { db, job, producer, source } = await setup({ retryMs: 40 });
      const hints: (QueueName | undefined)[] = [];
      const stop = await source.listen((queue) => void hints.push(queue));
      expect(hints).toEqual([undefined]);
      hints.length = 0;
      const kysely = await rawKysely(db);
      await sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name = ${LISTENER_NAME} and datname = current_database()`.execute(
        kysely,
      );
      await waitFor(() => hints.includes(undefined), 5_000);
      await waitFor(async () => (await listeners(db)) === 1);
      hints.length = 0;
      await producer.dispatch(job, {});
      await waitFor(() => hints.includes('default'), 3_000);
      await stop();
    });

    it('Q-06 stop closes the connection, also when it is asked again, and nothing is left to connect again', async () => {
      const { db, source } = await setup({ retryMs: 20 });
      const stop = await source.listen(() => undefined);
      expect(await listeners(db)).toBe(1);
      await stop();
      await stop();
      await sleep(150);
      expect(await listeners(db)).toBe(0);
    });

    it('Q-06 a notification on another channel is ignored, and one with a payload that is no queue is a hint for every queue', async () => {
      const { db, source } = await setup();
      const hints: (QueueName | undefined)[] = [];
      const stop = await source.listen((queue) => void hints.push(queue));
      hints.length = 0;
      const kysely = await rawKysely(db);
      await sql`select pg_notify('other_channel', 'default')`.execute(kysely);
      await sleep(200);
      expect(hints).toEqual([]);
      await sql`select pg_notify('bk_jobs', 'not-a-queue')`.execute(kysely);
      await waitFor(() => hints.length === 1);
      expect(hints).toEqual([undefined]);
      await stop();
    });

    it('Q-06 a source that cannot connect is a warning, and the worker polls and runs the job', async () => {
      const { job, consumer, producer, ran } = await setup();
      const lines: string[] = [];
      const logger = createLogger({ level: 'warn', role: 'worker', write: (line) => void lines.push(line) });
      const broken = pgWakeSource({ url: 'postgres://nobody:nothing@127.0.0.1:1/none', logger, retryMs: 50 });
      const worker = consumer.createWorker({ pollMs: 30, wake: broken });
      worker.start();
      await producer.dispatch(job, {});
      await waitFor(() => ran() === 1);
      await worker.stop();
      expect(lines.filter((line) => line.includes('wake source is not connected'))).toHaveLength(1);
    });

    it('Q-06 a source that throws when it starts is a warning, and the worker polls', async () => {
      const { db, job, producer, ran } = await setup();
      const lines: string[] = [];
      const logger = createLogger({ level: 'warn', role: 'worker', write: (line) => void lines.push(line) });
      const consumer = await createQueue({ driver: 'database', jobs: [job], db, logger });
      const failing: WakeSource = { listen: () => Promise.reject(new Error('no listener today')) };
      const worker = consumer.createWorker({ pollMs: 30, wake: failing });
      worker.start();
      await producer.dispatch(job, {});
      await waitFor(() => ran() === 1);
      await worker.stop();
      expect(lines.filter((line) => line.includes('the wake source could not start'))).toHaveLength(1);
    });
  });
});
