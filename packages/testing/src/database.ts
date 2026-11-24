/**
 * BieberKit
 *
 * @file        packages/testing/src/database.ts
 * @description A database for a test with the framework tables, the auth tables and the tables of the entities, made the way a deploy makes them, and the helper that runs a suite on every dialect (TST-02, TST-03).
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

/* oxlint-disable vitest/no-conditional-tests, vitest/expect-expect, vitest/no-disabled-tests -- `describeDialects` is a helper that registers suites: which suites there are depends on the servers that the run has, and a dialect without one is a skipped suite on purpose. */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, inject, it } from 'vitest';
import { DIALECTS } from '@bieberkit/core';
import type { Dialect } from '@bieberkit/core';
import { AUTH_PLUGIN, authEntities, authMigrationSteps } from '@bieberkit/auth';
import { applyPluginMigrations, createDatabase, DATA_PLUGIN, dataMigrationSteps } from '@bieberkit/data/orm';
import type { Database, DatabaseOptions, OrmSchema } from '@bieberkit/data/orm';

declare module 'vitest' {
  export interface ProvidedContext {
    dialectUrls: { postgres: string; mysql: string; require: string };
  }
}

/** Makes a new database for one test, with the tables of `entities`. The app that gets it closes it. */
export type OpenDatabase = (
  entities: readonly OrmSchema[],
  options?: Pick<DatabaseOptions, 'queryLog'>,
) => Promise<Database>;

export interface DialectContext {
  readonly dialect: Dialect;
  /** A new database for this test on the dialect. It is closed after the test and dropped after the suite. */
  readonly open: OpenDatabase;
}

const ENV_NAME = { postgres: 'DATABASE_URL_POSTGRES', mysql: 'DATABASE_URL_MYSQL' } as const;
// A memory database exists for one connection, so SQLite gets one.
const env = (url: string, dialect: Dialect) =>
  ({
    DB_CONNECTION: dialect,
    DATABASE_URL: url,
    DATABASE_READ_URLS: [],
    DB_POOL_MAX: dialect === 'sqlite' ? 1 : 5,
  }) as const;
/** The tables that the migration steps make, which the schema must not make a second time. */
const STEP_TABLES =
  /\bbk_(?:auth_|audit_log|migration|plugin_migrations|outbox|sequences|comments|attachments|timeline|tags|jobs|locks)/;

/** Opens the database at `url` and makes its tables: the steps of the framework and of auth, then the tables of the entities. */
async function prepare(
  url: string,
  dialect: Dialect,
  entities: readonly OrmSchema[],
  options: Pick<DatabaseOptions, 'queryLog'>,
): Promise<Database> {
  const database = await createDatabase(env(url, dialect), {
    entities: [...entities, ...authEntities],
    audit: 'table',
    ...options,
  });
  await applyPluginMigrations(database, [...dataMigrationSteps, ...authMigrationSteps], {
    pluginOrder: [DATA_PLUGIN, AUTH_PLUGIN],
  });
  const ddl = await database.orm.schema.getCreateSchemaSQL();
  const own = ddl
    .split(';')
    .map((text) => text.trim())
    .filter((text) => text !== '' && !STEP_TABLES.test(text));
  for (const text of own) await database.orm.em.getConnection().execute(text);
  return database;
}

/** The default database of a test app: SQLite in memory, one connection, gone when the app closes. */
export const openMemoryDatabase: OpenDatabase = (entities, options = {}) =>
  prepare(':memory:', 'sqlite', entities, options);

async function provision(dialect: 'postgres' | 'mysql', serverUrl: string) {
  const name = `bk_test_${randomBytes(6).toString('hex')}`;
  const admin = await createDatabase(env(serverUrl, dialect), { entities: [] });
  const connection = admin.orm.em.getConnection();
  await connection.execute(
    dialect === 'postgres' ? `create database "${name}"` : `create database \`${name}\` character set utf8mb4`,
  );
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      await connection.execute(
        dialect === 'postgres' ? `drop database "${name}" with (force)` : `drop database \`${name}\``,
      );
      await admin.close();
    },
  };
}

/**
 * Like `describe` for every dialect: SQLite always, PostgreSQL and MySQL when `dialectUrls` is provided by the vitest config
 * (`provide`). With `BK_REQUIRE_DIALECTS=all` a missing URL fails the run instead of skipping, so CI cannot pass by testing one
 * database (TST-03). The servers are the containers that `tools/test-services.sh` starts, or the ones of the `services` of CI.
 */
export function describeDialects(name: string, suite: (context: DialectContext) => void): void {
  const urls = inject('dialectUrls');
  for (const dialect of DIALECTS) {
    const serverUrl = dialect === 'sqlite' ? '' : urls[dialect];
    if (dialect !== 'sqlite' && serverUrl === '') {
      if (urls.require === 'all') {
        describe(`${name} on ${dialect}`, () => {
          it(`has a database to run on (set ${ENV_NAME[dialect]})`, () => {
            throw new Error(`${ENV_NAME[dialect]} is not set, and BK_REQUIRE_DIALECTS=all needs every dialect.`);
          });
        });
      } else {
        describe.skip(`${name} on ${dialect} (set ${ENV_NAME[dialect]} to run it)`, () => {
          it('skipped', () => undefined);
        });
      }
      continue;
    }
    describe(`${name} on ${dialect}`, () => {
      const cleanups: (() => Promise<void>)[] = [];
      // A database is closed at the end of its test, so a long suite never holds hundreds of connections.
      const closers: (() => Promise<void>)[] = [];
      afterEach(async () => {
        for (const close of closers.splice(0)) await close();
      });
      afterAll(async () => {
        for (const cleanup of cleanups.toReversed()) await cleanup();
      });
      const open: OpenDatabase = async (entities, options = {}) => {
        let url: string;
        if (dialect === 'sqlite') {
          const dir = mkdtempSync(join(tmpdir(), 'bk-test-'));
          cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
          url = join(dir, 'test.db');
        } else {
          const created = await provision(dialect, serverUrl);
          cleanups.push(created.drop);
          url = created.url;
        }
        const database = await prepare(url, dialect, entities, options);
        closers.push(() => database.close());
        return database;
      };
      suite({ dialect, open });
    });
  }
}
