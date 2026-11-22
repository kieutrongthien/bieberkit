/**
 * BieberKit
 *
 * @file        packages/data/src/orm/tenant.test.ts
 * @description Tests for tenant isolation: the filter that cannot be switched off, asSystem with its audit, and the tenant of every write (DATA-09, DATA-19, CFG-11).
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

import { requestContext } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { crmSchemas, inTenant, seedCustomer, seedUser, TENANT_A, TENANT_B } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { DialectContext } from '../testing/dialects.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { currentTenantId, runAsTenant } from './tenant.ts';
import type { SystemScopeEntry } from './tenant.ts';

async function failureOf(run: () => Promise<unknown>): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

/** A database with two tenants: A has two customers, B has one. */
async function seeded(open: DialectContext['open'], audit?: { record(entry: SystemScopeEntry): void }) {
  const schemas = crmSchemas();
  const db = await open(schemas.all, audit === undefined ? {} : { audit });
  const owner = await seedUser(db, schemas);
  const a1 = await seedCustomer(db, schemas, TENANT_A, owner, { code: 'A1' });
  const a2 = await seedCustomer(db, schemas, TENANT_A, owner, { code: 'A2' });
  const b1 = await seedCustomer(db, schemas, TENANT_B, owner, { code: 'B1' });
  return { schemas, db, owner, a1, a2, b1 };
}

describe('DATA-19 the tenant of the request', () => {
  it('runAsTenant sets the tenant for the call, restores the outer one after it, and leaves nothing behind', () => {
    expect(currentTenantId()).toBeUndefined();
    runAsTenant(TENANT_A, () => {
      expect(currentTenantId()).toBe(TENANT_A);
      runAsTenant(TENANT_B, () => expect(currentTenantId()).toBe(TENANT_B));
      expect(currentTenantId()).toBe(TENANT_A);
    });
    expect(currentTenantId()).toBeUndefined();
  });

  it('keeps the other fields of the request context', () => {
    requestContext.run({ requestId: 'r1', userId: 'u1' }, () => {
      runAsTenant(TENANT_A, () =>
        expect(requestContext.get()).toMatchObject({ requestId: 'r1', userId: 'u1', tenantId: TENANT_A }),
      );
    });
  });

  it('a tenant that is not a UUID is refused', () => {
    expect(() => runAsTenant('acme', () => undefined)).toThrowError(
      expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
    );
  });

  it('two requests that run side by side keep their own tenant', async () => {
    const seen = await Promise.all([
      runAsTenant(TENANT_A, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return currentTenantId();
      }),
      runAsTenant(TENANT_B, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return currentTenantId();
      }),
    ]);
    expect(seen).toEqual([TENANT_A, TENANT_B]);
  });
});

describeDialects('DATA-09 the tenant filter', ({ open }) => {
  it('find, count and findOne only see the rows of the tenant of the request', async () => {
    const { db, schemas, b1, a1 } = await seeded(open);
    expect(
      (await inTenant(db, TENANT_A, (em) => em.find(schemas.Customer, {})))
        .map((row) => String(row['code']))
        .toSorted(),
    ).toEqual(['A1', 'A2']);
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Customer, {}))).toBe(1);
    expect(await inTenant(db, TENANT_A, (em) => em.findOne(schemas.Customer, { id: b1 }))).toBeNull();
    expect(await inTenant(db, TENANT_B, (em) => em.findOne(schemas.Customer, { id: a1 }))).toBeNull();
  });

  it('a filter written by the caller cannot widen it', async () => {
    const { db, schemas } = await seeded(open);
    const rows = await inTenant(db, TENANT_A, (em) =>
      em.find(schemas.Customer, { $or: [{ tenantId: TENANT_B }, { code: 'A1' }] }),
    );
    expect(rows.map((row) => row['code'])).toEqual(['A1']);
    expect(await inTenant(db, TENANT_A, (em) => em.find(schemas.Customer, { tenantId: TENANT_B }))).toEqual([]);
  });

  it('nativeUpdate and nativeDelete only touch the tenant of the request', async () => {
    const { db, schemas } = await seeded(open);
    expect(await inTenant(db, TENANT_A, (em) => em.nativeUpdate(schemas.Customer, {}, { tier: 'vip' }))).toBe(2);
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Customer, { tier: 'vip' }))).toBe(0);
    expect(await inTenant(db, TENANT_A, (em) => em.nativeDelete(schemas.Customer, { code: 'B1' }))).toBe(0);
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Customer, {}))).toBe(1);
  });

  it('a relation to a global entity is loaded without a tenant', async () => {
    const { db, schemas, a1 } = await seeded(open);
    const row = await inTenant(db, TENANT_A, (em) =>
      em.findOneOrFail(schemas.Customer, { id: a1 }, { populate: ['*'] }),
    );
    expect(Reflect.get(Object(row['owner']), 'name')).toBe('Owner');
  });

  it('a global entity needs no tenant at all', async () => {
    const { db, schemas } = await seeded(open);
    expect(await runInUnitOfWork(db, (em) => em.count(schemas.User, {}))).toBe(1);
  });

  it('two tenants working at the same moment never see each other', async () => {
    const { db, schemas, owner } = await seeded(open);
    const work = (tenant: string, label: string, n: number) =>
      inTenant(db, tenant, async (em) => {
        for (let i = 0; i < n; i++) {
          em.create(schemas.Customer, {
            code: `${label}${i}`,
            name: label,
            owner: em.getReference(schemas.User, owner),
          });
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        await em.flush();
        return (await em.find(schemas.Customer, {})).map((row) => String(row['name']));
      });
    const [a, b] = await Promise.all([work(TENANT_A, 'Alpha', 10), work(TENANT_B, 'Beta', 10)]);
    expect(a?.every((name) => name === 'Alpha' || name === 'Lê Văn')).toBe(true);
    expect(b?.every((name) => name === 'Beta' || name === 'Lê Văn')).toBe(true);
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, { name: 'Beta' }))).toBe(0);
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Customer, { name: 'Alpha' }))).toBe(0);
  });
});

describeDialects('DATA-19 a request without a tenant', ({ open }) => {
  it('every read of a tenant entity is DATA_TENANT_REQUIRED with status 400, never an unfiltered read', async () => {
    const { db, schemas, a1 } = await seeded(open);
    for (const run of [
      () => runInUnitOfWork(db, (em) => em.find(schemas.Customer, {})),
      () => runInUnitOfWork(db, (em) => em.count(schemas.Customer, {})),
      () => runInUnitOfWork(db, (em) => em.findOne(schemas.Customer, { id: a1 })),
      () => runInUnitOfWork(db, (em) => em.nativeUpdate(schemas.Customer, {}, { tier: 'vip' })),
      () => runInUnitOfWork(db, (em) => em.nativeDelete(schemas.Customer, {})),
    ]) {
      const error = await failureOf(run);
      expect(error.code).toBe('DATA_TENANT_REQUIRED');
      expect(error.status).toBe(400);
      expect(error.fix).toContain('runAsTenant');
    }
  });

  it('a write of a tenant entity is refused too, because its tenant cannot be known', async () => {
    const { db, schemas, owner } = await seeded(open);
    const error = await failureOf(() =>
      runInUnitOfWork(db, async (em) => {
        em.create(schemas.Customer, { code: 'NOPE', name: 'x', owner: em.getReference(schemas.User, owner) });
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_TENANT_REQUIRED');
  });
});

describeDialects('DATA-09 no way around the filter inside a handler', ({ open }) => {
  const attempts = [
    [
      'filters: { tenant: false } on find',
      (db: Database, s: ReturnType<typeof crmSchemas>) =>
        inTenant(db, TENANT_A, (em) => em.find(s.Customer, {}, { filters: { tenant: false } })),
    ],
    [
      'filters: false on find',
      (db: Database, s: ReturnType<typeof crmSchemas>) =>
        inTenant(db, TENANT_A, (em) => em.find(s.Customer, {}, { filters: false })),
    ],
    [
      'filters: { tenant: false } on count',
      (db: Database, s: ReturnType<typeof crmSchemas>) =>
        inTenant(db, TENANT_A, (em) => em.count(s.Customer, {}, { filters: { tenant: false } })),
    ],
    [
      'filters: { tenant: false } on findOne',
      (db: Database, s: ReturnType<typeof crmSchemas>) =>
        inTenant(db, TENANT_A, (em) => em.findOne(s.Customer, {}, { filters: { tenant: false } })),
    ],
    [
      'filters: { tenant: false } on nativeUpdate',
      (db: Database, s: ReturnType<typeof crmSchemas>) =>
        inTenant(db, TENANT_A, (em) =>
          em.nativeUpdate(s.Customer, {}, { tier: 'vip' }, { filters: { tenant: false } }),
        ),
    ],
    [
      'filters: { tenant: false } on nativeDelete',
      (db: Database, s: ReturnType<typeof crmSchemas>) =>
        inTenant(db, TENANT_A, (em) => em.nativeDelete(s.Customer, {}, { filters: { tenant: false } })),
    ],
  ] as const;

  it.each(attempts)('%s is DATA_TENANT_FILTER_DISABLED', async (_name, attempt) => {
    const { db, schemas } = await seeded(open);
    const error = await failureOf(() => attempt(db, schemas));
    expect(error.code).toBe('DATA_TENANT_FILTER_DISABLED');
    expect(error.fix).toContain('asSystem');
  });

  it('nothing was changed by a refused nativeUpdate', async () => {
    const { db, schemas } = await seeded(open);
    await failureOf(() => attempts[4][1](db, schemas));
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, { tier: 'vip' }))).toBe(0);
  });

  it('the soft delete filter may be switched off, because a trash view needs it and it is not a security boundary', async () => {
    const { db, schemas } = await seeded(open);
    await expect(
      inTenant(db, TENANT_A, (em) => em.find(schemas.Customer, {}, { filters: { softDelete: false } })),
    ).resolves.toHaveLength(2);
  });
});

/** An audit sink that keeps what it was given. */
const sink = () => {
  const entries: SystemScopeEntry[] = [];
  return { entries, record: (entry: SystemScopeEntry): void => void entries.push(entry) };
};

describeDialects('DATA-09 asSystem', ({ open }) => {
  it('reads across tenants, and records who did it and why', async () => {
    const audit = sink();
    const { db, schemas } = await seeded(open, audit);
    const rows = await requestContext.run({ requestId: 'r9', userId: 'u9' }, () =>
      db.asSystem('nightly report', () => runInUnitOfWork(db, (em) => em.find(schemas.Customer, {}))),
    );
    expect(rows.map((row) => String(row['code'])).toSorted()).toEqual(['A1', 'A2', 'B1']);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ reason: 'nightly report', requestId: 'r9', userId: 'u9' });
    expect(audit.entries[0]?.at).toBeInstanceOf(Date);
  });

  it('records the tenant that was set when it started, if there was one', async () => {
    const audit = sink();
    const { db, schemas } = await seeded(open, audit);
    await runAsTenant(TENANT_A, () =>
      db.asSystem('support lookup', () => runInUnitOfWork(db, (em) => em.count(schemas.Customer, {}))),
    );
    expect(audit.entries[0]).toMatchObject({ tenantId: TENANT_A });
  });

  it.each([[''], ['   '], ['\n']])(
    'a blank reason (%j) is DATA_SYSTEM_SCOPE_REASON, and nothing runs or is recorded',
    async (reason) => {
      const audit = sink();
      const { db } = await seeded(open, audit);
      let ran = false;
      const error = await failureOf(() =>
        db.asSystem(reason, async () => {
          ran = true;
        }),
      );
      expect(error.code).toBe('DATA_SYSTEM_SCOPE_REASON');
      expect(ran).toBe(false);
      expect(audit.entries).toEqual([]);
    },
  );

  it('the scope ends with the call: the next query is filtered again', async () => {
    const { db, schemas } = await seeded(open, sink());
    await db.asSystem('one off', () => runInUnitOfWork(db, (em) => em.count(schemas.Customer, {})));
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, {}))).toBe(2);
  });

  it('the scope ends when the function throws, and the use is still recorded once', async () => {
    const audit = sink();
    const { db, schemas } = await seeded(open, audit);
    await expect(
      db.asSystem('fails', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(audit.entries).toHaveLength(1);
    expect((await failureOf(() => runInUnitOfWork(db, (em) => em.count(schemas.Customer, {})))).code).toBe(
      'DATA_TENANT_REQUIRED',
    );
  });

  it('a request that runs at the same time does not get the scope', async () => {
    const { db, schemas } = await seeded(open, sink());
    const [system, scoped] = await Promise.all([
      db.asSystem('slow', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return runInUnitOfWork(db, (em) => em.count(schemas.Customer, {}));
      }),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return inTenant(db, TENANT_A, (em) => em.count(schemas.Customer, {}));
      })(),
    ]);
    expect([system, scoped]).toEqual([3, 2]);
  });

  it('if the audit sink fails, the scope does not start', async () => {
    const { db } = await seeded(open, {
      record: () => {
        throw new Error('sink is down');
      },
    });
    let ran = false;
    await expect(
      db.asSystem('needs an audit', async () => {
        ran = true;
      }),
    ).rejects.toThrow('sink is down');
    expect(ran).toBe(false);
  });

  it('can write across tenants, with the tenant given in the row', async () => {
    const { db, schemas, owner } = await seeded(open, sink());
    await db.asSystem('import for tenant B', () =>
      runInUnitOfWork(db, async (em) => {
        em.create(schemas.Customer, {
          tenantId: TENANT_B,
          code: 'IMPORT',
          name: 'x',
          owner: em.getReference(schemas.User, owner),
        });
        await em.flush();
      }),
    );
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Customer, { code: 'IMPORT' }))).toBe(1);
  });
});

describeDialects('DATA-09 the tenant of a write', ({ open }) => {
  it('is filled from the request when the row does not say', async () => {
    const { db, schemas, a1 } = await seeded(open);
    const row = await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id: a1 }));
    expect(row['tenantId']).toBe(TENANT_A);
  });

  it('may be given, when it is the tenant of the request', async () => {
    const { db, schemas, owner } = await seeded(open);
    await expect(seedCustomer(db, schemas, TENANT_A, owner, { tenantId: TENANT_A })).resolves.toBeTypeOf('string');
  });

  it('another tenant than the request is DATA_TENANT_MISMATCH with status 403, and nothing is stored', async () => {
    const { db, schemas, owner } = await seeded(open);
    const error = await failureOf(() =>
      seedCustomer(db, schemas, TENANT_A, owner, { code: 'EVIL', tenantId: TENANT_B }),
    );
    expect(error.code).toBe('DATA_TENANT_MISMATCH');
    expect(error.status).toBe(403);
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Customer, { code: 'EVIL' }))).toBe(0);
  });

  it('changing the tenant of a row is DATA_TENANT_IMMUTABLE, even inside asSystem', async () => {
    const { db, schemas, a1 } = await seeded(open, { record: () => undefined });
    const move = (): Promise<void> =>
      db.asSystem('move a row', () =>
        runInUnitOfWork(db, async (em) => {
          (await em.findOneOrFail(schemas.Customer, { id: a1 }))['tenantId'] = TENANT_B;
          await em.flush();
        }),
      );
    const error = await failureOf(move);
    expect(error.code).toBe('DATA_TENANT_IMMUTABLE');
    expect(error.status).toBe(403);
  });
});

describeDialects('CFG-11 tenancy: single', ({ dialect, open }) => {
  it('works with no tenant at all, and the table has no tenant column', async () => {
    const schemas = crmSchemas('single');
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const id = await runInUnitOfWork(db, async (em) => {
      const row = em.create(schemas.Customer, { code: 'ONE', name: 'x', owner: em.getReference(schemas.User, owner) });
      await em.flush();
      return String(row['id']);
    });
    expect(await runInUnitOfWork(db, (em) => em.count(schemas.Customer, {}))).toBe(1);
    expect((await runInUnitOfWork(db, (em) => em.findOneOrFail(schemas.Customer, { id })))['code']).toBe('ONE');
    const result: unknown = await db.orm.em
      .getConnection()
      .execute(
        dialect === 'sqlite'
          ? `select name as c from pragma_table_info('crm_customers')`
          : `select column_name as c from information_schema.columns where table_name = 'crm_customers'${dialect === 'mysql' ? ' and table_schema = database()' : ''}`,
      );
    const columns = Array.isArray(result) ? result.map((row) => String(row.c ?? row.C)) : [];
    expect(columns).not.toContain('tenant_id');
  });
});
