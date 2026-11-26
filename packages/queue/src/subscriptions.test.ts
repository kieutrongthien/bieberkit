/**
 * BieberKit
 *
 * @file        packages/queue/src/subscriptions.test.ts
 * @description Tests of contributed outbox-to-job mappings and duplicate subscription rejection through the real queue (BPL-04).
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

import { expect, it, onTestFinished } from 'vitest';
import { z } from 'zod';
import type { OutboxMessage } from '@bieberkit/data/orm';
import { createDatabase, rawKysely, runInTransaction } from '@bieberkit/data/orm';
import { applySubscriptions, createQueue, defineJob } from './index.ts';

async function setup() {
  const seen: number[] = [];
  const makeJob = (name: string) =>
    defineJob({
      name,
      input: z.object({ value: z.number() }),
      handler: async ({ value }) => {
        seen.push(value);
      },
    });
  const job = makeJob('subscription.receive');
  const other = makeJob('subscription.other');
  const queue = await createQueue({ driver: 'sync', jobs: [job, other] });
  const db = await createDatabase(
    {
      DB_CONNECTION: 'sqlite',
      DATABASE_URL: ':memory:',
      DATABASE_READ_URLS: [],
      DB_POOL_MAX: 1,
    },
    { entities: [] },
  );
  const sql = await rawKysely(db);
  const publish = (event: OutboxMessage) => sql.transaction().execute((trx) => queue.publisher.publish(event, trx));
  onTestFinished(async () => {
    await queue.close();
    await db.close();
  });
  return { queue, job, other, seen, publish, db, sql };
}

function message(name: string, payload: unknown): OutboxMessage {
  return {
    id: '0190f6b2-7c4e-7000-8000-0000000000a1',
    jobId: 'ob-' + name,
    name,
    version: 7,
    payload,
    createdAt: new Date('2026-11-25T00:00:00Z'),
  };
}

it('BPL-04 applySubscriptions subscribes each event to its job with payload and explicit mapping', async () => {
  const { queue, job, seen, publish } = await setup();
  applySubscriptions(queue, [
    { event: 'thing.done', job },
    { event: 'thing.mapped', job, map: (event) => ({ value: event.version }) },
  ]);
  await publish(message('thing.done', { value: 42 }));
  await publish(message('thing.mapped', { value: 999 }));
  await queue.settle();
  expect(seen).toEqual([42, 7]);
});

it('BPL-04 the sync driver runs a subscribed job after the transaction that published it, so the job may use the database', async () => {
  const { queue, db, sql } = await setup();
  const done: string[] = [];
  const writer = defineJob<{ value: number }>({
    name: 'subscription.writer',
    input: z.object({ value: z.number() }),
    // SQLite has one connection, held by the transaction of the publish: run inside it, this would wait for ever.
    handler: async () => {
      await runInTransaction(db, async (em) => {
        await em.getConnection().execute('select 1', [], 'all', em.getTransactionContext());
      });
      done.push('wrote');
    },
  });
  const own = await createQueue({ driver: 'sync', jobs: [writer] });
  onTestFinished(() => own.close());
  own.subscribe('thing.write', writer);
  await sql.transaction().execute((trx) => own.publisher.publish(message('thing.write', { value: 1 }), trx));
  expect(done).toEqual([]);
  await own.settle();
  expect(done).toEqual(['wrote']);
  // A queue with nothing deferred settles at once.
  await queue.settle();
});

it.each(['same job', 'another job'])('BPL-04 a second contribution for one event is refused (%s)', async (kind) => {
  const { queue, job, other } = await setup();
  expect(() =>
    applySubscriptions(queue, [
      { event: 'thing.done', job },
      { event: 'thing.done', job: kind === 'same job' ? job : other },
    ]),
  ).toThrowError(expect.objectContaining({ code: 'QUEUE_SUBSCRIPTION_DUPLICATE' }));
});

it('BPL-04 Queue.subscribe refuses to overwrite an existing event subscription', async () => {
  const { queue, job, other, seen, publish } = await setup();
  queue.subscribe('thing.done', job);
  expect(() => queue.subscribe('thing.done', other, () => ({ value: 999 }))).toThrowError(
    expect.objectContaining({ code: 'QUEUE_SUBSCRIPTION_DUPLICATE' }),
  );
  await publish(message('thing.done', { value: 42 }));
  await queue.settle();
  expect(seen).toEqual([42]);
});
