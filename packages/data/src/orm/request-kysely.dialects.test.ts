/**
 * BieberKit
 *
 * @file        packages/data/src/orm/request-kysely.dialects.test.ts
 * @description Tests of the Kysely that follows the request: it uses the EntityManager of the request, joins its transaction and lets a nested transaction join (AUTH-09, ADR 0012).
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

import { EntitySchema } from '@mikro-orm/core';
import { expect, it } from 'vitest';
import { uuid7 } from '../keys/uuid7.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { Database } from './connect.ts';
import { runInTransaction, runInUnitOfWork } from './connect.ts';
import { requestKysely } from './request-kysely.ts';
import { Uuid7Type } from './uuid7-type.ts';

interface ProbeRow {
  id: string;
  label: string;
}

const Probe = new EntitySchema<ProbeRow>({
  name: 'probe',
  tableName: 'probes',
  properties: {
    id: { type: Uuid7Type, primary: true, onCreate: () => uuid7() },
    label: { type: 'string', length: 50 },
  },
});

async function labels(db: Database): Promise<string[]> {
  const rows: { label: string }[] = await db.orm.em.getConnection().execute('select label from probes order by label');
  return rows.map((row) => row.label);
}

const insert = (db: Database, label: string) =>
  requestKysely(db).insertInto('probe').values({ id: uuid7(), label }).execute();

describeDialects('AUTH-09 the Kysely of the request', ({ dialect, open }) => {
  it('AUTH-09 writes and reads with the names of the entity, and converts the id', async () => {
    const db = await open([Probe]);
    const id = uuid7();
    await requestKysely(db).insertInto('probe').values({ id, label: 'one' }).execute();
    const found = await requestKysely(db).selectFrom('probe').select(['id', 'label']).where('id', '=', id).execute();
    expect(found).toEqual([{ id, label: 'one' }]);
  });

  it('AUTH-09 outside a request it works on a fork of the root EntityManager', async () => {
    const db = await open([Probe]);
    await insert(db, 'outside');
    expect(await labels(db)).toEqual(['outside']);
  });

  it('AUTH-09 inside a transaction its writes are the ones of the transaction: a failure takes them back', async () => {
    const db = await open([Probe]);
    await expect(
      runInTransaction(db, async () => {
        await insert(db, 'doomed');
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(await labels(db)).toEqual([]);
    await runInTransaction(db, async () => insert(db, 'kept'));
    expect(await labels(db)).toEqual(['kept']);
  });

  it('AUTH-09 a write of the ORM and a write of the Kysely are in the same transaction', async () => {
    const db = await open([Probe]);
    await expect(
      runInTransaction(db, async (em) => {
        em.create(Probe, { label: 'orm' });
        await em.flush();
        await insert(db, 'kysely');
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(await labels(db)).toEqual([]);
  });

  it('AUTH-09 a transaction that a library opens inside the request transaction joins it', async () => {
    const db = await open([Probe]);
    await expect(
      runInTransaction(db, async () => {
        await requestKysely(db)
          .transaction()
          .execute(async (trx) => {
            await trx.insertInto('probe').values({ id: uuid7(), label: 'nested' }).execute();
          });
        expect(await runInUnitOfWork(db, async () => 'still open')).toBe('still open');
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(await labels(db)).toEqual([]);
    await runInTransaction(db, async () =>
      requestKysely(db)
        .transaction()
        .execute(async (trx) => {
          await trx.insertInto('probe').values({ id: uuid7(), label: 'nested' }).execute();
        }),
    );
    expect(await labels(db)).toEqual(['nested']);
  });

  it('AUTH-09 a connection that a library asks for inside the request transaction is the transaction itself', async () => {
    const db = await open([Probe]);
    await expect(
      runInTransaction(db, async () => {
        await requestKysely(db)
          .connection()
          .execute(async (connection) => {
            await connection.insertInto('probe').values({ id: uuid7(), label: 'connected' }).execute();
          });
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(await labels(db)).toEqual([]);
  });

  it('AUTH-09 outside a transaction, transaction() is a real one: it commits, and it rolls back on a failure', async () => {
    const db = await open([Probe]);
    await requestKysely(db)
      .transaction()
      .execute(async (trx) => {
        await trx.insertInto('probe').values({ id: uuid7(), label: 'real' }).execute();
      });
    await expect(
      requestKysely(db)
        .transaction()
        .execute(async (trx) => {
          await trx.insertInto('probe').values({ id: uuid7(), label: 'undone' }).execute();
          throw new Error('forced failure');
        }),
    ).rejects.toThrow('forced failure');
    expect(await labels(db)).toEqual(['real']);
  });

  // SQLite has one connection and one writer, so two transactions cannot overlap there.
  it.skipIf(dialect === 'sqlite')('AUTH-09 two requests at the same time keep their own transactions', async () => {
    const db = await open([Probe]);
    const fail = runInTransaction(db, async () => {
      await insert(db, 'a');
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('forced failure');
    }).catch(() => 'failed');
    const keep = runInTransaction(db, async () => {
      await insert(db, 'b');
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'kept';
    });
    expect(await Promise.all([fail, keep])).toEqual(['failed', 'kept']);
    expect(await labels(db)).toEqual(['b']);
  });
});
