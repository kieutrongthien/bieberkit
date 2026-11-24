/**
 * BieberKit
 *
 * @file        packages/data/src/orm/sequence.dialects.test.ts
 * @description Tests of sequences on every dialect: numbers per tenant, no gaps with concurrent writers, and numbers given back by a rolled back save (MOD-12).
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
import { expect, it } from 'vitest';
import { uuid7 } from '../keys/uuid7.ts';
import { defineEntity, f } from '../schema/index.ts';
import { describeDialects } from '../testing/dialects.ts';
import { TENANT_A, TENANT_B } from '../testing/crm.ts';
import { compileEntities } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { kyselyOf } from './internals.ts';
import { nextSequence } from './sequence.ts';
import { runAsTenant } from './tenant.ts';

const Invoice = defineEntity({
  name: 'billing.Invoice',
  table: 'billing_invoices',
  tenant: true,
  fields: {
    id: f.id(),
    code: f.string({ max: 20 }).unique(),
    number: f.sequence({ pattern: 'INV-{yyyy}-{seq:5}', resetEvery: 'year' }),
  },
});
const Ticket = defineEntity({
  name: 'billing.Ticket',
  table: 'billing_tickets',
  fields: { id: f.id(), number: f.sequence({ pattern: 'T{seq:3}' }) },
});

const schemas = compileEntities([Invoice, Ticket]);
const InvoiceSchema = schemaAt(schemas, 0);
const TicketSchema = schemaAt(schemas, 1);

const YEAR = String(new Date().getUTCFullYear());

function schemaAt(list: readonly OrmSchema[], index: number): OrmSchema {
  const schema = list[index];
  if (schema === undefined) throw new Error('The sample entities did not compile.');
  return schema;
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

async function create(db: Database, tenant: string, code: string, data: Record<string, unknown> = {}): Promise<string> {
  return runAsTenant(tenant, () =>
    runInUnitOfWork(db, async (em) => {
      const row = em.create(InvoiceSchema, { code, ...data });
      await em.flush();
      return String(row['number']);
    }),
  );
}

describeDialects('MOD-12 sequences', ({ openFramework }) => {
  it('MOD-12 numbers follow the pattern and count up from one', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    expect(await create(db, TENANT_A, 'a1')).toBe(`INV-${YEAR}-00001`);
    expect(await create(db, TENANT_A, 'a2')).toBe(`INV-${YEAR}-00002`);
    expect(await create(db, TENANT_A, 'a3')).toBe(`INV-${YEAR}-00003`);
  });

  it('MOD-12 the number is saved with the row', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    await create(db, TENANT_A, 'a1');
    const [row] = await runAsTenant(TENANT_A, () => db.fork().find(InvoiceSchema, {}));
    expect(row?.['number']).toBe(`INV-${YEAR}-00001`);
  });

  it('MOD-12 each tenant has its own counter', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    await create(db, TENANT_A, 'a1');
    await create(db, TENANT_A, 'a2');
    expect(await create(db, TENANT_B, 'b1')).toBe(`INV-${YEAR}-00001`);
    expect(await create(db, TENANT_A, 'a3')).toBe(`INV-${YEAR}-00003`);
  });

  it('MOD-12 an entity without a tenant has one counter for everyone', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    const make = (): Promise<string> =>
      runInUnitOfWork(db, async (em) => {
        const row = em.create(TicketSchema, {});
        await em.flush();
        return String(row['number']);
      });
    expect([await make(), await make()]).toEqual(['T001', 'T002']);
  });

  it('MOD-12 a number that the caller gives is kept and does not move the counter', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    expect(await create(db, TENANT_A, 'a1', { number: 'IMPORTED-7' })).toBe('IMPORTED-7');
    expect(await create(db, TENANT_A, 'a2')).toBe(`INV-${YEAR}-00001`);
  });

  it('MOD-12 several rows in one flush get several numbers', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    const numbers = await runAsTenant(TENANT_A, () =>
      runInUnitOfWork(db, async (em) => {
        const rows = ['x1', 'x2', 'x3'].map((code) => em.create(InvoiceSchema, { code }));
        await em.flush();
        return rows.map((row) => String(row['number'])).toSorted();
      }),
    );
    expect(numbers).toEqual([`INV-${YEAR}-00001`, `INV-${YEAR}-00002`, `INV-${YEAR}-00003`]);
  });

  it('MOD-12 twenty writers at once get twenty different numbers and no gap', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    const numbers = await Promise.all(Array.from({ length: 20 }, (_, n) => create(db, TENANT_A, `c${n}`)));
    const wanted = Array.from({ length: 20 }, (_, n) => `INV-${YEAR}-${String(n + 1).padStart(5, '0')}`);
    expect(numbers.toSorted()).toEqual(wanted);
  });

  it('MOD-12 a save that is rolled back gives its number back', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    await create(db, TENANT_A, 'dup');
    const error = await failureOf(() => create(db, TENANT_A, 'dup'));
    expect(error).toBeDefined();
    expect(await create(db, TENANT_A, 'next')).toBe(`INV-${YEAR}-00002`);
  });

  it('MOD-12 nextSequence counts per name and starts a new period at one', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    const take = (key: { entity: string; field: string }, now: string): Promise<number> =>
      runInUnitOfWork(db, (em) =>
        em.transactional((tx) =>
          nextSequence(tx, { ...key, tenantId: TENANT_A }, { resetEvery: 'year', now: new Date(now) }),
        ),
      );
    const key = { entity: 'x.Doc', field: 'number' };
    expect(await take(key, '2026-06-01T00:00:00Z')).toBe(1);
    expect(await take(key, '2026-12-31T23:59:59Z')).toBe(2);
    expect(await take(key, '2027-01-01T00:00:00Z')).toBe(1);
    expect(await take(key, '2027-02-01T00:00:00Z')).toBe(2);
    expect(await take({ entity: 'x.Doc', field: 'other' }, '2027-02-01T00:00:00Z')).toBe(1);
  });

  it('MOD-12 the month period restarts every month', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    const take = (now: string): Promise<number> =>
      runInUnitOfWork(db, (em) =>
        em.transactional((tx) =>
          nextSequence(
            tx,
            { entity: 'x.Doc', field: 'number', tenantId: TENANT_A },
            { resetEvery: 'month', now: new Date(now) },
          ),
        ),
      );
    expect([
      await take('2026-01-05T00:00:00Z'),
      await take('2026-01-06T00:00:00Z'),
      await take('2026-02-01T00:00:00Z'),
    ]).toEqual([1, 2, 1]);
  });

  it('MOD-12 one counter row is kept for each tenant, name and period', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    await create(db, TENANT_A, 'a1');
    await create(db, TENANT_A, 'a2');
    await create(db, TENANT_B, 'b1');
    const { rows } = await sql<{
      value: string | number;
      period: string;
    }>`select value, period from bk_sequences order by value desc`.execute(await kyselyOf(db.orm.em));
    expect(rows.map((row) => [Number(row.value), row.period])).toEqual([
      [2, YEAR],
      [1, YEAR],
    ]);
  });

  it('MOD-12 a tenant that is not a UUID is refused', async () => {
    const db = await openFramework([InvoiceSchema, TicketSchema]);
    const error = await failureOf(() =>
      runInUnitOfWork(db, (em) =>
        em.transactional((tx) => nextSequence(tx, { entity: 'a.B', field: 'n', tenantId: 'nope' })),
      ),
    );
    expect(error).toMatchObject({ code: 'DATA_UUID_INVALID' });
    expect(uuid7()).toBeDefined();
  });
});
