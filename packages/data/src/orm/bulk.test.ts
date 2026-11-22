/**
 * BieberKit
 *
 * @file        packages/data/src/orm/bulk.test.ts
 * @description Tests for the bulk write helpers that keep the shadow columns right, and the guard against writes that skip them (DATA-21).
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
import { crmSchemas, inTenant, seedUser, TENANT_A, TENANT_B } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import { bulkInsert, bulkUpdate } from './bulk.ts';
import { runInUnitOfWork } from './connect.ts';

async function failureOf(run: () => unknown): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

async function rows(
  db: { orm: { em: { getConnection(): { execute(sql: string): Promise<unknown> } } } },
  sql: string,
): Promise<Record<string, unknown>[]> {
  const result = await db.orm.em.getConnection().execute(sql);
  return Array.isArray(result) ? result : [];
}

describeDialects('DATA-21 bulk writes', ({ open }) => {
  async function setup() {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    return { schemas, db, owner };
  }

  it('bulkInsert gives every row an id, the tenant, the timestamps, a version and the shadow values', async () => {
    const { schemas, db, owner } = await setup();
    await inTenant(db, TENANT_A, (em) =>
      bulkInsert(em, schemas.Customer, [
        { code: 'C1', name: 'Đường Lê', email: 'A@B.CO', owner },
        { code: 'C2', name: 'Nguyễn Văn', owner },
      ]),
    );
    const stored = await rows(
      db,
      'select name_cmp as n, email_cmp as e, version as v from crm_customers order by code',
    );
    expect(stored.map((row) => [row['n'], row['e'], Number(row['v'])])).toEqual([
      ['duong le', 'a@b.co', 1],
      ['nguyen van', null, 1],
    ]);
    const read = await inTenant(db, TENANT_A, (em) => em.find(schemas.Customer, {}, { orderBy: { code: 'asc' } }));
    expect(read.map((row) => row['tenantId'])).toEqual([TENANT_A, TENANT_A]);
    expect(
      read.every(
        (row) => typeof row['id'] === 'string' && row['createdAt'] instanceof Date && row['updatedAt'] instanceof Date,
      ),
    ).toBe(true);
    expect(new Set(read.map((row) => row['id'])).size).toBe(2);
  });

  it('bulkInsert of a tenant entity needs a tenant, like every other write', async () => {
    const { schemas, db, owner } = await setup();
    const error = await failureOf(() =>
      runInUnitOfWork(db, (em) => bulkInsert(em, schemas.Customer, [{ code: 'C1', name: 'x', owner }])),
    );
    expect(error.code).toBe('DATA_TENANT_REQUIRED');
  });

  it('bulkInsert inserts a thousand rows in one call', async () => {
    const { schemas, db, owner } = await setup();
    const many = Array.from({ length: 1000 }, (_, i) => ({ code: `C${i}`, name: `Khách ${i}`, owner }));
    await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, many));
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, {}))).toBe(1000);
  });

  it('bulkUpdate returns the number of rows, refreshes the shadow column and updatedAt, and stays inside the tenant', async () => {
    const { schemas, db, owner } = await setup();
    await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, [{ code: 'C1', name: 'Cũ', owner }]));
    await inTenant(db, TENANT_B, (em) => bulkInsert(em, schemas.Customer, [{ code: 'C1', name: 'Cũ', owner }]));
    const before = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { code: 'C1' }));
    await new Promise((resolve) => setTimeout(resolve, 15));
    const changed = await inTenant(db, TENANT_A, (em) =>
      bulkUpdate(em, schemas.Customer, { code: 'C1' }, { name: 'Đường Mới' }),
    );
    expect(changed).toBe(1);
    const after = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { code: 'C1' }));
    expect(after['name']).toBe('Đường Mới');
    expect(
      after['updatedAt'] instanceof Date &&
        before['updatedAt'] instanceof Date &&
        after['updatedAt'] > before['updatedAt'],
    ).toBe(true);
    expect(
      (await rows(db, "select name_cmp as n from crm_customers where code = 'C1' order by created_at"))[0]?.['n'],
    ).toBe('duong moi');
    expect((await inTenant(db, TENANT_B, (em) => em.findOneOrFail(schemas.Customer, { code: 'C1' })))['name']).toBe(
      'Cũ',
    );
  });

  it('bulkUpdate that does not touch a compared field leaves the shadow column alone', async () => {
    const { schemas, db, owner } = await setup();
    await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, [{ code: 'C1', name: 'Đường Lê', owner }]));
    await inTenant(db, TENANT_A, (em) => bulkUpdate(em, schemas.Customer, { code: 'C1' }, { tier: 'vip' }));
    expect((await rows(db, 'select name_cmp as n from crm_customers'))[0]?.['n']).toBe('duong le');
  });
});

describeDialects('DATA-21 the guard against a write that skips the shadow column', ({ open }) => {
  async function setup() {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, [{ code: 'C1', name: 'Đường Lê', owner }]));
    return { schemas, db, owner };
  }

  it('a direct nativeUpdate of a compared field is DATA_SHADOW_STALE, and changes nothing', async () => {
    const { schemas, db } = await setup();
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => em.nativeUpdate(schemas.Customer, { code: 'C1' }, { name: 'Khác' })),
    );
    expect(error.code).toBe('DATA_SHADOW_STALE');
    expect(error.fix).toContain('bulkUpdate');
    expect((await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { code: 'C1' })))['name']).toBe(
      'Đường Lê',
    );
  });

  it('a nativeUpdate that gives the shadow value too is allowed, and so is one that touches no compared field', async () => {
    const { schemas, db } = await setup();
    await expect(
      inTenant(db, TENANT_A, (em) =>
        em.nativeUpdate(schemas.Customer, { code: 'C1' }, { name: 'Khác', nameCmp: 'khac' }),
      ),
    ).resolves.toBe(1);
    await expect(
      inTenant(db, TENANT_A, (em) => em.nativeUpdate(schemas.Customer, { code: 'C1' }, { tier: 'vip' })),
    ).resolves.toBe(1);
  });

  it('a direct insert without the shadow value is DATA_SHADOW_STALE', async () => {
    const { schemas, db, owner } = await setup();
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => em.insert(schemas.Customer, { code: 'C2', name: 'Mới', owner })),
    );
    expect(error.code).toBe('DATA_SHADOW_STALE');
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, { code: 'C2' }))).toBe(0);
  });

  it('an entity without a compared field is not guarded', async () => {
    const { schemas, db } = await setup();
    await expect(runInUnitOfWork(db, (em) => em.nativeUpdate(schemas.User, {}, { name: 'Anyone' }))).resolves.toBe(0);
  });
});
