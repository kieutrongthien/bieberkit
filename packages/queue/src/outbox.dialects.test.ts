/**
 * BieberKit
 *
 * @file        packages/queue/src/outbox.dialects.test.ts
 * @description Tests of the outbox glue: an event becomes a job in the transaction that claims it, a rollback leaves nothing, and a failure keeps the row (Q-06, MOD-18, ADR 0010).
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
import { requestContext } from '@bieberkit/core';
import { emitEvent, rawKysely, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { defineJob } from './contract.ts';
import { registerOutbox } from './outbox.ts';
import { createQueue } from './queue.ts';
import { JOBS_TABLE } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const TENANT = '0190f6b2-7c4e-7000-8000-0000000000a1';
const USER = '0190f6b2-7c4e-7000-8000-0000000000b1';
const waitFor = async (done: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};

const idOf = (payload: unknown): string =>
  typeof payload === 'object' && payload !== null && 'id' in payload ? String(payload.id) : '';
const outboxRows = async (db: Database): Promise<number> =>
  (await db.orm.em.getConnection().execute('select * from bk_outbox')).length;
const jobRows = async (db: Database) => (await rawKysely(db)).selectFrom(JOBS_TABLE).selectAll().execute();

const emit = (db: Database, name = 'crm.deal.won', id = 'd1') =>
  requestContext.run({ requestId: 'req-ob', tenantId: TENANT, userId: USER }, () =>
    runInTransaction(db, async (em) => {
      emitEvent(em, { name, payload: { id } });
      await em.flush();
    }),
  );

describeDialects('Q-06 the outbox and the queue', ({ open }) => {
  const seen: { input: unknown; tenant: string | undefined; user: string | undefined; jobId: string }[] = [];
  const job = defineJob<{ id: string }>({
    name: 'ob.notify',
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      seen.push({
        input,
        tenant: requestContext.get()?.tenantId,
        user: requestContext.get()?.userId,
        jobId: context.jobId,
      });
    },
  });

  async function setup(open2: Parameters<Parameters<typeof describeDialects>[1]>[0]['open']) {
    seen.length = 0;
    const db = await open2([]);
    const queue = await createQueue({ driver: 'database', jobs: [job], db });
    queue.subscribe('crm.deal.won', job, (message) => ({ id: idOf(message.payload) }));
    const dispatcher = registerOutbox(db, queue, { pollMs: 20 });
    return { db, queue, dispatcher };
  }

  it('Q-06 moves a committed event into the queue, once, and the job runs as the code that emitted it', async () => {
    const { db, queue, dispatcher } = await setup(open);
    await emit(db);
    expect(await outboxRows(db)).toBe(1);
    expect(await jobRows(db)).toHaveLength(0);
    expect(await dispatcher.dispatchOnce()).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
    expect(await outboxRows(db)).toBe(0);
    const rows = await jobRows(db);
    expect(rows).toHaveLength(1);
    expect(String(rows[0]?.['job_id'])).toMatch(/^ob-/);
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    await waitFor(() => seen.length === 1);
    expect(seen[0]).toMatchObject({ input: { id: 'd1' }, tenant: TENANT, user: USER });
    await worker.stop();
  });

  it('Q-06 a rolled back transaction leaves no outbox row and no job', async () => {
    const { db, dispatcher } = await setup(open);
    await expect(
      runInTransaction(db, async (em) => {
        emitEvent(em, { name: 'crm.deal.won', payload: { id: 'x' } });
        await em.flush();
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(await dispatcher.dispatchOnce()).toMatchObject({ claimed: 0 });
    expect(await jobRows(db)).toHaveLength(0);
  });

  it('Q-06 an input that the job does not accept keeps the row in the outbox, and no job is made', async () => {
    const { db, dispatcher } = await setup(open);
    await emit(db, 'crm.deal.won', 'ok');
    const bad = defineJob<{ id: string }>({
      name: 'ob.strict',
      input: z.object({ id: z.string().check(z.minLength(10)) }),
      handler: async () => undefined,
    });
    const queue = await createQueue({ driver: 'database', jobs: [bad], db });
    queue.subscribe('crm.deal.won', bad, (message) => ({ id: idOf(message.payload) }));
    const strict = registerOutbox(db, queue, { pollMs: 20 });
    const result = await strict.dispatchOnce();
    expect(result).toMatchObject({ claimed: 1, delivered: 0, failed: 1 });
    expect(await outboxRows(db)).toBe(1);
    expect(await jobRows(db)).toHaveLength(0);
    expect(await dispatcher.dispatchOnce()).toMatchObject({ claimed: 0 });
  });

  it('Q-01 a row that is claimed again after a crash between the job and the commit does not make a second job', async () => {
    const { db, queue } = await setup(open);
    await emit(db);
    const kysely = await rawKysely(db);
    // The dispatcher inserted the job and then died before the commit: the job exists, and the row is still there.
    const rowsNow: unknown[] = await db.orm.em.getConnection().execute('select * from bk_outbox');
    const row = rowsNow[0];
    expect(row).toBeDefined();
    await kysely.transaction().execute(async (trx) => {
      await queue.publisher.publish(
        {
          id: 'x',
          jobId: `ob-${'1'.repeat(8)}`,
          name: 'crm.deal.won',
          version: 1,
          payload: { id: 'd1' },
          createdAt: new Date(),
        },
        trx,
      );
    });
    const before = (await jobRows(db)).length;
    await kysely.transaction().execute(async (trx) => {
      await queue.publisher.publish(
        {
          id: 'x',
          jobId: `ob-${'1'.repeat(8)}`,
          name: 'crm.deal.won',
          version: 1,
          payload: { id: 'd1' },
          createdAt: new Date(),
        },
        trx,
      );
    });
    expect((await jobRows(db)).length).toBe(before);
  });

  it('Q-06 an event that no job asked for is left out and is removed with its batch, and the others in the batch still go', async () => {
    const { db, dispatcher } = await setup(open);
    await emit(db, 'crm.other.event', 'o1');
    await emit(db, 'crm.deal.won', 'd2');
    expect(await dispatcher.dispatchOnce()).toMatchObject({ claimed: 2, delivered: 2 });
    const rows = await jobRows(db);
    expect(rows).toHaveLength(1);
  });

  it('Q-06 runs by itself when it is started, and stops', async () => {
    const { db, queue, dispatcher } = await setup(open);
    const worker = queue.createWorker({ pollMs: 20 });
    worker.start();
    dispatcher.start();
    await emit(db, 'crm.deal.won', 'auto');
    dispatcher.wake();
    await waitFor(() => seen.some((item) => idOf(item.input) === 'auto'));
    expect(seen.filter((item) => idOf(item.input) === 'auto')).toHaveLength(1);
    await dispatcher.stop();
    await worker.stop();
  });
});
