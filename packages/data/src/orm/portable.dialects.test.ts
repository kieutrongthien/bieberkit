/**
 * BieberKit
 *
 * @file        packages/data/src/orm/portable.dialects.test.ts
 * @description Tests of the portable schema helpers for plugin steps, uuidType and setNotNull, on every dialect (DATA-24, DATA-27).
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

import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { describeDialects } from '../testing/dialects.ts';
import { kyselyOf } from './internals.ts';
import { setNotNull, uuidType } from './portable.ts';

type Db = Kysely<Record<string, Record<string, unknown>>>;

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

async function columnType(db: Db, dialect: Dialect, table: string, column: string): Promise<string> {
  if (dialect === 'sqlite') {
    const { rows } = await sql<{
      name: string;
      type: string;
    }>`select name, type from pragma_table_info(${table})`.execute(db);
    return String(rows.find((row) => row.name === column)?.type).toLowerCase();
  }
  if (dialect === 'postgres') {
    const { rows } = await sql<{
      t: string;
    }>`select data_type as t from information_schema.columns where table_name = ${table} and column_name = ${column}`.execute(
      db,
    );
    return String(rows[0]?.t);
  }
  const { rows } = await sql<{
    t: string;
    len: number | null;
  }>`select data_type as t, character_maximum_length as len from information_schema.columns where table_name = ${table} and column_name = ${column} and table_schema = database()`.execute(
    db,
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return `${String(row?.['t'] ?? row?.['T'])}(${String(row?.['len'] ?? row?.['LEN'])})`;
}

describeDialects('DATA-24 portable schema helpers', ({ dialect, open }) => {
  async function connect(): Promise<Db> {
    const db = await open([]);
    return kyselyOf(db.orm.em);
  }

  it('DATA-24 uuidType is the same native column type as Uuid7Type', async () => {
    const db = await connect();
    await db.schema
      .createTable('plugin_things')
      .addColumn('id', uuidType(dialect), (c) => c.primaryKey())
      .execute();
    const expected: Readonly<Record<Dialect, string>> = { postgres: 'uuid', mysql: 'binary(16)', sqlite: 'blob' };
    expect(await columnType(db, dialect, 'plugin_things', 'id')).toBe(expected[dialect]);
  });

  it('DATA-24 setNotNull makes a filled column required and keeps its rows', async () => {
    const db = await connect();
    await sql`create table notes (id varchar(36) primary key, body varchar(50))`.execute(db);
    await sql`insert into notes (id, body) values ('a', 'kept')`.execute(db);
    await db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', 'body', 'varchar(50)'));
    const { rows } = await sql<{ body: string }>`select body from notes`.execute(db);
    expect(rows).toEqual([{ body: 'kept' }]);
    expect(await failureOf(() => sql`insert into notes (id, body) values ('b', null)`.execute(db))).toBeDefined();
  });

  it('DATA-24 setNotNull fails while a row is still null, and changes nothing', async () => {
    const db = await connect();
    await sql`create table notes (id varchar(36) primary key, body varchar(50))`.execute(db);
    await sql`insert into notes (id, body) values ('a', null)`.execute(db);
    await failureOf(() => db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', 'body', 'varchar(50)')));
    const { rows } = await sql<{ id: string }>`select id from notes`.execute(db);
    expect(rows).toEqual([{ id: 'a' }]);
    await sql`insert into notes (id, body) values ('b', null)`.execute(db);
  });

  it.each(['notes; drop table x', 'no tes', '1notes', ''])(
    'DATA-24 setNotNull refuses the table name %j',
    async (table) => {
      const db = await connect();
      const error = await failureOf(() =>
        db.transaction().execute((trx) => setNotNull(trx, dialect, table, 'body', 'text')),
      );
      expect(error).toBeInstanceOf(DataError);
      expect(error).toMatchObject({ code: 'DATA_IDENTIFIER_INVALID' });
    },
  );

  it.each(['body; --', 'a b', ''])('DATA-24 setNotNull refuses the column name %j', async (column) => {
    const db = await connect();
    const error = await failureOf(() =>
      db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', column, 'text')),
    );
    expect(error).toMatchObject({ code: 'DATA_IDENTIFIER_INVALID' });
  });

  it('DATA-24 setNotNull refuses a column type that carries more than a type', async () => {
    const db = await connect();
    const error = await failureOf(() =>
      db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', 'body', 'text; drop table notes')),
    );
    expect(error).toMatchObject({ code: 'DATA_IDENTIFIER_INVALID' });
  });

  it.runIf(dialect === 'sqlite')('DATA-24 setNotNull says so when the table or the column is not there', async () => {
    const db = await connect();
    await sql`create table notes (id text primary key, body text)`.execute(db);
    expect(
      await failureOf(() => db.transaction().execute((trx) => setNotNull(trx, dialect, 'missing', 'body', 'text'))),
    ).toMatchObject({ code: 'DATA_IDENTIFIER_INVALID' });
    expect(
      await failureOf(() => db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', 'missing', 'text'))),
    ).toMatchObject({ code: 'DATA_IDENTIFIER_INVALID' });
  });

  it.runIf(dialect === 'sqlite')('DATA-24 setNotNull leaves a column that is already required alone', async () => {
    const db = await connect();
    await sql`create table notes (id text primary key, body text not null)`.execute(db);
    const before = await sql<{ sql: string }>`select sql from sqlite_master where name = 'notes'`.execute(db);
    await db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', 'body', 'text'));
    const after = await sql<{ sql: string }>`select sql from sqlite_master where name = 'notes'`.execute(db);
    expect(after.rows).toEqual(before.rows);
  });

  it.runIf(dialect === 'sqlite')(
    'DATA-27 the SQLite rebuild keeps defaults, checks, keys, unique constraints and indexes',
    async () => {
      const db = await connect();
      await sql`create table notes (
      id text primary key,
      parent_id text references notes (id),
      body text,
      tag text not null default 'x' check (length(tag) < 5),
      unique (tag, body)
    )`.execute(db);
      await sql`create index notes_tag_index on notes (tag)`.execute(db);
      await sql`insert into notes (id, body) values ('a', 'one')`.execute(db);
      await sql`pragma foreign_keys = off`.execute(db);
      await db.transaction().execute((trx) => setNotNull(trx, dialect, 'notes', 'body', 'text'));
      await sql`pragma foreign_keys = on`.execute(db);

      const { rows: objects } = await sql<{
        name: string;
      }>`select name from sqlite_master where tbl_name = 'notes' and type = 'index' and sql is not null`.execute(db);
      expect(objects.map((o) => o.name)).toContain('notes_tag_index');
      const { rows: keys } = await sql<{ table: string }>`select "table" from pragma_foreign_key_list('notes')`.execute(
        db,
      );
      expect(keys).toEqual([{ table: 'notes' }]);
      const { rows: stored } = await sql<{ tag: string }>`select tag from notes`.execute(db);
      expect(stored).toEqual([{ tag: 'x' }]);
      expect(
        await failureOf(() => sql`insert into notes (id, body, tag) values ('b', 'two', 'toolong')`.execute(db)),
      ).toBeDefined();
      expect(await failureOf(() => sql`insert into notes (id, body) values ('c', 'one')`.execute(db))).toBeDefined();
      expect(await failureOf(() => sql`insert into notes (id, body) values ('d', null)`.execute(db))).toBeDefined();
    },
  );
});
