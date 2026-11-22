/**
 * BieberKit
 *
 * @file        packages/data/src/testing/dialects.ts
 * @description Test support: runs a suite on SQLite always, and on PostgreSQL and MySQL when their URLs are provided (spec 9.1).
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

import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntitySchema } from '@mikro-orm/core';
import { DIALECTS } from '@bieberkit/core';
import type { Dialect } from '@bieberkit/core';
import { afterAll, afterEach, describe, inject, it } from 'vitest';
import { createDatabase } from '../orm/connect.ts';
import { DATA_PLUGIN, dataMigrationSteps } from '../orm/framework.ts';
import { kyselyOf } from '../orm/internals.ts';
import { runPluginMigrations } from '../orm/plugin-migrate.ts';
import type { Database, DatabaseOptions } from '../orm/connect.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    dialectUrls: { postgres: string; mysql: string; require: string };
  }
}

export interface DialectContext {
  readonly dialect: Dialect;
  /** A new, empty database that is dropped after the suite: its connection URL (a file path on SQLite), and nothing created in it. */
  readonly emptyDatabase: () => Promise<{ readonly dialect: Dialect; readonly url: string }>;
  /**
   * Like `open`, but the framework tables (outbox, processed ids, audit log) are made by `dataMigrationSteps`, the way a deploy
   * makes them, and only the tables of `entities` come from the schema. So a test sees the tables that production has.
   */
  readonly openFramework: (
    entities?: readonly EntitySchema[],
    options?: Omit<DatabaseOptions, 'entities'>,
  ) => Promise<Database>;
  /**
   * Opens a database of its own for this suite: a temporary file on SQLite, a new database on the server for PostgreSQL
   * and MySQL. The schema of `entities` is created. Everything is closed and dropped after the suite.
   */
  readonly open: (entities: readonly EntitySchema[], options?: Omit<DatabaseOptions, 'entities'>) => Promise<Database>;
}

const ENV_NAME: Readonly<Record<Exclude<Dialect, 'sqlite'>, string>> = {
  postgres: 'DATABASE_URL_POSTGRES',
  mysql: 'DATABASE_URL_MYSQL',
};

function env(url: string, dialect: Dialect) {
  return { DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 5 } as const;
}

async function provision(
  dialect: Exclude<Dialect, 'sqlite'>,
  serverUrl: string,
): Promise<{ url: string; drop: () => Promise<void> }> {
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
 * `describe` for every dialect. SQLite always runs. PostgreSQL and MySQL run when `DATABASE_URL_POSTGRES` and
 * `DATABASE_URL_MYSQL` are set, and are shown as skipped otherwise. With `BK_REQUIRE_DIALECTS=all` a missing URL fails
 * the run instead, so CI cannot pass without the databases.
 */
export function describeDialects(name: string, suite: (context: DialectContext) => void): void {
  const urls = inject('dialectUrls');
  for (const dialect of DIALECTS) {
    const title = `${name} on ${dialect}`;
    const serverUrl = dialect === 'sqlite' ? '' : urls[dialect];
    if (dialect !== 'sqlite' && serverUrl === '') {
      if (urls.require === 'all') {
        describe(title, () => {
          it(`has a database to run on (set ${ENV_NAME[dialect]})`, () => {
            throw new Error(`${ENV_NAME[dialect]} is not set, and BK_REQUIRE_DIALECTS=all needs every dialect.`);
          });
        });
      } else {
        describe.skip(`${title} (set ${ENV_NAME[dialect]} to run it)`, () => {
          it('skipped', () => undefined);
        });
      }
      continue;
    }
    describe(title, () => {
      const cleanups: (() => Promise<void>)[] = [];
      // A database is closed at the end of its test, so a long suite never holds hundreds of connections (PostgreSQL stops at 100).
      const closers: (() => Promise<void>)[] = [];
      afterEach(async () => {
        for (const close of closers.splice(0)) await close();
      });
      afterAll(async () => {
        for (const cleanup of cleanups.toReversed()) await cleanup();
      });
      const context: DialectContext = {
        dialect,
        emptyDatabase: async () => {
          if (dialect === 'sqlite') {
            const dir = mkdtempSync(join(tmpdir(), 'bk-dialect-'));
            cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
            return { dialect, url: join(dir, 'test.db') };
          }
          const created = await provision(dialect, serverUrl);
          cleanups.push(created.drop);
          return { dialect, url: created.url };
        },
        openFramework: async (entities = [], options = {}) => {
          const { url } = await context.emptyDatabase();
          const database = await createDatabase(env(url, dialect), { ...options, entities });
          closers.push(() => database.close());
          await runPluginMigrations(await kyselyOf(database.orm.em), dialect, dataMigrationSteps, {
            pluginOrder: [DATA_PLUGIN],
          });
          // The tables of the project come from the schema. The framework tables are already there, made by the steps.
          const ddl = await database.orm.schema.getCreateSchemaSQL();
          const own = ddl
            .split(';')
            .map((text) => text.trim())
            .filter((text) => text !== '' && !/bieberkit_outbox|audit_log|bieberkit_sequences/.test(text));
          for (const text of own) await database.orm.em.getConnection().execute(text);
          return database;
        },
        open: async (entities, options = {}) => {
          const { url } = await context.emptyDatabase();
          const database = await createDatabase(env(url, dialect), { ...options, entities });
          closers.push(() => database.close());
          await database.orm.schema.create();
          return database;
        },
      };
      suite(context);
    });
  }
}
