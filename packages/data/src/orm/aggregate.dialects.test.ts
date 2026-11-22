/**
 * BieberKit
 *
 * @file        packages/data/src/orm/aggregate.dialects.test.ts
 * @description Tests of aggregations by group on every dialect: counts and sums that keep the tenant filter and the soft delete (API-15, DATA-09).
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
import { crmSchemas, inTenant, seedUser, TENANT_A, TENANT_B } from '../testing/crm.ts';
import type { CrmSchemas } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { DialectContext } from '../testing/dialects.ts';
import { aggregate } from './aggregate.ts';
import type { AggregateOptions } from './aggregate.ts';
import { bulkInsert } from './bulk.ts';
import type { Database } from './connect.ts';
import { softDelete } from './softdelete.ts';

const TIERS = ['standard', 'gold', 'vip'] as const;

async function failureOf(run: () => Promise<unknown>): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

/** 12 customers in tenant A: tiers in turn, visits 0 to 3, credit on every second one, two owners, active on every third. */
async function setup(open: DialectContext['open']) {
  const schemas = crmSchemas();
  const db = await open(schemas.all);
  const owners = [await seedUser(db, schemas, 'One'), await seedUser(db, schemas, 'Two')];
  const rows = Array.from({ length: 12 }, (_, n) => ({
    code: `C${String(n).padStart(2, '0')}`,
    name: `Khách ${n}`,
    tier: TIERS[n % 3],
    visits: n % 4,
    ...(n % 2 === 0 ? { creditScaled: 1050n * BigInt(n + 1) } : {}),
    active: n % 3 === 0,
    owner: owners[n % 2],
  }));
  await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, rows));
  await inTenant(db, TENANT_B, (em) =>
    bulkInsert(em, schemas.Customer, [{ code: 'B1', name: 'Other', tier: 'vip', visits: 9, owner: owners[0] }]),
  );
  return { db, schemas, owners };
}

const run = (db: Database, schemas: CrmSchemas, options: AggregateOptions, tenant = TENANT_A) =>
  inTenant(db, tenant, (em) => aggregate(em, schemas.Customer, options));

describeDialects('API-15 aggregate', ({ open }) => {
  it('API-15 counts the rows when it is asked for nothing else', async () => {
    const { db, schemas } = await setup(open);
    expect((await run(db, schemas, {})).rows).toEqual([{ group: {}, count: 12 }]);
  });

  it('API-15 counts by group, and orders the groups', async () => {
    const { db, schemas } = await setup(open);
    const result = await run(db, schemas, { groupBy: ['tier'], count: true });
    expect(result.rows).toEqual([
      { group: { tier: 'gold' }, count: 4 },
      { group: { tier: 'standard' }, count: 4 },
      { group: { tier: 'vip' }, count: 4 },
    ]);
  });

  it('API-15 sums an integer field by group', async () => {
    const { db, schemas } = await setup(open);
    const result = await run(db, schemas, { groupBy: ['tier'], sum: ['visits'] });
    const expected: Record<string, number> = {};
    for (let n = 0; n < 12; n += 1) expected[TIERS[n % 3] ?? ''] = (expected[TIERS[n % 3] ?? ''] ?? 0) + (n % 4);
    expect(result.rows.map((row) => [row.group['tier'], row.sum?.['visits']])).toEqual(
      Object.keys(expected)
        .toSorted((a, b) => a.localeCompare(b))
        .map((tier) => [tier, expected[tier]]),
    );
    expect(result.rows[0]).not.toHaveProperty('count');
  });

  it('API-15 sums a decimal as text with its scale, and a group with no value has a null sum', async () => {
    const { db, schemas } = await setup(open);
    const total = await run(db, schemas, { sum: ['credit'] });
    let sum = 0n;
    for (let n = 0; n < 12; n += 2) sum += 1050n * BigInt(n + 1);
    expect(total.rows[0]?.sum?.['credit']).toBe(`${sum / 100n}.${String(sum % 100n).padStart(2, '0')}`);
    const empty = await run(db, schemas, { sum: ['credit'], where: { code: 'C01' } });
    expect(empty.rows).toEqual([{ group: {}, sum: { credit: null } }]);
  });

  it('API-15 groups by a relation, and gives the id of the row', async () => {
    const { db, schemas, owners } = await setup(open);
    const result = await run(db, schemas, { groupBy: ['owner'], count: true });
    expect(result.rows.map((row) => row.group['owner']).toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual(
      owners.toSorted((a, b) => a.localeCompare(b)),
    );
    expect(result.rows.map((row) => row.count)).toEqual([6, 6]);
  });

  it('API-15 groups by a boolean, and gives booleans', async () => {
    const { db, schemas } = await setup(open);
    const result = await run(db, schemas, { groupBy: ['active'], count: true });
    expect(result.rows).toEqual([
      { group: { active: false }, count: 8 },
      { group: { active: true }, count: 4 },
    ]);
  });

  it('API-15 groups by two fields, and sums and counts together', async () => {
    const { db, schemas } = await setup(open);
    const result = await run(db, schemas, { groupBy: ['tier', 'active'], sum: ['visits'], count: true });
    expect(result.rows.reduce((total, row) => total + (row.count ?? 0), 0)).toBe(12);
    expect(result.rows.every((row) => 'tier' in row.group && 'active' in row.group && row.sum !== undefined)).toBe(
      true,
    );
  });

  it('API-15 applies the filter of the query, on indexed fields only', async () => {
    const { db, schemas } = await setup(open);
    expect((await run(db, schemas, { where: { tier: 'gold' } })).rows).toEqual([{ group: {}, count: 4 }]);
    expect((await failureOf(() => run(db, schemas, { where: { note: 'x' } }))).code).toBe('DATA_FIELD_NOT_INDEXED');
  });

  it('DATA-09 sees only the tenant of the request, and needs one', async () => {
    const { db, schemas } = await setup(open);
    expect((await run(db, schemas, { groupBy: ['tier'] }, TENANT_B)).rows).toEqual([
      { group: { tier: 'vip' }, count: 1 },
    ]);
    const error = await failureOf(() => db.fork().transactional((em) => aggregate(em, schemas.Customer, {})));
    expect(error.code).toBe('DATA_TENANT_REQUIRED');
  });

  it('DATA-09 sees every tenant inside asSystem, which is audited', async () => {
    const { db, schemas } = await setup(open);
    const result = await db.asSystem('report', () => aggregate(db.fork(), schemas.Customer, {}));
    expect(result.rows).toEqual([{ group: {}, count: 13 }]);
  });

  it('DATA-16 does not count a row that was soft deleted', async () => {
    const { db, schemas } = await setup(open);
    await inTenant(db, TENANT_A, async (em) => {
      softDelete(em, await em.findOneOrFail(schemas.Customer, { code: 'C00' }));
      await em.flush();
    });
    expect((await run(db, schemas, {})).rows).toEqual([{ group: {}, count: 11 }]);
  });

  it('API-15 an empty set is a row of zero without groups, and no row with groups', async () => {
    const { db, schemas } = await setup(open);
    const none = { where: { code: 'nothing' } };
    expect((await run(db, schemas, none)).rows).toEqual([{ group: {}, count: 0 }]);
    expect((await run(db, schemas, { ...none, groupBy: ['tier'] })).rows).toEqual([]);
  });

  it('API-15 refuses a field that was not declared aggregatable, or cannot be grouped or summed', async () => {
    const { db, schemas } = await setup(open);
    const attempts: AggregateOptions[] = [
      { groupBy: ['name'] },
      { groupBy: ['nope'] },
      { sum: ['tier'] },
      { sum: ['active'] },
      { sum: ['balance'] },
      { groupBy: ['tier', 'active', 'owner', 'visits'] },
      { groupBy: ['tier', 'tier'] },
    ];
    for (const options of attempts) {
      const error = await failureOf(() => run(db, schemas, options));
      expect([JSON.stringify(options), error.code, error.status]).toEqual([
        JSON.stringify(options),
        'DATA_AGGREGATE_INVALID',
        400,
      ]);
    }
  });

  it('API-15 stops when there are more groups than the limit', async () => {
    const { db, schemas } = await setup(open);
    const error = await failureOf(() => run(db, schemas, { groupBy: ['visits'], maxGroups: 3 }));
    expect(error.code).toBe('DATA_AGGREGATE_TOO_MANY');
    expect(error.status).toBe(400);
  });
});
