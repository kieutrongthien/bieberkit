/**
 * BieberKit
 *
 * @file        packages/data/src/orm/sqlite.test.ts
 * @description Tests for the SQLite dialect: WAL, busy timeout and BEGIN IMMEDIATE write transactions (DATA-23, ADR 0008).
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql, SqliteDialect } from 'kysely';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDialect } from './sqlite.ts';

let dir = '';
const opened: Kysely<unknown>[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bk-sqlite-'));
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.destroy()));
  rmSync(dir, { recursive: true, force: true });
});

function open(file: string, busyTimeoutMs = 5000): Kysely<unknown> {
  const db = new Kysely<unknown>({ dialect: createSqliteDialect(file, { busyTimeoutMs }) });
  opened.push(db);
  return db;
}

/** The stock dialect of Kysely, which starts a plain `begin`: the behavior DATA-23 replaces. */
function openStock(file: string): Kysely<unknown> {
  const db = new Kysely<unknown>({ dialect: new SqliteDialect({ database: new Database(file, { timeout: 50 }) }) });
  opened.push(db);
  return db;
}

async function pragma(db: Kysely<unknown>, name: string): Promise<unknown> {
  const { rows } = await sql<Record<string, unknown>>`${sql.raw(`pragma ${name}`)}`.execute(db);
  return Object.values(rows[0] ?? {})[0];
}

describe('DATA-23 connection settings', () => {
  it('DATA-23 a file database runs in WAL mode with synchronous NORMAL and the busy timeout', async () => {
    const db = open(join(dir, 'a.db'), 1234);
    expect(await pragma(db, 'journal_mode')).toBe('wal');
    expect(await pragma(db, 'synchronous')).toBe(1);
    expect(await pragma(db, 'busy_timeout')).toBe(1234);
  });

  it('DATA-23 the busy timeout defaults to 5 seconds', async () => {
    const db = new Kysely<unknown>({ dialect: createSqliteDialect(join(dir, 'b.db')) });
    opened.push(db);
    expect(await pragma(db, 'busy_timeout')).toBe(5000);
  });

  it('DATA-23 foreign keys are on, so the tenant foreign keys of DATA-20 are enforced', async () => {
    expect(await pragma(open(join(dir, 'c.db')), 'foreign_keys')).toBe(1);
  });

  it('DATA-23 an in-memory database works and keeps its own journal mode', async () => {
    const db = open(':memory:');
    expect(await pragma(db, 'journal_mode')).toBe('memory');
    await sql`create table t (id integer primary key)`.execute(db);
    await sql`insert into t values (1)`.execute(db);
    expect((await sql<{ n: number }>`select count(*) as n from t`.execute(db)).rows[0]?.n).toBe(1);
  });

  it('DATA-23 the setting survives a new connection to the same file', async () => {
    const file = join(dir, 'd.db');
    await pragma(open(file), 'journal_mode');
    expect(await pragma(open(file), 'journal_mode')).toBe('wal');
  });
});

async function prepare(file: string): Promise<void> {
  const db = open(file);
  await sql`create table t (id integer primary key, v integer not null)`.execute(db);
  await sql`insert into t values (1, 0)`.execute(db);
}

describe('DATA-23 BEGIN IMMEDIATE', () => {
  it('DATA-23 a write transaction takes the write lock when it starts, so a second writer waits at begin', async () => {
    const file = join(dir, 'e.db');
    await prepare(file);
    const first = open(file);
    const second = open(file, 50);
    let secondStarted = false;
    let failure: unknown;
    await first.transaction().execute(async (trx) => {
      await sql`select v from t where id = 1`.execute(trx);
      try {
        await second.transaction().execute(async () => {
          secondStarted = true;
        });
      } catch (error) {
        failure = error;
      }
    });
    expect(secondStarted).toBe(false);
    expect(String(failure)).toMatch(/SQLITE_BUSY|database is locked/i);
  });

  it('DATA-23 after the first transaction commits, the second one starts and sees the committed data', async () => {
    const file = join(dir, 'f.db');
    await prepare(file);
    const first = open(file);
    const second = open(file);
    await first.transaction().execute(async (trx) => {
      await sql`update t set v = v + 1 where id = 1`.execute(trx);
    });
    const seen = await second.transaction().execute(async (trx) => {
      const { rows } = await sql<{ v: number }>`select v from t where id = 1`.execute(trx);
      await sql`update t set v = v + 1 where id = 1`.execute(trx);
      return rows[0]?.v;
    });
    expect(seen).toBe(1);
    expect((await sql<{ v: number }>`select v from t`.execute(second)).rows[0]?.v).toBe(2);
  });

  it('DATA-23 a rolled back transaction releases the lock', async () => {
    const file = join(dir, 'g.db');
    await prepare(file);
    const first = open(file);
    const second = open(file, 50);
    await expect(
      first.transaction().execute(async (trx) => {
        await sql`update t set v = 99`.execute(trx);
        throw new Error('rollback please');
      }),
    ).rejects.toThrow('rollback please');
    await second.transaction().execute(async (trx) => {
      await sql`update t set v = 5`.execute(trx);
    });
    expect((await sql<{ v: number }>`select v from t`.execute(first)).rows[0]?.v).toBe(5);
  });

  it('DATA-23 the stock driver does not take the lock at begin, which is why it is replaced (control)', async () => {
    const file = join(dir, 'h.db');
    await prepare(file);
    const first = open(file);
    const second = openStock(file);
    let secondStarted = false;
    await first.transaction().execute(async (trx) => {
      await sql`select v from t where id = 1`.execute(trx);
      await second
        .transaction()
        .execute(async (other) => {
          secondStarted = true;
          await sql`select v from t where id = 1`.execute(other);
        })
        .catch(() => undefined);
    });
    expect(secondStarted).toBe(true);
  });
});
