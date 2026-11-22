/**
 * BieberKit
 *
 * @file        packages/data/src/orm/scope.dialects.test.ts
 * @description Tests of the trusted scope of a read: the rows that code allows, applied in SQL next to the tenant filter and the filter of the caller (AUTHZ-02, ADR 0013).
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
import { DataError } from '../errors.ts';
import { crmSchemas, inTenant, seedCustomer, seedUser, TENANT_A, TENANT_B } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { DialectContext } from '../testing/dialects.ts';
import { aggregate } from './aggregate.ts';
import { listPage } from './query.ts';
import { findScoped } from './scoped.ts';

async function failureOf(run: () => Promise<unknown>): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

/** Tenant A: six customers, visits 0 to 5, tiers in turn, owners in turn. Tenant B: one customer of the first owner. */
async function setup(open: DialectContext['open']) {
  const schemas = crmSchemas();
  const db = await open(schemas.all);
  const owners = [await seedUser(db, schemas, 'One'), await seedUser(db, schemas, 'Two')];
  const tiers = ['standard', 'gold', 'vip'] as const;
  const ids: string[] = [];
  for (let n = 0; n < 6; n += 1) {
    ids.push(
      await seedCustomer(db, schemas, TENANT_A, owners[n % 2] ?? '', { code: `S${n}`, visits: n, tier: tiers[n % 3] }),
    );
  }
  const foreign = await seedCustomer(db, schemas, TENANT_B, owners[0] ?? '', { code: 'B0', visits: 9 });
  return { db, schemas, owners, ids, foreign };
}

describeDialects('AUTHZ-02 the scope of a read', ({ open }) => {
  it('AUTHZ-02 a list gives only the rows that the scope allows, and the tenant filter stays', async () => {
    const { db, schemas, owners } = await setup(open);
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { scope: { owner: owners[0] } }));
    expect(page.rows.map((row) => String(row['code'])).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'S0',
      'S2',
      'S4',
    ]);
    const other = await inTenant(db, TENANT_B, (em) => listPage(em, schemas.Customer, { scope: { owner: owners[0] } }));
    expect(other.rows.map((row) => row['code'])).toEqual(['B0']);
  });

  it('AUTHZ-02 a scope may name a field that has no index: the code chooses it, not a client', async () => {
    const { db, schemas } = await setup(open);
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope: { visits: { $gte: 4 } }, sort: [{ field: 'code' }] }),
    );
    expect(page.rows.map((row) => row['code'])).toEqual(['S4', 'S5']);
    const failure = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { where: { visits: 4 } })),
    );
    expect(failure.code).toBe('DATA_FIELD_NOT_INDEXED');
  });

  it('AUTHZ-02 a scope gives the rows of either condition when it has an $or', async () => {
    const { db, schemas, owners } = await setup(open);
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, {
        scope: { $or: [{ owner: owners[1], visits: { $lt: 2 } }, { visits: { $gte: 5 } }] },
        sort: [{ field: 'code' }],
      }),
    );
    expect(page.rows.map((row) => row['code'])).toEqual(['S1', 'S5']);
  });

  it('AUTHZ-02 a scope and the filter of the caller are both applied', async () => {
    const { db, schemas, owners } = await setup(open);
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope: { owner: owners[0] }, where: { tier: 'gold' } }),
    );
    expect(page.rows.map((row) => row['code'])).toEqual(['S4']);
    const none = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope: { owner: owners[0] }, where: { tier: 'gold', visits: 3 } }),
    ).catch((error: unknown) => error);
    expect(none).toBeInstanceOf(DataError);
    const some = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope: { owner: owners[0] }, where: { tier: 'vip' } }),
    );
    expect(some.rows.map((row) => row['code'])).toEqual(['S2']);
  });

  it('AUTHZ-02 the total, the cursor and the offset all count only the rows of the scope', async () => {
    const { db, schemas, owners } = await setup(open);
    const scope = { owner: owners[0] };
    const first = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope, limit: 2, withTotal: true, sort: [{ field: 'code' }] }),
    );
    expect(first.total).toBe(3);
    expect(first.rows.map((row) => row['code'])).toEqual(['S0', 'S2']);
    const next = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, {
        scope,
        limit: 2,
        sort: [{ field: 'code' }],
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
      }),
    );
    expect(next.rows.map((row) => row['code'])).toEqual(['S4']);
    const paged = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope, limit: 2, offset: 2, sort: [{ field: 'code' }] }),
    );
    expect(paged.rows.map((row) => row['code'])).toEqual(['S4']);
  });

  it('AUTHZ-02 a scope that matches nothing gives an empty page', async () => {
    const { db, schemas } = await setup(open);
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope: { visits: { $gt: 100 } }, withTotal: true }),
    );
    expect(page).toMatchObject({ rows: [], total: 0, nextCursor: null });
  });

  it('AUTHZ-06 refuses a property that the entity does not have, and an operator that the language does not have', async () => {
    const { db, schemas } = await setup(open);
    for (const scope of [{ nope: 1 }, { visits: { $regex: 'a' } }, { 'owner.name': 'x' }, { $where: 'true' }]) {
      const failure = await failureOf(() => inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { scope })));
      expect([JSON.stringify(scope), failure.code]).toEqual([JSON.stringify(scope), 'DATA_QUERY_INVALID']);
    }
  });

  it('DATA-09 a scope cannot take the tenant filter away, even by naming the tenant', async () => {
    const { db, schemas } = await setup(open);
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { scope: { visits: { $gte: 9 } } }),
    );
    expect(page.rows).toEqual([]);
  });

  it('AUTHZ-02 an aggregate counts and sums only the rows of the scope', async () => {
    const { db, schemas, owners } = await setup(open);
    const result = await inTenant(db, TENANT_A, (em) =>
      aggregate(em, schemas.Customer, { groupBy: ['tier'], sum: ['visits'], count: true, scope: { owner: owners[0] } }),
    );
    expect(result.rows).toEqual([
      { group: { tier: 'gold' }, count: 1, sum: { visits: 4 } },
      { group: { tier: 'standard' }, count: 1, sum: { visits: 0 } },
      { group: { tier: 'vip' }, count: 1, sum: { visits: 2 } },
    ]);
    const nothing = await inTenant(db, TENANT_A, (em) =>
      aggregate(em, schemas.Customer, { scope: { visits: { $gt: 100 } } }),
    );
    expect(nothing.rows).toEqual([{ group: {}, count: 0 }]);
  });

  it('AUTHZ-06 an aggregate refuses a scope that is not in the language', async () => {
    const { db, schemas } = await setup(open);
    const failure = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => aggregate(em, schemas.Customer, { scope: { nope: 1 } })),
    );
    expect(failure.code).toBe('DATA_QUERY_INVALID');
  });
});

describeDialects('AUTHZ-02 findScoped', ({ open }) => {
  it('AUTHZ-02 finds a row that the scope allows', async () => {
    const { db, schemas, ids, owners } = await setup(open);
    const row = await inTenant(db, TENANT_A, (em) =>
      findScoped(em, schemas.Customer, ids[0] ?? '', { owner: owners[0] }),
    );
    expect(row?.['code']).toBe('S0');
  });

  it('AUTHZ-02 gives nothing for a row outside the scope, as if it did not exist', async () => {
    const { db, schemas, ids, owners } = await setup(open);
    expect(
      await inTenant(db, TENANT_A, (em) => findScoped(em, schemas.Customer, ids[1] ?? '', { owner: owners[0] })),
    ).toBeNull();
  });

  it('AUTHZ-02 finds any row of the tenant when the scope is empty, and none of another tenant', async () => {
    const { db, schemas, ids, foreign } = await setup(open);
    expect(
      (await inTenant(db, TENANT_A, (em) => findScoped(em, schemas.Customer, ids[3] ?? '', undefined)))?.['code'],
    ).toBe('S3');
    expect(await inTenant(db, TENANT_A, (em) => findScoped(em, schemas.Customer, foreign, undefined))).toBeNull();
  });

  it('DATA-16 does not find a row that was deleted', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, async (em) => {
      const entity = await em.findOneOrFail(schemas.Customer, ids[0] ?? '');
      em.remove(entity);
      await em.flush();
    });
    expect(await inTenant(db, TENANT_A, (em) => findScoped(em, schemas.Customer, ids[0] ?? '', undefined))).toBeNull();
  });

  it('AUTHZ-06 refuses a scope that is not in the language', async () => {
    const { db, schemas, ids } = await setup(open);
    const failure = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => findScoped(em, schemas.Customer, ids[0] ?? '', { nope: 1 })),
    );
    expect(failure.code).toBe('DATA_QUERY_INVALID');
  });

  it('API-04 refuses an id that is not a UUID with the same answer as a missing row', async () => {
    const { db, schemas } = await setup(open);
    expect(await inTenant(db, TENANT_A, (em) => findScoped(em, schemas.Customer, 'not-an-id', undefined))).toBeNull();
  });
});
