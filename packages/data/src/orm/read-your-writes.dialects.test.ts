/**
 * BieberKit
 *
 * @file        packages/data/src/orm/read-your-writes.dialects.test.ts
 * @description Tests of read your own writes against a real replica that is behind: the reads of a user who wrote go to the primary for the window, and nobody else's do (DATA-13).
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

import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { requestContext } from '@bieberkit/core';
import { describeDialects } from '../testing/dialects.ts';
import { crmSchemas } from '../testing/crm.ts';
import type { CrmSchemas } from '../testing/crm.ts';
import { createDatabase, runInTransaction, runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { listPage } from './query.ts';
import { createMemoryReadYourWrites, useReadYourWrites } from './read-your-writes.ts';
import type { ReadYourWrites } from './read-your-writes.ts';

const schemas: CrmSchemas = crmSchemas('single');
const as = <T>(userId: string | undefined, fn: () => Promise<T>): Promise<T> =>
  requestContext.run({ requestId: 'req-ryw', ...(userId === undefined ? {} : { userId }) }, fn);
const titles = async (db: Database, userId: string | undefined): Promise<string[]> =>
  as(userId, async () => (await listPage(db.fork(), schemas.Customer, {})).rows.map((row) => String(row['code'])));
const create = (em: Parameters<Parameters<typeof runInUnitOfWork>[1]>[0], code: string): void => {
  const owner = em.create(schemas.User, { name: 'Owner' });
  em.create(schemas.Customer, { code, name: code, tier: 'standard', visits: 0, owner });
};
const write = (db: Database, userId: string | undefined, code: string): Promise<void> =>
  as(userId, () =>
    runInTransaction(db, async (em) => {
      create(em, code);
      await em.flush();
    }),
  );

describeDialects('DATA-13 read your own writes', ({ dialect, emptyDatabase }) => {
  const open: Database[] = [];
  afterEach(async () => {
    useReadYourWrites(createMemoryReadYourWrites());
    for (const db of open.splice(0)) await db.close();
  });

  async function make(url: string, reads: string[]): Promise<Database> {
    const db = await createDatabase(
      { DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: reads, DB_POOL_MAX: 5 },
      { entities: schemas.all },
    );
    open.push(db);
    await db.orm.schema.create();
    return db;
  }

  /** A primary with a replica that is another database, so that it is behind: it never has what the primary has. */
  async function pair() {
    const primaryUrl = (await emptyDatabase()).url;
    const replicaUrl = (await emptyDatabase()).url;
    const replica = await make(replicaUrl, []);
    const primary = await make(primaryUrl, [replicaUrl]);
    return { primary, replica };
  }

  describe.skipIf(dialect === 'sqlite')('with a replica that is behind', () => {
    it('DATA-13 a user who wrote reads the write, and another user and an anonymous reader are sent to the replica', async () => {
      const { primary } = await pair();
      const author = randomUUID();
      await write(primary, author, 'mine');
      expect(await titles(primary, author)).toEqual(['mine']);
      expect(await titles(primary, randomUUID())).toEqual([]);
      expect(await titles(primary, undefined)).toEqual([]);
    });

    it('DATA-13 after the window the reads of that user go to the replica again', async () => {
      let now = 1_000;
      useReadYourWrites(createMemoryReadYourWrites({ windowMs: 5_000, now: () => now }));
      const { primary } = await pair();
      const author = randomUUID();
      await write(primary, author, 'mine');
      now += 4_999;
      expect(await titles(primary, author)).toEqual(['mine']);
      now += 2;
      expect(await titles(primary, author)).toEqual([]);
    });

    it('DATA-13 a write of a unit of work that flushes by itself is remembered as well', async () => {
      const { primary } = await pair();
      const author = randomUUID();
      await as(author, () =>
        runInUnitOfWork(primary, async (em) => {
          create(em, 'flushed');
          await em.flush();
        }),
      );
      expect(await titles(primary, author)).toEqual(['flushed']);
    });

    it('DATA-13 a write that is rolled back is not remembered, and a write with no user is remembered for nobody', async () => {
      const { primary } = await pair();
      const author = randomUUID();
      await expect(
        as(author, () =>
          runInTransaction(primary, async (em) => {
            create(em, 'doomed');
            await em.flush();
            throw new Error('rolled back');
          }),
        ),
      ).rejects.toThrow('rolled back');
      await write(primary, undefined, 'by the system');
      expect(await titles(primary, author)).toEqual([]);
    });

    it('DATA-13 a store that cannot remember does not fail the write, and one that cannot answer sends the read to the primary', async () => {
      const { primary } = await pair();
      const author = randomUUID();
      const broken: ReadYourWrites = {
        record: () => Promise.reject(new Error('the store is down')),
        recently: () => Promise.reject(new Error('the store is down')),
      };
      useReadYourWrites(broken);
      await expect(write(primary, author, 'still written')).resolves.toBeUndefined();
      expect(await titles(primary, author)).toEqual(['still written']);
    });

    it('DATA-13 the count that goes with a page is read from the same connection as the page', async () => {
      const { primary } = await pair();
      const author = randomUUID();
      await write(primary, author, 'one');
      const mine = await as(author, async () => listPage(primary.fork(), schemas.Customer, { withTotal: true }));
      expect(mine.total).toBe(1);
      const other = await as(randomUUID(), async () => listPage(primary.fork(), schemas.Customer, { withTotal: true }));
      expect(other.total).toBe(0);
    });
  });

  describe.skipIf(dialect !== 'sqlite')('without a replica', () => {
    it('DATA-13 the store is never asked, because there is only one database', async () => {
      const calls: string[] = [];
      useReadYourWrites({
        record: async () => void calls.push('record'),
        recently: async () => (calls.push('recently'), false),
      });
      const url = (await emptyDatabase()).url;
      const db = await createDatabase(
        { DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 5 },
        { entities: schemas.all },
      );
      open.push(db);
      await db.orm.schema.create();
      await write(db, randomUUID(), 'x');
      expect(await titles(db, randomUUID())).toEqual(['x']);
      expect(calls).toEqual([]);
    });
  });
});
