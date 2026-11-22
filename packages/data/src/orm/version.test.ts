/**
 * BieberKit
 *
 * @file        packages/data/src/orm/version.test.ts
 * @description Tests for optimistic concurrency: a stale write is 412, and an If-Match value is checked before the write (API-13).
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
import { crmSchemas, inTenant, seedCustomer, seedUser, TENANT_A } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import { softDelete } from './softdelete.ts';
import { expectVersion } from './version.ts';

async function failureOf(run: () => unknown): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

describeDialects('API-13 version', ({ open }) => {
  async function setup() {
    const schemas = crmSchemas();
    const db = await open(schemas.all);
    const owner = await seedUser(db, schemas);
    const id = await seedCustomer(db, schemas, TENANT_A, owner);
    return { schemas, db, id };
  }

  it('a new row has version 1, and every write that changes it adds one', async () => {
    const { schemas, db, id } = await setup();
    const version = () =>
      inTenant(db, TENANT_A, async (em) => (await em.findOneOrFail(schemas.Customer, { id }))['version']);
    expect(await version()).toBe(1);
    for (const [n, tier] of [
      [2, 'gold'],
      [3, 'vip'],
    ] as const) {
      await inTenant(db, TENANT_A, async (em) => {
        (await em.findOneOrFail(schemas.Customer, { id }))['tier'] = tier;
        await em.flush();
      });
      expect(await version()).toBe(n);
    }
  });

  it('a flush that changes nothing does not add a version', async () => {
    const { schemas, db, id } = await setup();
    await inTenant(db, TENANT_A, async (em) => {
      await em.findOneOrFail(schemas.Customer, { id });
      await em.flush();
    });
    expect((await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id })))['version']).toBe(1);
  });

  it('a write on top of a newer version is DATA_VERSION_STALE with status 412, and the newer data stays', async () => {
    const { schemas, db, id } = await setup();
    const first = db.fork();
    const second = db.fork();
    await inTenant(db, TENANT_A, async () => {
      const a = await first.findOneOrFail(schemas.Customer, { id });
      const b = await second.findOneOrFail(schemas.Customer, { id });
      b['tier'] = 'vip';
      await second.flush();
      a['tier'] = 'gold';
      const error = await failureOf(() => first.flush());
      expect(error.code).toBe('DATA_VERSION_STALE');
      expect(error.status).toBe(412);
      expect(error.fix).toContain('Reload');
    });
    expect((await inTenant(db, TENANT_A, (em) => em.findOneOrFail(schemas.Customer, { id })))['tier']).toBe('vip');
  });

  it('the stale error keeps the error of the ORM as its cause, for the logs', async () => {
    const { schemas, db, id } = await setup();
    const first = db.fork();
    const second = db.fork();
    const error = await inTenant(db, TENANT_A, async () => {
      const a = await first.findOneOrFail(schemas.Customer, { id });
      (await second.findOneOrFail(schemas.Customer, { id }))['tier'] = 'vip';
      await second.flush();
      a['tier'] = 'gold';
      return failureOf(() => first.flush());
    });
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('a soft delete of a stale row is refused too', async () => {
    const { schemas, db, id } = await setup();
    const first = db.fork();
    const second = db.fork();
    const error = await inTenant(db, TENANT_A, async () => {
      const a = await first.findOneOrFail(schemas.Customer, { id });
      (await second.findOneOrFail(schemas.Customer, { id }))['tier'] = 'vip';
      await second.flush();
      softDelete(first, a);
      return failureOf(() => first.flush());
    });
    expect(error.code).toBe('DATA_VERSION_STALE');
  });
});

describe('API-13 expectVersion', () => {
  const row = { version: 3 };

  it.each([[3], ['3'], ['"3"'], ['W/"3"'], [' 3 ']])('accepts %j for version 3', (expected) => {
    expect(() => expectVersion(row, expected)).not.toThrow();
  });

  it.each([[2], ['4'], ['"2"'], [0]])('refuses %j for version 3 with DATA_VERSION_STALE and status 412', (expected) => {
    expect(() => expectVersion(row, expected)).toThrowError(
      expect.objectContaining({ code: 'DATA_VERSION_STALE', status: 412 }),
    );
  });

  it.each([['abc'], [''], ['1.5'], ['-1'], [Number.NaN], [1.5]])(
    'a value that is not a version (%j) is DATA_VERSION_INVALID with status 400',
    (expected) => {
      expect(() => expectVersion(row, expected)).toThrowError(
        expect.objectContaining({ code: 'DATA_VERSION_INVALID', status: 400 }),
      );
    },
  );

  it('refuses a row that has no version, which is a mistake of the caller', () => {
    expect(() => expectVersion({}, 1)).toThrowError(expect.objectContaining({ code: 'DATA_ENTITY_INVALID' }));
  });
});
