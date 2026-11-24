/**
 * BieberKit
 *
 * @file        packages/queue/src/database.dialects.test.ts
 * @description Tests of the database driver on SQLite, PostgreSQL and MySQL: the contract suite, the checks of input, the dead letters, the lease and the purge (Q-01 to Q-05, Q-11).
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
import { rawKysely } from '@bieberkit/data/orm';
import { defineJob } from './contract.ts';
import { createQueue } from './queue.ts';
import { JOBS_TABLE } from './tables.ts';
import { queueContractSuite } from './testing/index.ts';
import { describeDialects } from './testing/dialects.ts';

describeDialects('Q-11 the database driver', ({ open }) => {
  queueContractSuite('the database driver', async (jobs) => {
    const db = await open([]);
    const queue = await createQueue({ driver: 'database', jobs, db });
    return { queue, close: () => queue.close() };
  });
});

const empty = z.object({});
const waitFor = async (done: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};

describeDialects('Q-02 the database driver on its own', ({ open }) => {
  it('Q-02 refuses an input that does not fit before anything is stored', async () => {
    const db = await open([]);
    const job = defineJob<{ id: string }>({
      name: 'db.check',
      input: z.object({ id: z.string() }),
      handler: async () => undefined,
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    await expect(queue.dispatch(job, { id: 5 } as never)).rejects.toMatchObject({
      code: 'QUEUE_INPUT_INVALID',
      status: 400,
    });
    expect(await (await rawKysely(db)).selectFrom(JOBS_TABLE).selectAll().execute()).toEqual([]);
  });

  it('Q-02 a stored input that no longer fits its schema is checked again, is not retried and is dead with the reason', async () => {
    const db = await open([]);
    let runs = 0;
    const job = defineJob<{ id: string }>({
      name: 'db.again',
      input: z.object({ id: z.string() }),
      attempts: 3,
      handler: async () => void (runs += 1),
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    await queue.dispatch(job, { id: 'ok' }, { jobId: 'bad-1' });
    await (
      await rawKysely(db)
    )
      .updateTable(JOBS_TABLE)
      .set({ input: JSON.stringify({ id: 42 }) })
      .where('job_id', '=', 'bad-1')
      .execute();
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
    expect(runs).toBe(0);
    const [dead] = (await queue.deadLetters()).jobs;
    expect(dead).toMatchObject({ id: 'bad-1', attempts: 1 });
    expect(dead?.error).toContain('not valid');
    await worker.stop();
  });

  it('Q-01 a job that no module registered with this worker is dead and does not stop the others', async () => {
    const db = await open([]);
    const known = defineJob({ name: 'db.known', input: empty, handler: async () => undefined });
    const ghost = defineJob({ name: 'db.ghost', input: empty, handler: async () => undefined });
    const writer = await createQueue({ driver: 'database', jobs: [known, ghost], db });
    await writer.dispatch(ghost, {}, { jobId: 'g1' });
    await writer.dispatch(known, {}, { jobId: 'k1' });
    const reader = await createQueue({ driver: 'database', jobs: [known], db });
    const worker = reader.createWorker({ pollMs: 20 });
    worker.start();
    await waitFor(async () => (await reader.stats()).default.done === 1 && (await reader.stats()).default.dead === 1);
    expect((await reader.deadLetters()).jobs[0]?.error).toContain('db.ghost');
    await worker.stop();
  });

  it('Q-10 stores the tenant, the user and the request of the dispatcher with the job, and none when there are none', async () => {
    const db = await open([]);
    const job = defineJob({ name: 'db.context', input: empty, handler: async () => undefined });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const { requestContext } = await import('@bieberkit/core');
    await requestContext.run(
      {
        requestId: 'r-1',
        tenantId: '0190f6b2-7c4e-7000-8000-0000000000a1',
        userId: '0190f6b2-7c4e-7000-8000-0000000000b1',
      },
      () => queue.dispatch(job, {}, { jobId: 'with' }),
    );
    await queue.dispatch(job, {}, { jobId: 'without' });
    const rows = await (
      await rawKysely(db)
    )
      .selectFrom(JOBS_TABLE)
      .select(['job_id', 'tenant_id', 'user_id', 'request_id'])
      .execute();
    const by = Object.fromEntries(rows.map((row) => [String(row['job_id']), row]));
    expect(by['with']).toMatchObject({
      tenant_id: '0190f6b2-7c4e-7000-8000-0000000000a1',
      user_id: '0190f6b2-7c4e-7000-8000-0000000000b1',
      request_id: 'r-1',
    });
    expect(by['without']).toMatchObject({ tenant_id: null, user_id: null, request_id: null });
  });

  it('Q-01 a job id of a finished job still deduplicates, so a redelivered outbox row cannot run twice', async () => {
    const db = await open([]);
    let runs = 0;
    const job = defineJob({ name: 'db.dedupe', input: empty, handler: async () => void (runs += 1) });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    await queue.dispatch(job, {}, { jobId: 'ob-1' });
    await waitFor(() => runs === 1);
    await waitFor(async () => (await queue.stats()).default.done === 1);
    expect((await queue.dispatch(job, {}, { jobId: 'ob-1' })).duplicate).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(runs).toBe(1);
    await worker.stop();
  });

  it('Q-04 pages the dead letters by a cursor, newest first, by queue, and retry and discard refuse what is not dead', async () => {
    const db = await open([]);
    const job = defineJob({
      name: 'db.page',
      input: empty,
      attempts: 1,
      handler: async () => {
        throw new Error('x');
      },
    });
    const urgent = defineJob({
      name: 'db.page-urgent',
      queue: 'critical',
      input: empty,
      attempts: 1,
      handler: async () => {
        throw new Error('y');
      },
    });
    let clock = 1_000_000;
    const queue = await createQueue({ driver: 'database', jobs: [job, urgent], db, now: () => (clock += 10) });
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    for (let n = 0; n < 5; n += 1) await queue.dispatch(job, {}, { jobId: `p${n}` });
    await queue.dispatch(urgent, {}, { jobId: 'u0' });
    await waitFor(async () => (await queue.deadLetters({ limit: 100 })).jobs.length === 6);
    const first = await queue.deadLetters({ limit: 4 });
    expect(first.jobs).toHaveLength(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await queue.deadLetters({ limit: 4, cursor: first.nextCursor ?? '' });
    expect(second.jobs).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.jobs, ...second.jobs].map((item) => item.id)).size).toBe(6);
    expect((await queue.deadLetters({ queue: 'critical' })).jobs.map((item) => item.id)).toEqual(['u0']);
    await queue.discard('p0');
    await expect(queue.discard('p0')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_FOUND', status: 404 });
    await expect(queue.retry('missing')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_FOUND' });
    await worker.stop();
  });

  it('Q-04 a job that is not dead cannot be retried or discarded', async () => {
    const db = await open([]);
    const job = defineJob({ name: 'db.waits', input: empty, handler: async () => undefined });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    await queue.dispatch(job, {}, { jobId: 'w1' });
    await expect(queue.retry('w1')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_DEAD', status: 409 });
    await expect(queue.discard('w1')).rejects.toMatchObject({ code: 'QUEUE_JOB_NOT_DEAD' });
  });

  it('Q-01 purge removes finished jobs that are older than the retention, and keeps the dead and the recent', async () => {
    const db = await open([]);
    let clock = 10_000_000_000;
    const ok = defineJob({ name: 'db.purge-ok', input: empty, handler: async () => undefined });
    const bad = defineJob({
      name: 'db.purge-bad',
      input: empty,
      attempts: 1,
      handler: async () => {
        throw new Error('x');
      },
    });
    const queue = await createQueue({ driver: 'database', jobs: [ok, bad], db, now: () => clock });
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    await queue.dispatch(ok, {}, { jobId: 'old' });
    await queue.dispatch(bad, {}, { jobId: 'dead' });
    await waitFor(async () => (await queue.stats()).default.done === 1 && (await queue.stats()).default.dead === 1);
    expect(await queue.purge()).toBe(0);
    clock += 8 * 86_400_000;
    await queue.dispatch(ok, {}, { jobId: 'new' });
    await waitFor(async () => (await queue.stats()).default.done === 2);
    expect(await queue.purge()).toBe(1);
    expect((await queue.stats()).default).toMatchObject({ done: 1, dead: 1 });
    await worker.stop();
  });

  it('Q-02 refuses a job id that is not 1 to 200 visible characters, and a delay that is not a number of 0 or more', async () => {
    const db = await open([]);
    const job = defineJob({ name: 'db.ids', input: empty, handler: async () => undefined });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    for (const jobId of ['', 'has space', 'x'.repeat(201)])
      await expect(queue.dispatch(job, {}, { jobId })).rejects.toMatchObject({ code: 'QUEUE_JOB_INVALID' });
    for (const delayMs of [-1, Number.NaN])
      await expect(queue.dispatch(job, {}, { delayMs })).rejects.toMatchObject({ code: 'QUEUE_JOB_INVALID' });
  });
});

describe('Q-02 the shape of the stats', () => {
  it('Q-02 counts each queue and each status', async () => {
    const queue = await createQueue({ driver: 'sync', jobs: [] });
    expect(await queue.stats()).toEqual({
      critical: { waiting: 0, active: 0, done: 0, dead: 0 },
      default: { waiting: 0, active: 0, done: 0, dead: 0 },
      reports: { waiting: 0, active: 0, done: 0, dead: 0 },
    });
  });
});

describeDialects('Q-11 the result of a job on the database driver', ({ open, dialect }) => {
  it('Q-11 keeps an answer of 300 KB, which MySQL could not hold in a TEXT column, and one that is over 1 MiB is dropped', async () => {
    const db = await open([]);
    const big = defineJob({ name: 'res.big', input: empty, handler: async () => ({ rows: 'Việt'.repeat(75_000) }) });
    const huge = defineJob({ name: 'res.huge', input: empty, handler: async () => 'x'.repeat(1_200_000) });
    const queue = await createQueue({ driver: 'database', jobs: [big, huge], db });
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    await queue.dispatch(big, {}, { jobId: 'big-1' });
    await queue.dispatch(huge, {}, { jobId: 'huge-1' });
    await waitFor(
      async () => (await queue.status('big-1'))?.status === 'done' && (await queue.status('huge-1'))?.status === 'done',
    );
    expect((await queue.status('big-1'))?.result).toEqual({ rows: 'Việt'.repeat(75_000) });
    expect(await queue.status('huge-1')).not.toHaveProperty('result');
    await worker.stop();
    await queue.close();
  });

  it('Q-11 the column of the result exists on every dialect, and is empty before a job is done', async () => {
    const db = await open([]);
    const kysely = await rawKysely(db);
    expect(await kysely.selectFrom(JOBS_TABLE).select('result').limit(1).execute()).toEqual([]);
  });

  it.skipIf(dialect !== 'mysql')('Q-11 the column of the result is a medium text on MySQL', async () => {
    const db = await open([]);
    const rows = await db.orm.em
      .getConnection()
      .execute(
        "select data_type as t from information_schema.columns where table_name = 'bk_jobs' and column_name = 'result' and table_schema = database()",
      );
    expect(JSON.stringify(rows).toLowerCase()).toContain('mediumtext');
  });
});

describeDialects('Q-02 a large input on the database driver', ({ open, dialect }) => {
  it('Q-02 keeps an input of 200 KB, which MySQL could not hold in a TEXT column, and runs it', async () => {
    const db = await open([]);
    const seen: number[] = [];
    const job = defineJob<{ rows: string }>({
      name: 'big.input',
      input: z.object({ rows: z.string() }),
      handler: async (input) => void seen.push(input.rows.length),
    });
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    await queue.dispatch(job, { rows: 'Việt'.repeat(50_000) });
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual([200_000]);
    await worker.stop();
    await queue.close();
  });

  it.skipIf(dialect !== 'mysql')('Q-02 the column of the input is a medium text on MySQL', async () => {
    const db = await open([]);
    const rows = await db.orm.em
      .getConnection()
      .execute(
        "select data_type as t from information_schema.columns where table_name = 'bk_jobs' and column_name = 'input' and table_schema = database()",
      );
    expect(JSON.stringify(rows).toLowerCase()).toContain('mediumtext');
  });
});
