/**
 * BieberKit
 *
 * @file        packages/data/src/orm/state.dialects.test.ts
 * @description Tests of state machines: the initial state, no direct write, transitions with input, events and audit (MOD-06, MOD-07).
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
import { DataError } from '../errors.ts';
import { defineEntity, f } from '../schema/index.ts';
import { describeDialects } from '../testing/dialects.ts';
import { TENANT_A } from '../testing/crm.ts';
import { AuditLog, OutboxEntry } from './framework.ts';
import { compileEntities } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { bulkInsert, bulkUpdate } from './bulk.ts';
import { availableTransitions, transition, transitionOf } from './state.ts';
import { runAsTenant } from './tenant.ts';

const Order = defineEntity({
  name: 'orders.Order',
  table: 'orders_orders',
  tenant: true,
  fields: {
    id: f.id(),
    title: f.string({ max: 50 }),
    status: f.state({
      initial: 'draft',
      transitions: {
        submit: { from: ['draft'], to: 'submitted', permission: 'orders.order.submit' },
        approve: { from: ['submitted'], to: 'approved', permission: 'orders.order.approve' },
        reject: {
          from: ['submitted'],
          to: 'draft',
          permission: 'orders.order.approve',
          input: z.object({ reason: z.string().check(z.minLength(3)) }),
        },
      },
    }),
  },
});
const Note = defineEntity({
  name: 'orders.Note',
  table: 'orders_notes',
  fields: { id: f.id(), title: f.string({ max: 20 }) },
});

const schemas = compileEntities([Order, Note]);
const OrderSchema = schemaAt(schemas, 0);
const NoteSchema = schemaAt(schemas, 1);

function schemaAt(list: readonly OrmSchema[], index: number): OrmSchema {
  const schema = list[index];
  if (schema === undefined) throw new Error('The sample entities did not compile.');
  return schema;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

const inTenant = <T>(db: Database, fn: Parameters<typeof runInUnitOfWork<T>>[1]): Promise<T> =>
  runAsTenant(TENANT_A, () => runInUnitOfWork(db, fn));

async function seed(db: Database, data: Record<string, unknown> = {}): Promise<string> {
  return inTenant(db, async (em) => {
    const row = em.create(OrderSchema, { title: 'First', ...data });
    await em.flush();
    return String(row['id']);
  });
}

async function statusOf(db: Database, id: string): Promise<unknown> {
  const row = await runAsTenant(TENANT_A, () => db.fork().findOneOrFail(OrderSchema, { id }, { refresh: true }));
  return row['status'];
}

describeDialects('MOD-07 state machines', ({ openFramework }) => {
  it('DATA-26 a new row starts in the initial state', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    expect(await statusOf(db, await seed(db))).toBe('draft');
  });

  it('MOD-07 a new row in another state is refused', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const error = await failureOf(() => seed(db, { status: 'approved' }));
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: 'DATA_STATE_DIRECT_WRITE' });
  });

  it('MOD-07 a new row that names the initial state is accepted', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    expect(await statusOf(db, await seed(db, { status: 'draft' }))).toBe('draft');
  });

  it('MOD-07 a plain update of the state is refused, and the row keeps its state', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const error = await failureOf(() =>
      inTenant(db, async (em) => {
        const row = await em.findOneOrFail(OrderSchema, { id });
        row['status'] = 'approved';
        await em.flush();
      }),
    );
    expect(error).toMatchObject({ code: 'DATA_STATE_DIRECT_WRITE' });
    expect(await statusOf(db, id)).toBe('draft');
  });

  it('MOD-07 the other fields of a row still change with a plain update', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    await inTenant(db, async (em) => {
      const row = await em.findOneOrFail(OrderSchema, { id });
      row['title'] = 'Renamed';
      await em.flush();
    });
    expect(await statusOf(db, id)).toBe('draft');
  });

  it('MOD-07 a native update or insert that sets the state is refused', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const update = await failureOf(() =>
      inTenant(db, (em) => em.nativeUpdate(OrderSchema, { id }, { status: 'approved' })),
    );
    expect(update).toMatchObject({ code: 'DATA_STATE_DIRECT_WRITE' });
    const insert = await failureOf(() =>
      inTenant(db, (em) => em.insert(OrderSchema, { title: 'x', status: 'approved' })),
    );
    expect(insert).toMatchObject({ code: 'DATA_STATE_DIRECT_WRITE' });
  });

  it('MOD-07 the bulk helpers refuse the state too', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    expect(
      await failureOf(() => inTenant(db, (em) => bulkUpdate(em, OrderSchema, { id }, { status: 'approved' }))),
    ).toMatchObject({
      code: 'DATA_STATE_DIRECT_WRITE',
    });
    expect(
      await failureOf(() => inTenant(db, (em) => bulkInsert(em, OrderSchema, [{ title: 'x', status: 'approved' }]))),
    ).toMatchObject({ code: 'DATA_STATE_DIRECT_WRITE' });
  });

  it('MOD-06 a transition changes the state, adds an event and an audit entry, and the flush writes all three', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const result = await inTenant(db, async (em) => {
      const row = await em.findOneOrFail(OrderSchema, { id });
      const done = await transition(em, OrderSchema, row, 'submit');
      expect(row['status']).toBe('submitted');
      await em.flush();
      return done;
    });
    expect(result).toEqual({ name: 'submit', from: 'draft', to: 'submitted', event: 'orders.order.submit' });
    expect(await statusOf(db, id)).toBe('submitted');
    const [event] = await db.fork().find(OutboxEntry, {});
    expect(event).toMatchObject({
      event: 'orders.order.submit',
      entity: 'orders.Order',
      recordId: id,
      recordVersion: 2,
    });
    expect(JSON.parse(String(event?.payload))).toEqual({ id, transition: 'submit', from: 'draft', to: 'submitted' });
    const [entry] = await db.fork().find(AuditLog, {});
    expect(entry).toMatchObject({ action: 'orders.Order.submit', entity: 'orders.Order', recordId: id });
    expect(JSON.parse(String(entry?.data))).toEqual({ from: 'draft', to: 'submitted' });
  });

  it('MOD-06 a transition that is not flushed changes nothing in the database', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    await inTenant(db, async (em) => {
      const row = await em.findOneOrFail(OrderSchema, { id });
      await transition(em, OrderSchema, row, 'submit');
    });
    expect(await statusOf(db, id)).toBe('draft');
    expect(await db.fork().count(OutboxEntry)).toBe(0);
  });

  it('MOD-07 a record walks its declared path, and each step needs the state before it', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    for (const name of ['submit', 'approve']) {
      await inTenant(db, async (em) => {
        await transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), name);
        await em.flush();
      });
    }
    expect(await statusOf(db, id)).toBe('approved');
  });

  it('MOD-07 a transition from the wrong state is refused and changes nothing', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const error = await failureOf(() =>
      inTenant(db, async (em) => {
        const row = await em.findOneOrFail(OrderSchema, { id });
        await transition(em, OrderSchema, row, 'approve');
      }),
    );
    expect(error).toMatchObject({ code: 'DATA_TRANSITION_NOT_ALLOWED', status: 409 });
    expect(messageOf(error)).toContain('draft');
    expect(await statusOf(db, id)).toBe('draft');
  });

  it('MOD-06 an unknown transition, or an entity without a state, is refused', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const unknown = await failureOf(() =>
      inTenant(db, async (em) => transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), 'delete')),
    );
    expect(unknown).toMatchObject({ code: 'DATA_TRANSITION_UNKNOWN', status: 404 });
    const none = await failureOf(() =>
      inTenant(db, async (em) => {
        const note = em.create(NoteSchema, { title: 'n' });
        await transition(em, NoteSchema, note, 'submit');
      }),
    );
    expect(none).toMatchObject({ code: 'DATA_TRANSITION_UNKNOWN' });
  });

  it('MOD-06 a transition with an input checks it and carries it in the event and the audit entry', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    await inTenant(db, async (em) => {
      await transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), 'submit');
      await em.flush();
    });
    const bad = await failureOf(() =>
      inTenant(db, async (em) =>
        transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), 'reject', { reason: 'x' }),
      ),
    );
    expect(bad).toMatchObject({ code: 'DATA_TRANSITION_INPUT_INVALID', status: 422 });
    const missing = await failureOf(() =>
      inTenant(db, async (em) => transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), 'reject')),
    );
    expect(missing).toMatchObject({ code: 'DATA_TRANSITION_INPUT_INVALID' });
    await inTenant(db, async (em) => {
      await transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), 'reject', { reason: 'too dear' });
      await em.flush();
    });
    expect(await statusOf(db, id)).toBe('draft');
    const events = await db.fork().find(OutboxEntry, { event: 'orders.order.reject' });
    expect(JSON.parse(String(events[0]?.payload))).toMatchObject({ input: { reason: 'too dear' } });
  });

  it('MOD-06 input for a transition that takes none is refused', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const error = await failureOf(() =>
      inTenant(db, async (em) =>
        transition(em, OrderSchema, await em.findOneOrFail(OrderSchema, { id }), 'submit', { note: 'hi' }),
      ),
    );
    expect(error).toMatchObject({ code: 'DATA_TRANSITION_INPUT_INVALID' });
  });

  it('MOD-06 a stale row cannot make a transition: the second of two loses with 412', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const a = db.fork();
    const b = db.fork();
    await runAsTenant(TENANT_A, async () => {
      const first = await a.findOneOrFail(OrderSchema, { id });
      const second = await b.findOneOrFail(OrderSchema, { id });
      await transition(a, OrderSchema, first, 'submit');
      await a.flush();
      await transition(b, OrderSchema, second, 'submit');
      expect(await failureOf(() => b.flush())).toMatchObject({ code: 'DATA_VERSION_STALE', status: 412 });
    });
    expect(await db.fork().count(OutboxEntry)).toBe(1);
  });

  it('MOD-06 availableTransitions lists what the row can do now, with the permission', async () => {
    const db = await openFramework([OrderSchema, NoteSchema]);
    const id = await seed(db);
    const row = await runAsTenant(TENANT_A, () => db.fork().findOneOrFail(OrderSchema, { id }));
    expect(availableTransitions(OrderSchema, row)).toEqual([
      { name: 'submit', to: 'submitted', permission: 'orders.order.submit' },
    ]);
    row['status'] = 'submitted';
    expect(availableTransitions(OrderSchema, row).map((t) => t.name)).toEqual(['approve', 'reject']);
  });

  it('MOD-06 transitionOf gives the declaration, for the route that checks the permission first', () => {
    expect(transitionOf(OrderSchema, 'approve')).toMatchObject({
      from: ['submitted'],
      to: 'approved',
      permission: 'orders.order.approve',
    });
    expect(() => transitionOf(OrderSchema, 'nope')).toThrow(DataError);
  });
});
