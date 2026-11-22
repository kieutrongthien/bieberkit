/**
 * BieberKit
 *
 * @file        packages/data/src/orm/dialects.test.ts
 * @description Runs the key type, UTC timestamps and the unit of work on SQLite, PostgreSQL and MySQL (DATA-04, DATA-05, DATA-14).
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
import type { Dialect } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { uuid7 } from '../keys/uuid7.ts';
import { describeDialects } from '../testing/dialects.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { Uuid7Type } from './uuid7-type.ts';

interface Thing {
  id: string;
  name: string;
  at?: Date;
}

const Thing = new EntitySchema<Thing>({
  name: 'Thing',
  tableName: 'things',
  properties: {
    id: { type: Uuid7Type, primary: true, onCreate: () => uuid7() },
    name: { type: 'string', length: 100 },
    at: { type: 'datetime', nullable: true },
  },
});

async function rows(db: Database, sql: string): Promise<Record<string, unknown>[]> {
  const result: unknown = await db.orm.em.getConnection().execute(sql);
  return Array.isArray(result) ? result : [];
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

/** The column type of `things.id` in the words of the dialect, so one assertion covers all three. */
async function idColumnType(db: Database, dialect: Dialect): Promise<string> {
  if (dialect === 'postgres') {
    const [row] = await rows(
      db,
      `select data_type as t from information_schema.columns where table_name = 'things' and column_name = 'id'`,
    );
    return String(row?.['t']);
  }
  if (dialect === 'mysql') {
    const [row] = await rows(
      db,
      `select data_type as t, character_maximum_length as len from information_schema.columns where table_name = 'things' and column_name = 'id' and table_schema = database()`,
    );
    return `${String(row?.['t'] ?? row?.['T'])}(${String(row?.['len'] ?? row?.['LEN'])})`;
  }
  const found = await rows(db, `pragma table_info('things')`);
  return String(found.find((column) => column['name'] === 'id')?.['type']).toLowerCase();
}

const NATIVE_ID_TYPE: Readonly<Record<Dialect, string>> = { postgres: 'uuid', mysql: 'binary(16)', sqlite: 'blob' };

describeDialects('DATA-14 UUID keys', ({ dialect, open }) => {
  it('DATA-14 stores the key in the native column type of the dialect', async () => {
    const db = await open([Thing]);
    expect(await idColumnType(db, dialect)).toBe(NATIVE_ID_TYPE[dialect]);
  });

  it('DATA-14 an id written and read back is the same lower case string', async () => {
    const db = await open([Thing]);
    const id = await runInUnitOfWork(db, async (em) => {
      const row = em.create(Thing, { name: 'round trip' });
      await em.flush();
      return row.id;
    });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const loaded = await runInUnitOfWork(db, (em) => em.findOneOrFail(Thing, { id }));
    expect(loaded.id).toBe(id);
    expect(loaded.name).toBe('round trip');
  });

  it('DATA-14 a lookup by the upper case text finds the row', async () => {
    const db = await open([Thing]);
    const id = await runInUnitOfWork(db, async (em) => {
      const row = em.create(Thing, { name: 'upper' });
      await em.flush();
      return row.id;
    });
    const loaded = await runInUnitOfWork(db, (em) => em.findOne(Thing, { id: id.toUpperCase() }));
    expect(loaded?.name).toBe('upper');
  });

  it('DATA-03 60 ids sort by id in the order they were created', async () => {
    const db = await open([Thing]);
    const created = await runInUnitOfWork(db, async (em) => {
      const made = Array.from({ length: 60 }, (_, n) =>
        em.create(Thing, { name: `row ${String(n).padStart(2, '0')}` }),
      );
      await em.flush();
      return made.map((row) => row.id);
    });
    const ordered = await runInUnitOfWork(db, (em) => em.find(Thing, {}, { orderBy: { id: 'asc' } }));
    expect(ordered.map((row) => row.id)).toEqual(created);
    expect(ordered.map((row) => row.name)).toEqual(created.map((_, n) => `row ${String(n).padStart(2, '0')}`));
  });

  it('DATA-14 a key that is not a UUID is refused before the database sees it, and nothing is stored', async () => {
    const db = await open([Thing]);
    const error = await failureOf(() =>
      runInUnitOfWork(db, async (em) => {
        em.create(Thing, { id: 'not-a-uuid', name: 'bad' });
        await em.flush();
      }),
    );
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: 'DATA_UUID_INVALID' });
    expect(await rows(db, 'select count(*) as n from things')).toMatchObject([{ n: expect.anything() }]);
    const [count] = await rows(db, 'select count(*) as n from things');
    expect(Number(count?.['n'])).toBe(0);
  });

  it('DATA-14 a lookup by a value that is not a UUID is refused too', async () => {
    const db = await open([Thing]);
    const error = await failureOf(() => runInUnitOfWork(db, (em) => em.findOne(Thing, { id: 'zzz' })));
    expect(error).toMatchObject({ code: 'DATA_UUID_INVALID' });
  });

  it('DATA-14 two rows with the same id are refused by the database', async () => {
    const db = await open([Thing]);
    const id = uuid7();
    await runInUnitOfWork(db, async (em) => {
      em.create(Thing, { id, name: 'first' });
      await em.flush();
    });
    await expect(
      runInUnitOfWork(db, async (em) => {
        em.create(Thing, { id, name: 'second' });
        await em.flush();
      }),
    ).rejects.toThrow(/unique|duplicate|constraint|primary/i);
  });
});

describeDialects('DATA-04 UTC timestamps', ({ dialect, open }) => {
  const instant = new Date('2026-11-22T10:00:00.000Z');

  it('DATA-04 a Date comes back as the same instant', async () => {
    const db = await open([Thing]);
    const id = await runInUnitOfWork(db, async (em) => {
      const row = em.create(Thing, { name: 'time', at: instant });
      await em.flush();
      return row.id;
    });
    const loaded = await runInUnitOfWork(db, (em) => em.findOneOrFail(Thing, { id }));
    expect(loaded.at?.toISOString()).toBe('2026-11-22T10:00:00.000Z');
  });

  it('DATA-04 the stored value is the UTC clock time, whatever the time zone of the process or the server', async () => {
    const db = await open([Thing]);
    await runInUnitOfWork(db, async (em) => {
      em.create(Thing, { name: 'utc', at: instant });
      await em.flush();
    });
    const expression =
      dialect === 'postgres'
        ? `to_char(at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')`
        : dialect === 'mysql'
          ? `date_format(at, '%Y-%m-%d %H:%i:%s')`
          : `strftime('%Y-%m-%d %H:%M:%S', at / 1000, 'unixepoch')`;
    const [row] = await rows(db, `select ${expression} as utc from things`);
    expect(String(row?.['utc'])).toBe('2026-11-22 10:00:00');
  });
});

describeDialects('DATA-05 transactions and units of work', ({ open }) => {
  it('DATA-05 a transaction that fails stores nothing', async () => {
    const db = await open([Thing]);
    await expect(
      runInUnitOfWork(db, (em) =>
        em.transactional(async (inner) => {
          inner.create(Thing, { name: 'rolled back' });
          await inner.flush();
          throw new Error('stop');
        }),
      ),
    ).rejects.toThrow('stop');
    expect(await runInUnitOfWork(db, (em) => em.count(Thing))).toBe(0);
  });

  it('DATA-05 a transaction that succeeds stores everything', async () => {
    const db = await open([Thing]);
    await runInUnitOfWork(db, (em) =>
      em.transactional(async (inner) => {
        inner.create(Thing, { name: 'a' });
        inner.create(Thing, { name: 'b' });
      }),
    );
    expect(await runInUnitOfWork(db, (em) => em.count(Thing))).toBe(2);
  });

  it('DATA-05 concurrent units of work write without sharing state', async () => {
    const db = await open([Thing]);
    await Promise.all(
      Array.from({ length: 8 }, (_, n) =>
        runInUnitOfWork(db, async (em) => {
          em.create(Thing, { name: `writer ${n}` });
          await em.flush();
        }),
      ),
    );
    expect(await runInUnitOfWork(db, (em) => em.count(Thing))).toBe(8);
  });
});
