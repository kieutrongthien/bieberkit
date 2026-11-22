/**
 * BieberKit
 *
 * @file        packages/data/src/orm/mapper.test.ts
 * @description Tests for the mappers between the API shape of an entity and its ORM properties, and for batched relations (MOD-08, MOD-11, DATA-22, PERF-04).
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

import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { toZodMini } from '../schema/zod-mini.ts';
import { crmSchemas, inTenant, seedCustomer, seedUser, TENANT_A } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import { bulkInsert } from './bulk.ts';
import { listPage } from './query.ts';
import { toApiRow, toOrmData } from './mapper.ts';
import { Customer } from '../testing/sample-entities.ts';

const OWNER = '0190f6b2-7c4e-7000-8000-0123456789ab';

function failure(run: () => unknown): DataError {
  try {
    run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

const { Customer: schema } = crmSchemas();

describe('toOrmData create', () => {
  it('turns money, decimals, a relation and an instant into ORM properties', () => {
    const data = toOrmData(
      schema,
      {
        code: 'C1',
        name: 'Lê',
        ownerId: OWNER,
        balance: { amount: '12500' },
        credit: '12345.60',
        lastSeen: '2026-11-22T10:00:00.123Z',
        since: '2026-02-28',
        active: false,
      },
      'create',
    );
    expect(data).toEqual({
      code: 'C1',
      name: 'Lê',
      owner: OWNER,
      balanceMinor: 12500n,
      balanceCurrency: 'VND',
      creditScaled: 1234560n,
      lastSeen: new Date('2026-11-22T10:00:00.123Z'),
      since: '2026-02-28',
      active: false,
    });
  });

  it('keeps null as null, and leaves out what was not sent', () => {
    expect(
      toOrmData(schema, { code: 'C1', name: 'x', ownerId: OWNER, email: null, balance: null, credit: null }, 'create'),
    ).toEqual({
      code: 'C1',
      name: 'x',
      owner: OWNER,
      email: null,
      balanceMinor: null,
      creditScaled: null,
    });
  });

  it('rounds an amount to the minor unit once, and refuses one outside the safe range', () => {
    expect(toOrmData(schema, { balance: { amount: '1000.5' } }, 'update')).toEqual({
      balanceMinor: 1001n,
      balanceCurrency: 'VND',
    });
    expect(failure(() => toOrmData(schema, { balance: { amount: '9'.repeat(16) } }, 'update')).code).toBe(
      'DATA_MONEY_RANGE',
    );
  });

  it('refuses a key that is not a field of the entity, or that the server writes', () => {
    for (const input of [
      { nope: 1 },
      { id: OWNER },
      { version: 1 },
      { number: 'x' },
      { status: 'new' },
      { score: 1 },
    ]) {
      expect(failure(() => toOrmData(schema, input, 'create')).code).toBe('DATA_INPUT_INVALID');
    }
  });
});

describe('toOrmData update', () => {
  it('gives only the properties that were sent', () => {
    expect(toOrmData(schema, { name: 'New' }, 'update')).toEqual({ name: 'New' });
    expect(toOrmData(schema, { email: null }, 'update')).toEqual({ email: null });
  });

  it('maps the same fields as create', () => {
    expect(toOrmData(schema, { ownerId: OWNER, credit: '1.5', balance: null }, 'update')).toEqual({
      owner: OWNER,
      creditScaled: 150n,
      balanceMinor: null,
    });
  });
});

describeDialects('toApiRow', ({ open }) => {
  async function stored() {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const body = toOrmData(
      schemas.Customer,
      {
        code: 'C1',
        name: 'Đường Lê',
        ownerId: owner,
        balance: { amount: '12500' },
        credit: '12345.60',
        lastSeen: '2026-11-22T10:00:00.123Z',
        since: '2026-02-28',
        visits: 3,
        email: 'a@b.co',
      },
      'create',
    );
    const id = await seedCustomer(db, schemas, TENANT_A, owner, body);
    return { db, schemas, owner, id };
  }

  it('turns a stored row into the read shape of the API, which the read schema accepts', async () => {
    const { db, schemas, owner, id } = await stored();
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer));
    const api = toApiRow(schemas.Customer, page.rows[0] ?? {});
    expect(api).toMatchObject({
      id,
      version: 1,
      code: 'C1',
      name: 'Đường Lê',
      email: 'a@b.co',
      tier: 'standard',
      credit: '12345.60',
      balance: { amount: '12500', currency: 'VND' },
      note: null,
      active: true,
      since: '2026-02-28',
      lastSeen: '2026-11-22T10:00:00.123Z',
      visits: 3,
      status: 'new',
      number: 'CUS-00001',
      ownerId: owner,
      deletedAt: null,
      createdBy: null,
    });
    expect(toZodMini(Customer, 'read').safeParse({ ...api, number: 'CUS-00001' }).success).toBe(true);
  });

  it('never shows the tenant, the delete token or a shadow column', async () => {
    const { db, schemas } = await stored();
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer));
    const keys = Object.keys(toApiRow(schemas.Customer, page.rows[0] ?? {}));
    for (const hidden of [
      'tenantId',
      'deletedToken',
      'nameCmp',
      'emailCmp',
      'creditScaled',
      'balanceMinor',
      'balanceCurrency',
      'owner',
    ])
      expect(keys).not.toContain(hidden);
  });

  it('calculates a computed field that is not stored when it reads (MOD-08)', async () => {
    const { db, schemas } = await stored();
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer));
    expect(toApiRow(schemas.Customer, page.rows[0] ?? {})['score']).toBe(6);
  });

  it('turns an empty money, decimal and instant into null, and reads a relation that was populated', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, [{ code: 'C1', name: 'x', owner }]));
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { populate: ['owner'] }));
    const api = toApiRow(schemas.Customer, page.rows[0] ?? {});
    expect(api).toMatchObject({ balance: null, credit: null, lastSeen: null, since: null, ownerId: owner });
  });
});

describeDialects('PERF-04 relations load in one batched query each', ({ open }) => {
  it('30 contacts of 10 customers are read with two queries', async () => {
    const queries: string[] = [];
    const schemas = crmSchemas();
    const db = await open(schemas.all, { queryLog: (sql) => queries.push(sql) });
    const owner = await seedUser(db, schemas);
    await inTenant(db, TENANT_A, (em) =>
      bulkInsert(
        em,
        schemas.Customer,
        Array.from({ length: 10 }, (_, n) => ({ code: `C${n}`, name: `K${n}`, owner })),
      ),
    );
    const customers = (
      await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { sort: [{ field: 'code' }] }))
    ).rows;
    await inTenant(db, TENANT_A, (em) =>
      bulkInsert(
        em,
        schemas.Contact,
        Array.from({ length: 30 }, (_, n) => ({ fullName: `Liên hệ ${n}`, customer: customers[n % 10]?.['id'] })),
      ),
    );
    queries.length = 0;
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Contact, { populate: ['customer'], limit: 100 }),
    );
    expect(page.rows).toHaveLength(30);
    expect(queries.filter((sql) => /^\s*select/i.test(sql))).toHaveLength(2);
    expect(page.rows.every((row) => typeof Object(row['customer'])['code'] === 'string')).toBe(true);
  });

  it('a relation that is not part of the entity is DATA_QUERY_INVALID', async () => {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    await expect(
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Contact, { populate: ['nope'] })),
    ).rejects.toMatchObject({ code: 'DATA_QUERY_INVALID' });
  });
});
