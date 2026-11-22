/**
 * BieberKit
 *
 * @file        packages/data/src/orm/references.test.ts
 * @description Tests for the check that every referenced id is visible to the tenant and the user before a write (DATA-20).
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
import { uuid7 } from '../keys/uuid7.ts';
import { runInUnitOfWork } from './connect.ts';
import type { ReferenceVisibility } from './references.ts';
import { softDelete } from './softdelete.ts';

async function failureOf(run: () => Promise<unknown>): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

async function setup(open: DialectContext['open'], references?: ReferenceVisibility) {
  const schemas = crmSchemas();
  const db = await open(schemas.all, references === undefined ? {} : { references });
  const owner = await seedUser(db, schemas);
  const customerA = await seedCustomer(db, schemas, TENANT_A, owner, { code: 'A1' });
  const customerB = await seedCustomer(db, schemas, TENANT_B, owner, { code: 'B1' });
  return { schemas, db, owner, customerA, customerB };
}

describeDialects('DATA-20 a reference must be visible to the tenant', ({ open }) => {
  it('a contact may point at a customer of its own tenant', async () => {
    const { db, schemas, customerA } = await setup(open);
    await inTenant(db, TENANT_A, async (em) => {
      em.create(schemas.Contact, { fullName: 'Lê Văn', customer: em.getReference(schemas.Customer, customerA) });
      await em.flush();
    });
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Contact, {}))).toBe(1);
  });

  it('a contact of tenant B cannot point at a customer of tenant A: DATA_REFERENCE_NOT_VISIBLE with status 422, before the database sees it', async () => {
    const { db, schemas, customerA } = await setup(open);
    const error = await failureOf(() =>
      inTenant(db, TENANT_B, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, customerA) });
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
    expect(error.status).toBe(422);
    expect(error.message).toContain('crm.Customer');
    expect(
      await db.asSystem('check nothing was stored', () => runInUnitOfWork(db, (em) => em.count(schemas.Contact, {}))),
    ).toBe(0);
  });

  it('the message does not say whether the id exists for someone else', async () => {
    const { db, schemas, customerA } = await setup(open);
    const other = await failureOf(() =>
      inTenant(db, TENANT_B, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, customerA) });
        await em.flush();
      }),
    );
    const missing = await failureOf(() =>
      inTenant(db, TENANT_B, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, uuid7()) });
        await em.flush();
      }),
    );
    expect(other.message).toBe(missing.message);
    expect(other.message).not.toContain(customerA);
  });

  it('an id that does not exist at all is refused the same way', async () => {
    const { db, schemas } = await setup(open);
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, uuid7()) });
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
  });

  it('a deleted row can no longer be referenced', async () => {
    const { db, schemas, customerA } = await setup(open);
    await inTenant(db, TENANT_A, async (em) => {
      softDelete(em, await em.findOneOrFail(schemas.Customer, { id: customerA }));
      await em.flush();
    });
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, customerA) });
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
  });

  it('an update that moves the relation to a customer of another tenant is refused, and one that leaves it alone is not checked again', async () => {
    const { db, schemas, customerA, customerB } = await setup(open);
    const contact = await inTenant(db, TENANT_A, async (em) => {
      const row = em.create(schemas.Contact, {
        fullName: 'Lê',
        customer: em.getReference(schemas.Customer, customerA),
      });
      await em.flush();
      return String(row['id']);
    });
    await inTenant(db, TENANT_A, async (em) => {
      (await em.findOneOrFail(schemas.Contact, { id: contact }))['fullName'] = 'Lê Hai';
      await em.flush();
    });
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, async (em) => {
        (await em.findOneOrFail(schemas.Contact, { id: contact }))['customer'] = em.getReference(
          schemas.Customer,
          customerB,
        );
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
  });

  it('a relation to a global entity is checked as well: a user that does not exist is refused', async () => {
    const { db, schemas } = await setup(open);
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, async (em) => {
        em.create(schemas.Customer, { code: 'GHOST', name: 'x', owner: em.getReference(schemas.User, uuid7()) });
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
    expect(error.message).toContain('users.User');
  });

  it('many rows that point at the same customer are fine', async () => {
    const { db, schemas, customerA } = await setup(open);
    await inTenant(db, TENANT_A, async (em) => {
      for (let i = 0; i < 20; i++)
        em.create(schemas.Contact, {
          fullName: `Contact ${i}`,
          customer: em.getReference(schemas.Customer, customerA),
        });
      await em.flush();
    });
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Contact, {}))).toBe(20);
  });
});

describeDialects('DATA-20 the CASL read rule joins through the ReferenceVisibility port', ({ open }) => {
  it('the port receives the entity name and only the ids that passed the tenant filter, once per entity', async () => {
    const calls: { entity: string; ids: readonly string[] }[] = [];
    const references: ReferenceVisibility = {
      visible: async (entity, ids) => {
        calls.push({ entity, ids: [...ids] });
        return ids;
      },
    };
    const { db, schemas, customerA } = await setup(open, references);
    calls.length = 0;
    await inTenant(db, TENANT_A, async (em) => {
      em.create(schemas.Contact, { fullName: 'a', customer: em.getReference(schemas.Customer, customerA) });
      em.create(schemas.Contact, { fullName: 'b', customer: em.getReference(schemas.Customer, customerA) });
      await em.flush();
    });
    expect(calls).toEqual([{ entity: 'crm.Customer', ids: [customerA] }]);
  });

  it('an id that the port does not return is DATA_REFERENCE_NOT_VISIBLE', async () => {
    let blocked = '';
    const references: ReferenceVisibility = { visible: async (_entity, ids) => ids.filter((id) => id !== blocked) };
    const { db, schemas, customerA } = await setup(open, references);
    blocked = customerA;
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, customerA) });
        await em.flush();
      }),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
  });

  it('the port is not asked when the tenant filter already refused the id, and not asked when no relation is set', async () => {
    let asked = 0;
    const references: ReferenceVisibility = {
      visible: async (_entity, ids) => {
        asked++;
        return ids;
      },
    };
    const { db, schemas, customerA } = await setup(open, references);
    asked = 0;
    await failureOf(() =>
      inTenant(db, TENANT_B, async (em) => {
        em.create(schemas.Contact, { fullName: 'x', customer: em.getReference(schemas.Customer, customerA) });
        await em.flush();
      }),
    );
    expect(asked).toBe(0);
  });

  it('inside asSystem the check still runs, against the whole database', async () => {
    const { db, schemas, customerA } = await setup(open, { visible: async (_entity, ids) => ids });
    await expect(
      db.asSystem('import', () =>
        runInUnitOfWork(db, async (em) => {
          em.create(schemas.Contact, {
            tenantId: TENANT_A,
            fullName: 'x',
            customer: em.getReference(schemas.Customer, customerA),
          });
          await em.flush();
        }),
      ),
    ).resolves.toBeUndefined();
    const error = await failureOf(() =>
      db.asSystem('import', () =>
        runInUnitOfWork(db, async (em) => {
          em.create(schemas.Contact, {
            tenantId: TENANT_A,
            fullName: 'x',
            customer: em.getReference(schemas.Customer, uuid7()),
          });
          await em.flush();
        }),
      ),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
  });
});
