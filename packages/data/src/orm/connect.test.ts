/**
 * BieberKit
 *
 * @file        packages/data/src/orm/connect.test.ts
 * @description Tests for the database URL rules, createDatabase and the unit of work (DATA-04, DATA-05, DATA-23).
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
import { afterEach, describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { uuid7 } from '../keys/uuid7.ts';
import { createDatabase, currentEntityManager, resolveConnection, runInUnitOfWork } from './connect.ts';
import type { Database, DatabaseEnv } from './connect.ts';
import { Uuid7Type } from './uuid7-type.ts';

const base: DatabaseEnv = {
  DB_CONNECTION: undefined,
  DATABASE_URL: undefined,
  DATABASE_READ_URLS: [],
  DB_POOL_MAX: 10,
};
const withUrl = (url: string, patch: Partial<DatabaseEnv> = {}): DatabaseEnv => ({
  ...base,
  DATABASE_URL: url,
  ...patch,
});

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'NOT_A_BKERROR';
  }
  return undefined;
}

function failureOf(run: () => unknown): DataError {
  try {
    run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

describe('DATA connection: the dialect and location come from DATABASE_URL', () => {
  it.each([
    ['postgres://u:p@localhost:5432/app', 'postgres', 'postgres://u:p@localhost:5432/app'],
    ['postgresql://u:p@localhost/app', 'postgres', 'postgresql://u:p@localhost/app'],
    ['mysql://u:p@localhost:3306/app', 'mysql', 'mysql://u:p@localhost:3306/app'],
    ['mariadb://u:p@localhost/app', 'mysql', 'mariadb://u:p@localhost/app'],
    [':memory:', 'sqlite', ':memory:'],
    ['sqlite::memory:', 'sqlite', ':memory:'],
    ['sqlite:./data/app.db', 'sqlite', './data/app.db'],
    ['sqlite:///var/lib/app.db', 'sqlite', '/var/lib/app.db'],
    ['file:./data/app.db', 'sqlite', './data/app.db'],
    ['./data/app.db', 'sqlite', './data/app.db'],
    ['/var/lib/app.sqlite', 'sqlite', '/var/lib/app.sqlite'],
  ] as const)('DATA connection %s is %s at %s', (url, dialect, location) => {
    expect(resolveConnection(withUrl(url))).toEqual({ dialect, location, readLocations: [] });
  });

  it('DATA connection DB_CONNECTION may repeat what the URL says', () => {
    expect(resolveConnection(withUrl('postgres://localhost/app', { DB_CONNECTION: 'postgres' })).dialect).toBe(
      'postgres',
    );
    expect(resolveConnection(withUrl(':memory:', { DB_CONNECTION: 'sqlite' })).dialect).toBe('sqlite');
  });

  it('DATA connection a DB_CONNECTION that disagrees with the URL is DATA_DIALECT_MISMATCH', () => {
    expect(codeOf(() => resolveConnection(withUrl('postgres://localhost/app', { DB_CONNECTION: 'mysql' })))).toBe(
      'DATA_DIALECT_MISMATCH',
    );
    expect(codeOf(() => resolveConnection(withUrl(':memory:', { DB_CONNECTION: 'postgres' })))).toBe(
      'DATA_DIALECT_MISMATCH',
    );
  });

  it.each([[undefined], ['']])('DATA connection a missing URL (%j) is DATA_CONNECTION_MISSING', (url) => {
    expect(codeOf(() => resolveConnection({ ...base, DATABASE_URL: url, DB_CONNECTION: 'postgres' }))).toBe(
      'DATA_CONNECTION_MISSING',
    );
    expect(codeOf(() => resolveConnection({ ...base, DATABASE_URL: url }))).toBe('DATA_CONNECTION_MISSING');
  });

  it.each([['redis://localhost'], ['http://localhost/db'], ['mongodb://localhost/x'], ['oracle://localhost/x']])(
    'DATA connection %s is DATA_CONNECTION_INVALID',
    (url) => {
      expect(codeOf(() => resolveConnection(withUrl(url)))).toBe('DATA_CONNECTION_INVALID');
    },
  );

  it.each([
    ['redis://user:hunter2@localhost', 'mysql'],
    ['postgres://user:hunter2@localhost/app', 'mysql'],
  ] as const)('DATA connection an error for %s never repeats the URL, which holds the password', (url, wrong) => {
    const error = failureOf(() => resolveConnection(withUrl(url, { DB_CONNECTION: wrong })));
    expect(`${error.message}\n${error.fix}`).not.toContain('hunter2');
  });

  it('DATA connection read replicas must use the same dialect as the primary', () => {
    const resolved = resolveConnection(
      withUrl('postgres://p/app', { DATABASE_READ_URLS: ['postgres://r1/app', 'postgresql://r2/app'] }),
    );
    expect(resolved.readLocations).toEqual(['postgres://r1/app', 'postgresql://r2/app']);
    expect(
      codeOf(() => resolveConnection(withUrl('postgres://p/app', { DATABASE_READ_URLS: ['mysql://r/app'] }))),
    ).toBe('DATA_DIALECT_MISMATCH');
  });

  it('DATA connection SQLite has one file, so read replicas are refused', () => {
    expect(codeOf(() => resolveConnection(withUrl(':memory:', { DATABASE_READ_URLS: ['./other.db'] })))).toBe(
      'DATA_REPLICAS_UNSUPPORTED',
    );
  });
});

const Thing = new EntitySchema<{ id: string; name: string; at?: Date }>({
  name: 'Thing',
  tableName: 'things',
  properties: {
    id: { type: Uuid7Type, primary: true, onCreate: () => uuid7() },
    name: { type: 'string', length: 100 },
    at: { type: 'datetime', nullable: true },
  },
});

let db: Database | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function sqlite(): Promise<Database> {
  db = await createDatabase(withUrl(':memory:'), { entities: [Thing] });
  await db.orm.schema.create();
  return db;
}

describe('DATA connection createDatabase on SQLite', () => {
  it('DATA connection reports its dialect and gives each caller a fork', async () => {
    const database = await sqlite();
    expect(database.dialect).toBe('sqlite');
    expect(database.fork()).not.toBe(database.fork());
  });

  it('DATA-05 refuses the global EntityManager, so no request can share an identity map by accident', async () => {
    const database = await sqlite();
    await expect(database.orm.em.find(Thing, {})).rejects.toThrow(/global EntityManager/i);
  });

  it('DATA connection close releases the pool, and a second close is harmless', async () => {
    const database = await sqlite();
    await database.close();
    await expect(database.close()).resolves.toBeUndefined();
    db = undefined;
  });
});

describe('DATA-05 runInUnitOfWork', () => {
  it('DATA-05 gives the function its own EntityManager and finds it again through currentEntityManager', async () => {
    const database = await sqlite();
    expect(currentEntityManager()).toBeUndefined();
    await runInUnitOfWork(database, async (em) => {
      expect(currentEntityManager()).toBe(em);
    });
    expect(currentEntityManager()).toBeUndefined();
  });

  it('DATA-05 two concurrent units of work never share an identity map', async () => {
    const database = await sqlite();
    const id = await runInUnitOfWork(database, async (em) => {
      const row = em.create(Thing, { name: 'shared' });
      await em.flush();
      return row.id;
    });
    const loaded = await Promise.all(
      [1, 2].map((n) =>
        runInUnitOfWork(database, async (em) => {
          await new Promise((resolve) => setTimeout(resolve, n));
          const row = await em.findOneOrFail(Thing, { id });
          row.name = `edited by ${n}`;
          return { em, row, seen: currentEntityManager() };
        }),
      ),
    );
    expect(loaded[0]?.em).not.toBe(loaded[1]?.em);
    expect(loaded[0]?.row).not.toBe(loaded[1]?.row);
    expect(loaded[0]?.seen).toBe(loaded[0]?.em);
    expect(loaded[1]?.seen).toBe(loaded[1]?.em);
    expect(loaded[0]?.row.name).toBe('edited by 1');
    expect(loaded[1]?.row.name).toBe('edited by 2');
  });

  it('DATA-05 a change that is not flushed does not leak into the next unit of work', async () => {
    const database = await sqlite();
    const id = await runInUnitOfWork(database, async (em) => {
      const row = em.create(Thing, { name: 'before' });
      await em.flush();
      return row.id;
    });
    await runInUnitOfWork(database, async (em) => {
      (await em.findOneOrFail(Thing, { id })).name = 'never flushed';
    });
    const name = await runInUnitOfWork(database, async (em) => (await em.findOneOrFail(Thing, { id })).name);
    expect(name).toBe('before');
  });

  it('DATA-05 returns the value of the function and passes its error on', async () => {
    const database = await sqlite();
    await expect(runInUnitOfWork(database, async () => 42)).resolves.toBe(42);
    await expect(
      runInUnitOfWork(database, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(currentEntityManager()).toBeUndefined();
  });
});
