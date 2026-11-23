/**
 * BieberKit
 *
 * @file        packages/queue/src/scheduler.dialects.test.ts
 * @description Tests of the scheduler: a tick runs once however many schedulers run, and the lock is in the database (Q-07).
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
import { expect, it } from 'vitest';
import { rawKysely } from '@bieberkit/data/orm';
import { defineJob } from './contract.ts';
import { createQueue } from './queue.ts';
import { createScheduler } from './scheduler.ts';
import { JOBS_TABLE, LOCKS_TABLE } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const empty = z.object({});
const job = defineJob({ name: 'sch.report', queue: 'reports', input: empty, handler: async () => undefined });
const MINUTE = 60_000;
const START = Date.UTC(2026, 10, 23, 10, 0, 0);

describeDialects('Q-07 the scheduler', ({ open }) => {
  it('Q-07 dispatches the job of a schedule on the minutes that its cron names, and on no other', async () => {
    const db = await open([]);
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const scheduler = await createScheduler(queue, [{ name: 'quarter', cron: '*/15 * * * *', job, input: {} }], { db });
    const won: string[][] = [];
    for (let minute = 0; minute < 60; minute += 1)
      won.push([...(await scheduler.tick(new Date(START + minute * MINUTE)))]);
    expect(won.flat()).toHaveLength(4);
    expect(won.map((item, minute) => (item.length > 0 ? minute : -1)).filter((minute) => minute >= 0)).toEqual([
      0, 15, 30, 45,
    ]);
    const rows = await (await rawKysely(db)).selectFrom(JOBS_TABLE).select('job_id').execute();
    expect(rows.map((row) => String(row['job_id'])).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [0, 15, 30, 45]
        .map((minute) => `sched:quarter:${Math.floor((START + minute * MINUTE) / MINUTE)}`)
        .toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it('Q-07 two schedulers over 50 ticks run each tick once: 50 of 50, and every tick has one winner', async () => {
    const db = await open([]);
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const schedules = [{ name: 'every', cron: '* * * * *', job, input: {} }];
    const one = await createScheduler(queue, schedules, { db, owner: 'one' });
    const two = await createScheduler(queue, schedules, { db, owner: 'two' });
    let winners = 0;
    for (let minute = 0; minute < 50; minute += 1) {
      const at = new Date(START + minute * MINUTE);
      const results = await Promise.all([one.tick(at), two.tick(at)]);
      expect(results.flat()).toHaveLength(1);
      winners += results.flat().length;
    }
    expect(winners).toBe(50);
    expect(await (await rawKysely(db)).selectFrom(JOBS_TABLE).selectAll().execute()).toHaveLength(50);
  });

  it('Q-07 the lock of a tick is a row of bk_locks that names its owner, and it is free again a minute later', async () => {
    const db = await open([]);
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const scheduler = await createScheduler(queue, [{ name: 'lock', cron: '* * * * *', job, input: {} }], {
      db,
      owner: 'me',
    });
    await scheduler.tick(new Date(START));
    const [lock] = await (await rawKysely(db)).selectFrom(LOCKS_TABLE).selectAll().execute();
    expect(lock).toMatchObject({ name: 'sched:lock', owner: 'me' });
    expect(Number(lock?.['until'])).toBe(START + 50_000);
    const other = await createScheduler(queue, [{ name: 'lock', cron: '* * * * *', job, input: {} }], {
      db,
      owner: 'them',
    });
    expect(await other.tick(new Date(START + 10_000))).toEqual([]);
    expect(await other.tick(new Date(START + MINUTE))).toEqual(['lock']);
  });

  it('Q-07 a tick that was missed is skipped and not replayed', async () => {
    const db = await open([]);
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const scheduler = await createScheduler(queue, [{ name: 'gap', cron: '* * * * *', job, input: {} }], { db });
    await scheduler.tick(new Date(START));
    await scheduler.tick(new Date(START + 10 * MINUTE));
    expect(await (await rawKysely(db)).selectFrom(JOBS_TABLE).selectAll().execute()).toHaveLength(2);
  });

  it('Q-07 refuses a schedule with a bad cron, two schedules with one name, and a lock of a minute or more', async () => {
    const db = await open([]);
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    await expect(createScheduler(queue, [{ name: 'a', cron: 'bad', job, input: {} }], { db })).rejects.toMatchObject({
      code: 'QUEUE_CRON_INVALID',
    });
    const same = { name: 'a', cron: '* * * * *', job, input: {} };
    await expect(createScheduler(queue, [same, same], { db })).rejects.toMatchObject({ code: 'QUEUE_JOB_INVALID' });
    await expect(createScheduler(queue, [same], { db, lockMs: 60_000 })).rejects.toMatchObject({
      code: 'QUEUE_JOB_INVALID',
    });
  });

  it('Q-07 the scheduled job runs in the worker like any other job', async () => {
    const db = await open([]);
    let runs = 0;
    const counted = defineJob({ name: 'sch.counted', input: empty, handler: async () => void (runs += 1) });
    const queue = await createQueue({ driver: 'database', jobs: [counted], db });
    const scheduler = await createScheduler(queue, [{ name: 'run', cron: '* * * * *', job: counted, input: {} }], {
      db,
    });
    const worker = queue.createWorker({ pollMs: 15 });
    worker.start();
    await scheduler.tick(new Date(START));
    await expect.poll(() => runs, { timeout: 10_000, interval: 20 }).toBe(1);
    await worker.stop();
  });
});
