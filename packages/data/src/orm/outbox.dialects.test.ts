/**
 * BieberKit
 *
 * @file        packages/data/src/orm/outbox.dialects.test.ts
 * @description Tests of the outbox dispatcher, the processed ids of subscribers and the lag of the outbox on every dialect (MOD-18, Q-01, ADR 0010).
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

import { sql } from 'kysely';
import type { EntityManager } from '@mikro-orm/core';
import { SqlEntityManager } from '@mikro-orm/sql';
import { requestContext } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { uuid7 } from '../keys/uuid7.ts';
import { describeDialects } from '../testing/dialects.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { OutboxEntry, OutboxProcessed } from './framework.ts';
import { kyselyOf } from './internals.ts';
import { createOutboxDispatcher, emitEvent, outboxLag, processOnce, purgeProcessed } from './outbox.ts';
import type { OutboxMessage, OutboxPublisher } from './outbox.ts';

const TENANT = '0191a2b3-0000-7000-8000-000000000001';
const USER = '0191a2b3-0000-7000-8000-000000000002';

async function emitMany(db: Database, count: number, name = 'test.event'): Promise<void> {
  await runInUnitOfWork(db, async (em) => {
    for (let n = 0; n < count; n += 1) emitEvent(em, { name, payload: { n } });
    await em.flush();
  });
}

function collector(): { messages: OutboxMessage[]; publisher: OutboxPublisher } {
  const messages: OutboxMessage[] = [];
  return {
    messages,
    publisher: {
      publish: async (message) => {
        messages.push(message);
      },
    },
  };
}

function sqlOf(em: EntityManager): SqlEntityManager {
  if (!(em instanceof SqlEntityManager)) throw new Error('This test needs a SQL database.');
  return em;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  const state: { resolve: () => void } = { resolve: () => undefined };
  const promise = new Promise<void>((resolve) => {
    state.resolve = resolve;
  });
  return { promise, resolve: () => state.resolve() };
}

async function until(condition: () => boolean): Promise<void> {
  for (let waited = 0; !condition() && waited < 5000; waited += 5)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

describeDialects('MOD-18 outbox dispatcher', ({ dialect, openFramework }) => {
  it('MOD-18 delivers the rows with their context and removes them', async () => {
    const db = await openFramework();
    const recordId = uuid7();
    await requestContext.run({ requestId: 'req-1', tenantId: TENANT, userId: USER }, () =>
      runInUnitOfWork(db, async (em) => {
        emitEvent(em, {
          name: 'crm.deal.won',
          version: 3,
          payload: { amount: 5 },
          record: { entity: 'crm.Deal', id: recordId, version: 9 },
          idempotencyKey: 'charge-1',
        });
        await em.flush();
      }),
    );
    const { messages, publisher } = collector();
    const result = await createOutboxDispatcher(db, { publisher }).dispatchOnce();
    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(messages).toHaveLength(1);
    const [message] = messages;
    expect(message).toMatchObject({
      name: 'crm.deal.won',
      version: 3,
      tenantId: TENANT,
      userId: USER,
      requestId: 'req-1',
      entity: 'crm.Deal',
      recordId,
      recordVersion: 9,
      idempotencyKey: 'charge-1',
      payload: { amount: 5 },
    });
    expect(message?.jobId).toBe(`ob-${message?.id}`);
    expect(message?.createdAt).toBeInstanceOf(Date);
    expect(await db.fork().count(OutboxEntry)).toBe(0);
  });

  it('OBS-02 keeps the trace of the code that emitted the event, and none when there was none', async () => {
    const db = await openFramework();
    const TRACE = '0af7651916cd43dd8448eb211c80319c';
    const SPAN = 'b7ad6b7169203331';
    await requestContext.run({ requestId: 'req-1', traceId: TRACE, spanId: SPAN }, () =>
      runInUnitOfWork(db, async (em) => {
        emitEvent(em, { name: 'traced.event', payload: {} });
        await em.flush();
      }),
    );
    await requestContext.run({ requestId: 'req-2' }, () =>
      runInUnitOfWork(db, async (em) => {
        emitEvent(em, { name: 'untraced.event', payload: {} });
        await em.flush();
      }),
    );
    const { messages, publisher } = collector();
    await createOutboxDispatcher(db, { publisher }).dispatchOnce();
    const byName = new Map(messages.map((message) => [message.name, message]));
    expect(byName.get('traced.event')?.traceparent).toBe(`00-${TRACE}-${SPAN}-01`);
    expect(byName.get('untraced.event')).not.toHaveProperty('traceparent');
  });

  it('MOD-18 gives the same jobId to a row that is delivered again', async () => {
    const db = await openFramework();
    await emitMany(db, 1);
    const seen: string[] = [];
    let fail = true;
    const dispatcher = createOutboxDispatcher(db, {
      publisher: {
        publish: async (message) => {
          seen.push(message.jobId);
          if (fail) throw new Error('queue down');
        },
      },
      now: () => 0,
    });
    await dispatcher.dispatchOnce();
    fail = false;
    const later = createOutboxDispatcher(db, {
      publisher: { publish: async (message) => void seen.push(message.jobId) },
      now: () => 10 * 3_600_000,
    });
    await later.dispatchOnce();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it('MOD-18 takes at most one batch of 100 by default, and at most the batch size it is given', async () => {
    const db = await openFramework();
    await emitMany(db, 250);
    const { messages, publisher } = collector();
    const dispatcher = createOutboxDispatcher(db, { publisher });
    expect((await dispatcher.dispatchOnce()).claimed).toBe(100);
    expect((await dispatcher.dispatchOnce()).claimed).toBe(100);
    expect((await dispatcher.dispatchOnce()).claimed).toBe(50);
    expect((await dispatcher.dispatchOnce()).claimed).toBe(0);
    expect(new Set(messages.map((m) => m.id)).size).toBe(250);
    await emitMany(db, 7);
    expect((await createOutboxDispatcher(db, { publisher, batchSize: 3 }).dispatchOnce()).claimed).toBe(3);
  });

  it('MOD-18 takes the oldest rows first', async () => {
    const db = await openFramework();
    for (const name of ['first', 'second', 'third']) await emitMany(db, 1, name);
    const { messages, publisher } = collector();
    await createOutboxDispatcher(db, { publisher }).dispatchOnce();
    expect(messages.map((m) => m.name)).toEqual(['first', 'second', 'third']);
  });

  it('MOD-18 a row that fails does not hold back the others, and waits longer each time', async () => {
    const db = await openFramework();
    for (const name of ['a', 'bad', 'c']) await emitMany(db, 1, name);
    let clock = 1_000_000;
    const delivered: string[] = [];
    const dispatcher = createOutboxDispatcher(db, {
      publisher: {
        publish: async (message) => {
          if (message.name === 'bad') throw new Error('boom');
          delivered.push(message.name);
        },
      },
      now: () => clock,
    });
    const first = await dispatcher.dispatchOnce();
    expect(first.failed).toBe(1);
    const second = await dispatcher.dispatchOnce();
    expect(second).toMatchObject({ claimed: 2, delivered: 2, failed: 0 });
    expect(delivered).toContain('a');
    expect(delivered).toContain('c');

    const [row] = await db.fork().find(OutboxEntry, {});
    expect(row).toMatchObject({ event: 'bad', attempts: 1, lastError: 'boom' });
    expect(Number(row?.availableAt)).toBe(clock + 1000);
    expect((await dispatcher.dispatchOnce()).claimed).toBe(0);
    clock += 1000;
    expect(await dispatcher.dispatchOnce()).toMatchObject({ claimed: 1, failed: 1 });
    const [again] = await db.fork().find(OutboxEntry, {}, { refresh: true });
    expect(again).toMatchObject({ attempts: 2 });
    expect(Number(again?.availableAt)).toBe(clock + 2000);
  });

  it('MOD-18 what the publisher wrote in the transaction is undone when a later row fails', async () => {
    const db = await openFramework();
    const kysely = await kyselyOf(db.orm.em);
    await sql`create table queued (job varchar(80) primary key)`.execute(kysely);
    for (const name of ['a', 'b', 'bad']) await emitMany(db, 1, name);
    const dispatcher = createOutboxDispatcher(db, {
      publisher: {
        publish: async (message, trx) => {
          await sql`insert into queued (job) values (${message.jobId})`.execute(trx);
          if (message.name === 'bad') throw new Error('boom');
        },
      },
    });
    expect(await dispatcher.dispatchOnce()).toMatchObject({ failed: 1 });
    const { rows } = await sql`select job from queued`.execute(kysely);
    expect(rows).toEqual([]);
    expect(await db.fork().count(OutboxEntry)).toBe(3);
  });

  it('MOD-18 two dispatchers at once never deliver a row twice', async () => {
    const db = await openFramework();
    await emitMany(db, 300);
    const seen: string[] = [];
    const publisher: OutboxPublisher = {
      publish: async (message) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        seen.push(message.id);
      },
    };
    const a = createOutboxDispatcher(db, { publisher });
    const b = createOutboxDispatcher(db, { publisher });
    for (let round = 0; round < 6; round += 1) await Promise.all([a.dispatchOnce(), b.dispatchOnce()]);
    expect(seen).toHaveLength(300);
    expect(new Set(seen).size).toBe(300);
    expect(await db.fork().count(OutboxEntry)).toBe(0);
  });

  it('MOD-18 start delivers new rows by itself, and wake does not wait for the next poll', async () => {
    const db = await openFramework();
    const delivered: string[] = [];
    const arrived = deferred();
    const dispatcher = createOutboxDispatcher(db, {
      pollMs: 60_000,
      publisher: {
        publish: async (message) => {
          delivered.push(message.name);
          arrived.resolve();
        },
      },
    });
    dispatcher.start();
    await emitMany(db, 1, 'woken');
    dispatcher.wake();
    await Promise.race([arrived.promise, new Promise((resolve) => setTimeout(resolve, 5000))]);
    await dispatcher.stop();
    expect(delivered).toEqual(['woken']);
  });

  it('MOD-18 stop waits for the batch in progress and nothing runs afterwards', async () => {
    const db = await openFramework();
    await emitMany(db, 2);
    const state = { inside: false };
    const gate = deferred();
    const dispatcher = createOutboxDispatcher(db, {
      pollMs: 10,
      publisher: {
        publish: async () => {
          state.inside = true;
          await gate.promise;
        },
      },
    });
    dispatcher.start();
    await until(() => state.inside);
    let stopped = false;
    const stopping = dispatcher.stop().then(() => void (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stopped).toBe(false);
    gate.resolve();
    await stopping;
    expect(stopped).toBe(true);
  });

  it.each([
    ['a batch size of zero', { batchSize: 0 }],
    ['a batch size above 1000', { batchSize: 1001 }],
    ['a poll time below 10 ms', { pollMs: 5 }],
  ])('MOD-18 refuses %s', async (_name, options) => {
    const db = await openFramework();
    expect(() => createOutboxDispatcher(db, { publisher: collector().publisher, ...options })).toThrow(
      expect.objectContaining({ code: 'DATA_OUTBOX_INVALID' }),
    );
  });

  it('MOD-18 outboxLag counts the rows, the age of the oldest and the rows that failed', async () => {
    const db = await openFramework();
    expect(await outboxLag(db)).toEqual({ pending: 0, oldestAgeMs: null, failing: 0 });
    await emitMany(db, 2);
    const lag = await outboxLag(db);
    expect(lag.pending).toBe(2);
    expect(lag.oldestAgeMs).toBeGreaterThanOrEqual(0);
    expect(lag.failing).toBe(0);
    await createOutboxDispatcher(db, {
      publisher: {
        publish: async () => {
          throw new Error('boom');
        },
      },
    }).dispatchOnce();
    expect((await outboxLag(db)).failing).toBe(1);
  });

  it('MOD-18 a subscriber handles an event once, however often it is delivered', async () => {
    const db = await openFramework();
    const event = uuid7();
    let runs = 0;
    const handler = async (): Promise<void> => {
      runs += 1;
    };
    expect(await processOnce(db, 'mail', event, handler)).toBe(true);
    expect(await processOnce(db, 'mail', event, handler)).toBe(false);
    expect(runs).toBe(1);
  });

  it('MOD-18 each subscriber has its own record of an event', async () => {
    const db = await openFramework();
    const event = uuid7();
    expect(await processOnce(db, 'mail', event, async () => undefined)).toBe(true);
    expect(await processOnce(db, 'search', event, async () => undefined)).toBe(true);
  });

  it('MOD-18 two deliveries at once run the handler once', async () => {
    const db = await openFramework();
    const event = uuid7();
    let runs = 0;
    const handler = async (): Promise<void> => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
    };
    const results = await Promise.all([
      processOnce(db, 'mail', event, handler),
      processOnce(db, 'mail', event, handler),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results).toHaveLength(2);
    expect(runs).toBe(1);
  });

  it('MOD-18 a handler that fails leaves no record, so the next delivery runs it again', async () => {
    const db = await openFramework();
    const event = uuid7();
    const error = await failureOf(() =>
      processOnce(db, 'mail', event, async () => {
        throw new Error('smtp down');
      }),
    );
    expect(error).toBeInstanceOf(Error);
    expect(await db.fork().count(OutboxProcessed)).toBe(0);
    expect(await processOnce(db, 'mail', event, async () => undefined)).toBe(true);
  });

  it('MOD-18 the writes of a handler commit with its record', async () => {
    const db = await openFramework();
    const kysely = await kyselyOf(db.orm.em);
    await sql`create table handled (n integer primary key)`.execute(kysely);
    const event = uuid7();
    await processOnce(db, 'mail', event, async (em) => {
      await sqlOf(em).execute('insert into handled (n) values (1)');
    });
    const { rows } = await sql`select n from handled`.execute(kysely);
    expect(rows).toHaveLength(1);
    await failureOf(() =>
      processOnce(db, 'mail', uuid7(), async (em) => {
        await sqlOf(em).execute('insert into handled (n) values (2)');
        throw new Error('late failure');
      }),
    );
    expect((await sql`select n from handled`.execute(kysely)).rows).toHaveLength(1);
  });

  it('MOD-18 purgeProcessed deletes the records older than seven days and keeps the rest', async () => {
    const db = await openFramework();
    await processOnce(db, 'mail', uuid7(), async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await processOnce(db, 'mail', uuid7(), async () => undefined);
    const times = (await db.fork().find(OutboxProcessed, {}))
      .map((row) => Number(row.processedAt))
      .toSorted((x, y) => x - y);
    const [first = 0, second = 0] = times;
    expect(second).toBeGreaterThan(first);
    expect(await purgeProcessed(db, { now: () => first + 7 * 86_400_000 - 1 })).toBe(0);
    expect(await purgeProcessed(db, { now: () => first + 7 * 86_400_000 + 1 })).toBe(1);
    expect(await db.fork().count(OutboxProcessed)).toBe(1);
  });

  it('MOD-18 purgeProcessed takes the age from its option', async () => {
    const db = await openFramework();
    await processOnce(db, 'mail', uuid7(), async () => undefined);
    const [row] = await db.fork().find(OutboxProcessed, {});
    const at = Number(row?.processedAt);
    expect(await purgeProcessed(db, { olderThanMs: 60_000, now: () => at + 59_999 })).toBe(0);
    expect(await purgeProcessed(db, { olderThanMs: 60_000, now: () => at + 60_001 })).toBe(1);
  });

  it.runIf(dialect !== 'sqlite')('MOD-18 the claim does not wait for rows that another dispatcher holds', async () => {
    const db = await openFramework();
    await emitMany(db, 4);
    const kysely = await kyselyOf(db.orm.em);
    const gate = deferred();
    const held = deferred();
    const holder = kysely.transaction().execute(async (trx) => {
      await trx
        .selectFrom('bk_outbox')
        .select('id')
        .where('available_at', '<=', Date.now())
        .orderBy('available_at')
        .orderBy('created_at')
        .orderBy('id')
        .limit(2)
        .forUpdate()
        .execute();
      held.resolve();
      await gate.promise;
    });
    await held.promise;
    const { messages, publisher } = collector();
    const result = await createOutboxDispatcher(db, { publisher, batchSize: 100 }).dispatchOnce();
    gate.resolve();
    await holder;
    expect(result.claimed).toBe(2);
    expect(messages).toHaveLength(2);
  });
});
