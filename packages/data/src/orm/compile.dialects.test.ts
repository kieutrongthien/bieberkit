/**
 * BieberKit
 *
 * @file        packages/data/src/orm/compile.dialects.test.ts
 * @description Runs the compiled entities on SQLite, PostgreSQL and MySQL: columns, round trips, shadow columns, soft delete and the tenant foreign key (DATA-04, DATA-15, DATA-16, DATA-18, DATA-20, DATA-21, DATA-26, MOD-08).
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

import { expect, it } from 'vitest';
import { requestContext } from '@bieberkit/core';
import type { Dialect } from '@bieberkit/core';
import { defineEntity, f } from '../schema/index.ts';
import { crmSchemas, inTenant, seedCustomer, seedUser, TENANT_A, TENANT_B } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import { fold } from '../text/fold.ts';
import { compileEntities } from './compile.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { restore, softDelete } from './softdelete.ts';

async function rows(db: Database, sql: string): Promise<Record<string, unknown>[]> {
  const result: unknown = await db.orm.em.getConnection().execute(sql);
  return Array.isArray(result) ? result : [];
}

async function columnsOf(db: Database, dialect: Dialect, table: string): Promise<string[]> {
  const sql =
    dialect === 'postgres'
      ? `select column_name as c from information_schema.columns where table_name = '${table}'`
      : dialect === 'mysql'
        ? `select column_name as c from information_schema.columns where table_name = '${table}' and table_schema = database()`
        : `select name as c from pragma_table_info('${table}')`;
  return (await rows(db, sql)).map((row) => String(row['c'] ?? row['C']));
}

const DUPLICATE = /unique|duplicate|constraint/i;
const FOREIGN_KEY = /foreign key|constraint/i;

describeDialects('DATA-18 standard columns and DATA-26 constraints', ({ dialect, open }) => {
  it('DATA-18 a tenant entity with soft delete has the nine standard columns, and a global one has six', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const customer = await columnsOf(db, dialect, 'crm_customers');
    for (const column of [
      'id',
      'tenant_id',
      'version',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'deleted_at',
      'deleted_token',
    ])
      expect(customer).toContain(column);
    const user = await columnsOf(db, dialect, 'users');
    expect(user.toSorted()).toEqual(['created_at', 'created_by', 'id', 'name', 'updated_at', 'updated_by', 'version']);
  });

  it('DATA-04 and the other kinds: the columns of money, decimal and the shadow column have the names of the mapping', async () => {
    const db = await open(crmSchemas().all);
    const customer = await columnsOf(db, dialect, 'crm_customers');
    for (const column of [
      'name_cmp',
      'email_cmp',
      'credit_scaled',
      'balance_minor',
      'balance_currency',
      'owner_id',
      'number',
      'status',
    ])
      expect(customer).toContain(column);
    expect(customer).not.toContain('score');
  });
});

describeDialects('the entities round trip', ({ open }) => {
  it('DATA-22 and DATA-04: money, decimal, dates, booleans and defaults come back as they went in', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const lastSeen = new Date('2026-11-22T10:00:00.000Z');
    const id = await seedCustomer(db, schemas, TENANT_A, owner, {
      creditScaled: 123045n,
      balanceMinor: 9007199254740991n,
      balanceCurrency: 'VND',
      since: '2026-02-28',
      lastSeen,
      note: 'ghi chú',
    });
    const row = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id }));
    expect(row['creditScaled']).toBe(123045n);
    expect(row['balanceMinor']).toBe(9007199254740991n);
    expect(row['balanceCurrency']).toBe('VND');
    expect(row['since']).toBe('2026-02-28');
    expect(row['lastSeen']).toEqual(lastSeen);
    expect(row['note']).toBe('ghi chú');
    expect(row['tier']).toBe('standard');
    expect(row['active']).toBe(true);
    expect(row['visits']).toBe(0);
    expect(row['status']).toBe('new');
    expect(row['version']).toBe(1);
    expect(row['tenantId']).toBe(TENANT_A);
    expect(row['deletedToken']).toBe('');
    expect(row['deletedAt']).toBeNull();
  });

  it('DATA-18 createdBy and updatedBy come from the user of the request, and the timestamps move on update', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const userId = '0190f6b2-7c4e-7000-8000-0123456789ab';
    const id = await requestContext.run({ requestId: 'r1', userId }, () => seedCustomer(db, schemas, TENANT_A, owner));
    const before = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id }));
    expect(before['createdBy']).toBe(userId);
    expect(before['updatedBy']).toBe(userId);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await requestContext.run({ requestId: 'r2', userId: '0190f6b2-7c4e-7000-8000-0123456789ac' }, () =>
      inTenant(db, TENANT_A, async (em) => {
        (await em.findOneOrFail(schemas.Customer, { id }))['name'] = 'Tên mới';
        await em.flush();
      }),
    );
    const after = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id }));
    expect(after['createdBy']).toBe(userId);
    expect(after['updatedBy']).toBe('0190f6b2-7c4e-7000-8000-0123456789ac');
    expect(after['createdAt']).toEqual(before['createdAt']);
    expect(
      after['updatedAt'] instanceof Date &&
        before['updatedAt'] instanceof Date &&
        after['updatedAt'] > before['updatedAt'],
    ).toBe(true);
  });

  it('MOD-08 a stored computed field is calculated on create and again on update', async () => {
    const Invoice = defineEntity({
      name: 'sales.Invoice',
      table: 'sales_invoices',
      fields: {
        id: f.id(),
        qty: f.int(),
        price: f.int(),
        total: f.int().computed((row) => Number(row['qty']) * Number(row['price']), { stored: true }),
      },
    });
    const [schema] = compileEntities([Invoice]);
    if (schema === undefined) throw new Error('No schema.');
    const db = await open([schema]);
    const id = await runInUnitOfWork(db, async (em) => {
      const invoice = em.create(schema, { qty: 3, price: 5 });
      await em.flush();
      return String(invoice['id']);
    });
    expect((await runInUnitOfWork(db, (em) => em.findOneOrFail(schema, { id })))['total']).toBe(15);
    await runInUnitOfWork(db, async (em) => {
      (await em.findOneOrFail(schema, { id }))['qty'] = 10;
      await em.flush();
    });
    expect((await runInUnitOfWork(db, (em) => em.findOneOrFail(schema, { id })))['total']).toBe(50);
  });

  it('the server numbers a sequence, and a number that is given is unique per tenant', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    await seedCustomer(db, schemas, TENANT_A, owner);
    await seedCustomer(db, schemas, TENANT_A, owner);
    const numbers = await rows(db, 'select number from crm_customers order by number');
    expect(numbers.map((row) => row['number'])).toEqual(['CUS-00001', 'CUS-00002']);
    await seedCustomer(db, schemas, TENANT_A, owner, { number: 'CUS-00009' });
    await expect(seedCustomer(db, schemas, TENANT_A, owner, { number: 'CUS-00009' })).rejects.toThrow(DUPLICATE);
    await expect(seedCustomer(db, schemas, TENANT_B, owner, { number: 'CUS-00009' })).resolves.toBeTypeOf('string');
  });
});

describeDialects('DATA-21 shadow columns', ({ open }) => {
  it('the shadow column holds the folded text on create, and the new folded text after an update', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const id = await seedCustomer(db, schemas, TENANT_A, owner, { name: 'Đường Lê', email: 'A@B.CO' });
    const first = await rows(db, `select name_cmp as n, email_cmp as e from crm_customers`);
    expect([first[0]?.['n'], first[0]?.['e']]).toEqual(['duong le', 'a@b.co']);
    await inTenant(db, TENANT_A, async (em) => {
      (await em.findOneOrFail(schemas.Customer, { id }))['name'] = 'ĐƯỜNG Lê Mới';
      await em.flush();
    });
    expect((await rows(db, `select name_cmp as n from crm_customers`))[0]?.['n']).toBe('duong le moi');
    const found = await inTenant(db, TENANT_A, (em) =>
      em.find(schemas.Customer, { nameCmp: fold('ci_ai', 'duong le moi') }),
    );
    expect(found).toHaveLength(1);
  });

  it('an email that differs only in case is a duplicate in the same tenant, and is allowed in another', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    await seedCustomer(db, schemas, TENANT_A, owner, { email: 'a@b.co' });
    await expect(seedCustomer(db, schemas, TENANT_A, owner, { email: 'A@B.CO' })).rejects.toThrow(DUPLICATE);
    await expect(seedCustomer(db, schemas, TENANT_B, owner, { email: 'A@B.CO' })).resolves.toBeTypeOf('string');
  });

  it('the shadow column is not part of what a row shows when it is turned into JSON', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const id = await seedCustomer(db, schemas, TENANT_A, owner);
    const row = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id }));
    expect(JSON.stringify(row)).not.toContain('nameCmp');
  });
});

describeDialects('DATA-15 and DATA-16 unique codes, soft delete', ({ open }) => {
  it('DATA-15 a code is unique inside a tenant, and two tenants may use the same one', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    await seedCustomer(db, schemas, TENANT_A, owner, { code: 'DUP' });
    await expect(seedCustomer(db, schemas, TENANT_A, owner, { code: 'DUP' })).rejects.toThrow(DUPLICATE);
    await expect(seedCustomer(db, schemas, TENANT_B, owner, { code: 'DUP' })).resolves.toBeTypeOf('string');
  });

  it('DATA-16 a deleted row hides, frees its code, and shows again for a view that asks', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const id = await seedCustomer(db, schemas, TENANT_A, owner, { code: 'GONE' });
    await inTenant(db, TENANT_A, async (em) => {
      softDelete(em, await em.findOneOrFail(schemas.Customer, { id }));
      await em.flush();
    });
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, {}))).toBe(0);
    expect(
      await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, {}, { filters: { softDelete: false } })),
    ).toBe(1);
    const deleted = await inTenant(db, TENANT_A, (em) =>
      em.findOneOrFail(schemas.Customer, { id }, { filters: { softDelete: false } }),
    );
    expect(deleted['deletedToken']).toBe(id);
    expect(deleted['deletedAt']).toBeInstanceOf(Date);
    await expect(seedCustomer(db, schemas, TENANT_A, owner, { code: 'GONE' })).resolves.toBeTypeOf('string');
  });

  it('DATA-16 a row cannot be restored while a live row holds its code, and can be when the code is free', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const id = await seedCustomer(db, schemas, TENANT_A, owner, { code: 'BACK' });
    const drop = (): Promise<void> =>
      inTenant(db, TENANT_A, async (em) => {
        softDelete(em, await em.findOneOrFail(schemas.Customer, { id }));
        await em.flush();
      });
    const bring = (): Promise<void> =>
      inTenant(db, TENANT_A, async (em) => {
        restore(em, await em.findOneOrFail(schemas.Customer, { id }, { filters: { softDelete: false } }));
        await em.flush();
      });
    await drop();
    const other = await seedCustomer(db, schemas, TENANT_A, owner, { code: 'BACK' });
    await expect(bring()).rejects.toThrow(DUPLICATE);
    await inTenant(db, TENANT_A, async (em) => {
      softDelete(em, await em.findOneOrFail(schemas.Customer, { id: other }));
      await em.flush();
    });
    await expect(bring()).resolves.toBeUndefined();
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, { code: 'BACK' }))).toBe(1);
  });

  it('DATA-16 a global entity without soft delete has no delete columns to restore', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const user = await runInUnitOfWork(db, (em) => em.findOneOrFail(schemas.User, { id: owner }));
    expect(() => softDelete(db.fork(), user)).toThrowError(expect.objectContaining({ code: 'DATA_ENTITY_INVALID' }));
  });
});

describeDialects('DATA-20 the tenant foreign key backs the application check', ({ open }) => {
  it('a contact of the same tenant as its customer is stored', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const customer = await seedCustomer(db, schemas, TENANT_A, owner);
    await inTenant(db, TENANT_A, async (em) => {
      em.create(schemas.Contact, { fullName: 'Lê Văn', customer: em.getReference(schemas.Customer, customer) });
      await em.flush();
    });
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Contact, {}))).toBe(1);
  });

  it('with the application check out of the way, the database refuses a contact of another tenant', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const customer = await seedCustomer(db, schemas, TENANT_A, owner);
    await expect(
      db.asSystem('test: prove the foreign key', () =>
        runInUnitOfWork(db, async (em) => {
          em.create(schemas.Contact, {
            tenantId: TENANT_B,
            fullName: 'x',
            customer: em.getReference(schemas.Customer, customer),
          });
          await em.flush();
        }),
      ),
    ).rejects.toThrow(FOREIGN_KEY);
  });
});
