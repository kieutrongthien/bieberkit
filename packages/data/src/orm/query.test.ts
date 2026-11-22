/**
 * BieberKit
 *
 * @file        packages/data/src/orm/query.test.ts
 * @description Tests for list pages: page size, keyset cursor, total on request, the index rule, compared fields and the read only path (DATA-06, DATA-07, DATA-10, DATA-11, DATA-21, PERF-04).
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
import type { CrmSchemas } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { DialectContext } from '../testing/dialects.ts';
import { Customer } from '../testing/sample-entities.ts';
import { bulkInsert } from './bulk.ts';
import type { Database } from './connect.ts';
import { listPage, queryableFields } from './query.ts';

async function failureOf(run: () => Promise<unknown>): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

const TIERS = ['standard', 'gold', 'vip'] as const;
const code = (n: number): string => `C${String(n).padStart(3, '0')}`;

/** `count` customers in tenant A, with codes C000 upwards, tiers in turn and visits that repeat. */
async function setup(open: DialectContext['open'], count: number, extra: Parameters<DialectContext['open']>[1] = {}) {
  const schemas = crmSchemas();
  const db = await open(schemas.all, extra);
  const owner = await seedUser(db, schemas);
  const rows = Array.from({ length: count }, (_, n) => ({
    code: code(n),
    name: `Khách ${n}`,
    tier: TIERS[n % 3],
    visits: n % 7,
    owner,
  }));
  await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, rows));
  return { db, schemas, owner };
}

/** Walks every page of a query and returns the rows in the order they came. */
async function walk(db: Database, schemas: CrmSchemas, options: Parameters<typeof listPage>[2], tenant = TENANT_A) {
  const rows: Record<string, unknown>[] = [];
  const pages: number[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 100; guard++) {
    const page = await inTenant(db, tenant, (em) =>
      listPage(em, schemas.Customer, { ...options, ...(cursor === undefined ? {} : { cursor }) }),
    );
    rows.push(...page.rows);
    pages.push(page.rows.length);
    if (page.nextCursor === null) return { rows, pages };
    cursor = page.nextCursor;
  }
  throw new Error('The query never ended.');
}

describeDialects('DATA-06 page size', ({ open }) => {
  it('is 25 by default, and a next page exists when there is more', async () => {
    const { db, schemas } = await setup(open, 60);
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer));
    expect(page.rows).toHaveLength(25);
    expect(page.limit).toBe(25);
    expect(page.nextCursor).toBeTypeOf('string');
  });

  it('takes the limit asked for, and never more than 100', async () => {
    const { db, schemas } = await setup(open, 120);
    expect((await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: '10' }))).rows).toHaveLength(
      10,
    );
    const big = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: 500 }));
    expect(big.rows).toHaveLength(100);
    expect(big.limit).toBe(100);
  });

  it('a limit that is not a positive whole number is DATA_PAGE_LIMIT with status 400', async () => {
    const { db, schemas } = await setup(open, 3);
    for (const limit of [0, -1, 'abc', 1.5]) {
      const error = await failureOf(() => inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit })));
      expect(error.code).toBe('DATA_PAGE_LIMIT');
      expect(error.status).toBe(400);
    }
  });

  it('the last page has no cursor, also when the rows end exactly on a page', async () => {
    const { db, schemas } = await setup(open, 50);
    const { pages } = await walk(db, schemas, { limit: 25 });
    expect(pages).toEqual([25, 25]);
    const few = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: 100 }));
    expect(few.rows).toHaveLength(50);
    expect(few.nextCursor).toBeNull();
  });

  it('an empty table gives an empty page', async () => {
    const { db, schemas } = await setup(open, 0);
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer));
    expect(page).toMatchObject({ rows: [], nextCursor: null });
  });
});

describeDialects('DATA-11 keyset cursor', ({ open }) => {
  it('walks 120 rows in pages of 50 with no row twice and none missing', async () => {
    const { db, schemas } = await setup(open, 120);
    const { rows, pages } = await walk(db, schemas, { limit: 50, sort: [{ field: 'code' }] });
    expect(pages).toEqual([50, 50, 20]);
    expect(rows.map((row) => row['code'])).toEqual(Array.from({ length: 120 }, (_, n) => code(n)));
  });

  it('walks in descending order', async () => {
    const { db, schemas } = await setup(open, 70);
    const { rows } = await walk(db, schemas, { limit: 30, sort: [{ field: 'code', direction: 'desc' }] });
    expect(rows.map((row) => row['code'])).toEqual(Array.from({ length: 70 }, (_, n) => code(69 - n)));
  });

  it('walks by several fields in mixed directions, where many rows share the first value', async () => {
    const { db, schemas } = await setup(open, 90);
    const { rows } = await walk(db, schemas, {
      limit: 20,
      sort: [{ field: 'tier' }, { field: 'code', direction: 'desc' }],
    });
    const expected = Array.from({ length: 90 }, (_, n) => ({ tier: TIERS[n % 3] ?? '', code: code(n) })).toSorted(
      (a, b) => (a.tier === b.tier ? (a.code < b.code ? 1 : -1) : a.tier < b.tier ? -1 : 1),
    );
    expect(rows.map((row) => `${String(row['tier'])}/${String(row['code'])}`)).toEqual(
      expected.map((row) => `${row.tier}/${row.code}`),
    );
  });

  it('breaks a tie by id, so rows with the same timestamp are neither repeated nor lost', async () => {
    const { db, schemas } = await setup(open, 75);
    const { rows } = await walk(db, schemas, { limit: 10, sort: [{ field: 'createdAt' }] });
    expect(new Set(rows.map((row) => row['id'])).size).toBe(75);
  });

  it('sorts by id when nothing else is asked, which is the order of creation', async () => {
    const { db, schemas } = await setup(open, 40);
    const { rows } = await walk(db, schemas, { limit: 15 });
    const ids = rows.map((row) => String(row['id']));
    expect(ids).toEqual(ids.toSorted());
    expect(ids).toHaveLength(40);
  });

  it('a row added before the cursor while a client walks does not shift the next page', async () => {
    const { db, schemas, owner } = await setup(open, 60);
    const first = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { limit: 20, sort: [{ field: 'code' }] }),
    );
    await inTenant(db, TENANT_A, (em) => bulkInsert(em, schemas.Customer, [{ code: 'A000', name: 'Sớm', owner }]));
    const second = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { limit: 20, sort: [{ field: 'code' }], cursor: first.nextCursor ?? '' }),
    );
    expect(second.rows.map((row) => row['code'])).toEqual(Array.from({ length: 20 }, (_, n) => code(20 + n)));
  });

  it('a cursor of another sort, a damaged cursor, or one with the wrong number of values is DATA_CURSOR_INVALID', async () => {
    const { db, schemas } = await setup(open, 60);
    const byCode = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { limit: 10, sort: [{ field: 'code' }] }),
    );
    const cursor = byCode.nextCursor ?? '';
    for (const bad of [
      { sort: [{ field: 'name' }], cursor },
      { cursor },
      { sort: [{ field: 'code' }], cursor: 'garbage!' },
      { sort: [{ field: 'code' }], cursor: cursor.slice(0, 8) },
    ]) {
      const error = await failureOf(() =>
        inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: 10, ...bad })),
      );
      expect(error.code).toBe('DATA_CURSOR_INVALID');
    }
  });

  it('a cursor does not open another tenant: the filter still applies', async () => {
    const { db, schemas } = await setup(open, 60);
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: 10 }));
    const other = await inTenant(db, TENANT_B, (em) =>
      listPage(em, schemas.Customer, { limit: 10, cursor: page.nextCursor ?? '' }),
    );
    expect(other.rows).toEqual([]);
  });
});

describeDialects('DATA-11 total only on request', ({ open }) => {
  it('has no total by default, and the whole count on request, whatever page it is', async () => {
    const { db, schemas } = await setup(open, 120);
    const plain = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: 50 }));
    expect(plain.total).toBeUndefined();
    const first = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { limit: 50, withTotal: true }));
    const second = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Customer, { limit: 50, withTotal: true, cursor: first.nextCursor ?? '' }),
    );
    expect([first.total, second.total]).toEqual([120, 120]);
  });

  it('counts what the filter keeps, inside the tenant', async () => {
    const { db, schemas } = await setup(open, 90);
    expect(
      (
        await inTenant(db, TENANT_A, (em) =>
          listPage(em, schemas.Customer, { where: { tier: 'gold' }, withTotal: true }),
        )
      ).total,
    ).toBe(30);
    expect((await inTenant(db, TENANT_B, (em) => listPage(em, schemas.Customer, { withTotal: true }))).total).toBe(0);
  });
});

describeDialects('DATA-07 the index rule', ({ open }) => {
  it('lists the fields a client may filter and sort by', () => {
    expect(queryableFields(crmSchemas().Customer).toSorted()).toEqual([
      'code',
      'createdAt',
      'email',
      'id',
      'name',
      'number',
      'tier',
      'updatedAt',
    ]);
  });

  it('a filter on a field without an index is DATA_FIELD_NOT_INDEXED with status 400, and the message says how to fix it', async () => {
    const { db, schemas } = await setup(open, 5);
    for (const where of [{ note: 'x' }, { owner: 'x' }, { visits: 3 }, { $or: [{ code: 'C001' }, { note: 'x' }] }]) {
      const error = await failureOf(() => inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { where })));
      expect(error.code).toBe('DATA_FIELD_NOT_INDEXED');
      expect(error.status).toBe(400);
      expect(error.fix).toContain('.index()');
    }
  });

  it('a sort by a field without an index is refused the same way', async () => {
    const { db, schemas } = await setup(open, 5);
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { sort: [{ field: 'visits' }] })),
    );
    expect(error.code).toBe('DATA_FIELD_NOT_INDEXED');
  });

  it('an unknown field is DATA_QUERY_INVALID', async () => {
    const { db, schemas } = await setup(open, 5);
    for (const options of [{ where: { nope: 1 } }, { sort: [{ field: 'nope' }] }]) {
      const error = await failureOf(() => inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, options)));
      expect(error.code).toBe('DATA_QUERY_INVALID');
    }
  });

  it('a field that may be empty cannot be sorted by, because the order over nulls is not total', async () => {
    const { db, schemas } = await setup(open, 5);
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { sort: [{ field: 'email' }] })),
    );
    expect(error.code).toBe('DATA_SORT_INVALID');
    expect(error.status).toBe(400);
  });

  it('a direction that is not asc or desc is DATA_QUERY_INVALID', async () => {
    const { db, schemas } = await setup(open, 5);
    // @ts-expect-error not a direction
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { sort: [{ field: 'code', direction: 'up' }] })),
    );
    expect(error.code).toBe('DATA_QUERY_INVALID');
  });
});

describeDialects('DATA-21 filters on compared fields', ({ open }) => {
  async function named(): Promise<{ db: Database; schemas: CrmSchemas }> {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const names = ['Đường Lê', 'duong le', 'ĐƯỜNG LÊ MỚI', 'Nguyễn Văn', 'Lê Văn Ánh'];
    await inTenant(db, TENANT_A, (em) =>
      bulkInsert(
        em,
        schemas.Customer,
        names.map((name, n) => ({ code: code(n), name, email: n < 2 ? `User${n}@Example.com` : null, owner })),
      ),
    );
    return { db, schemas };
  }
  const codes = async (db: Database, schemas: CrmSchemas, where: Record<string, unknown>): Promise<unknown[]> =>
    (
      await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { where, sort: [{ field: 'code' }] }))
    ).rows.map((row) => row['code']);

  it('an equal value matches whatever the case and the accents', async () => {
    const { db, schemas } = await named();
    expect(await codes(db, schemas, { name: 'DUONG LE' })).toEqual([code(0), code(1)]);
    expect(await codes(db, schemas, { name: { $eq: 'đường lê' } })).toEqual([code(0), code(1)]);
  });

  it('works for $ne, $in and $nin', async () => {
    const { db, schemas } = await named();
    expect(await codes(db, schemas, { name: { $ne: 'duong le' } })).toEqual([code(2), code(3), code(4)]);
    expect(await codes(db, schemas, { name: { $in: ['nguyen van', 'LE VAN ANH'] } })).toEqual([code(3), code(4)]);
    expect(await codes(db, schemas, { name: { $nin: ['nguyen van', 'le van anh', 'duong le'] } })).toEqual([code(2)]);
  });

  it('$like folds the pattern and keeps the wildcards', async () => {
    const { db, schemas } = await named();
    expect(await codes(db, schemas, { name: { $like: 'ĐƯỜNG%' } })).toEqual([code(0), code(1), code(2)]);
  });

  it('an email in another case is the same email', async () => {
    const { db, schemas } = await named();
    expect(await codes(db, schemas, { email: 'USER1@example.COM' })).toEqual([code(1)]);
  });

  it('works inside $and and $or, with the fields checked there too', async () => {
    const { db, schemas } = await named();
    expect(await codes(db, schemas, { $or: [{ name: 'nguyen van' }, { code: code(0) }] })).toEqual([code(0), code(3)]);
    expect(await codes(db, schemas, { $and: [{ name: { $like: 'duong%' } }, { code: { $ne: code(0) } }] })).toEqual([
      code(1),
      code(2),
    ]);
  });

  it('an operator that makes no sense on folded text, or a value that is not text, is DATA_QUERY_INVALID', async () => {
    const { db, schemas } = await named();
    for (const where of [{ name: { $gt: 'a' } }, { name: 5 }, { name: { $in: [5] } }, { name: { $regex: 'x' } }]) {
      const error = await failureOf(() => codes(db, schemas, where));
      expect(error.code).toBe('DATA_QUERY_INVALID');
    }
  });

  it('sorting by a compared field sorts by the folded text', async () => {
    const { db, schemas } = await named();
    const { rows } = await walk(db, schemas, { sort: [{ field: 'name' }] });
    expect(rows.map((row) => row['name'])).toEqual([
      'Đường Lê',
      'duong le',
      'ĐƯỜNG LÊ MỚI',
      'Lê Văn Ánh',
      'Nguyễn Văn',
    ]);
  });
});

describeDialects('DATA-10 the read only path', ({ open }) => {
  it('returns plain objects, tracks nothing, and never shows a shadow column or the tenant filter value of another tenant', async () => {
    const { db, schemas } = await setup(open, 5);
    await inTenant(db, TENANT_A, async (em) => {
      const page = await listPage(em, schemas.Customer);
      expect(page.rows.every((row) => Object.getPrototypeOf(row) === Object.prototype)).toBe(true);
      expect(em.getUnitOfWork().getIdentityMap().keys()).toHaveLength(0);
      expect(Object.keys(page.rows[0] ?? {})).not.toContain('nameCmp');
      expect(Object.keys(page.rows[0] ?? {})).not.toContain('emailCmp');
    });
  });

  it('a change to a returned row is not written, because the row is a copy', async () => {
    const { db, schemas } = await setup(open, 3);
    await inTenant(db, TENANT_A, async (em) => {
      const page = await listPage(em, schemas.Customer, { sort: [{ field: 'code' }] });
      const row = page.rows[0];
      if (row !== undefined) row['name'] = 'Changed';
      await em.flush();
    });
    expect(
      (await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { sort: [{ field: 'code' }] }))).rows[0]?.[
        'name'
      ],
    ).toBe('Khách 0');
  });

  it('select returns only the properties asked for, and the id', async () => {
    const { db, schemas } = await setup(open, 3);
    const page = await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { select: ['code', 'tier'] }));
    expect(Object.keys(page.rows[0] ?? {}).toSorted()).toEqual(['code', 'id', 'tier']);
  });

  it('stays inside the tenant and hides deleted rows', async () => {
    const { db, schemas } = await setup(open, 10);
    expect((await inTenant(db, TENANT_B, (em) => listPage(em, schemas.Customer))).rows).toEqual([]);
    await inTenant(db, TENANT_A, (em) =>
      em.nativeUpdate(schemas.Customer, { code: code(0) }, { deletedAt: new Date(), deletedToken: 'gone' }),
    );
    const { rows } = await walk(db, schemas, { limit: 100 });
    expect(rows).toHaveLength(9);
  });

  it('a select of a property that does not exist is DATA_QUERY_INVALID', async () => {
    const { db, schemas } = await setup(open, 1);
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Customer, { select: ['nope'] })),
    );
    expect(error.code).toBe('DATA_QUERY_INVALID');
  });
});

describe('DATA-07 the same rule without a database', () => {
  it('the entity of the sample has these indexed fields', () => {
    expect(
      Object.entries(Customer.fields)
        .filter(([, field]) => field.index === true || field.unique === true)
        .map(([name]) => name),
    ).toEqual(['code', 'name', 'email', 'tier', 'number']);
  });
});
