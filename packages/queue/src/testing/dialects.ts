/**
 * BieberKit
 *
 * @file        packages/queue/src/testing/dialects.ts
 * @description Test helper: runs a suite on SQLite, PostgreSQL and MySQL, each test with a database whose framework and queue tables come from the migration steps (until @bieberkit/testing exists).
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
import { afterAll, afterEach, describe, inject, it } from 'vitest';
import { DIALECTS } from '@bieberkit/core';
import type { Dialect } from '@bieberkit/core';
import { applyPluginMigrations, createDatabase, DATA_PLUGIN, dataMigrationSteps } from '@bieberkit/data/orm';
import type { Database, DatabaseOptions, OrmSchema } from '@bieberkit/data/orm';
import { QUEUE_PLUGIN, queueMigrationSteps } from '../tables.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    dialectUrls: { postgres: string; mysql: string; require: string };
  }
}

export interface QueueDialectContext {
  readonly dialect: Dialect;
  /**
   * A new database for this test. The framework tables and the auth tables are made by their migration steps, the way a deploy
   * makes them, and the tables of `entities` come from the schema. It is closed after the test and dropped after the suite.
   */
  readonly open: (entities: readonly OrmSchema[], options?: Pick<DatabaseOptions, 'queryLog'>) => Promise<Database>;
  /** The connection URL (or the file) of a database that `open` made, for a test that needs a connection of its own. */
  readonly urlOf: (database: Database) => string;
}

const ENV_NAME = { postgres: 'DATABASE_URL_POSTGRES', mysql: 'DATABASE_URL_MYSQL' } as const;
const env = (url: string, dialect: Dialect) =>
  ({ DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 5 }) as const;
const STEP_TABLES = /bieberkit_|audit_log|\bbk_jobs|\bbk_locks/;

async function provision(dialect: 'postgres' | 'mysql', serverUrl: string) {
  const name = `bk_queue_${randomBytes(6).toString('hex')}`;
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

/** Like `describe` for every dialect. PostgreSQL and MySQL run when their URLs are set, and `BK_REQUIRE_DIALECTS=all` makes a missing one fail. */
export function describeDialects(name: string, suite: (context: QueueDialectContext) => void): void {
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
      const closers: (() => Promise<void>)[] = [];
      const urlsOf = new WeakMap<Database, string>();
      afterEach(async () => {
        for (const close of closers.splice(0)) await close();
      });
      afterAll(async () => {
        for (const cleanup of cleanups.toReversed()) await cleanup();
      });
      const make = async (
        entities: readonly OrmSchema[],
        options: Pick<DatabaseOptions, 'queryLog'> = {},
      ): Promise<Database> => {
        let url: string;
        if (dialect === 'sqlite') {
          const dir = mkdtempSync(join(tmpdir(), 'bk-queue-'));
          cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
          url = join(dir, 'test.db');
        } else {
          const created = await provision(dialect, serverUrl);
          cleanups.push(created.drop);
          url = created.url;
        }
        const database = await createDatabase(env(url, dialect), {
          entities,
          audit: 'table',
          ...options,
        });
        closers.push(() => database.close());
        urlsOf.set(database, url);
        await applyPluginMigrations(database, [...dataMigrationSteps, ...queueMigrationSteps], {
          pluginOrder: [DATA_PLUGIN, QUEUE_PLUGIN],
        });
        const ddl = await database.orm.schema.getCreateSchemaSQL();
        const own = ddl
          .split(';')
          .map((text) => text.trim())
          .filter((text) => text !== '' && !STEP_TABLES.test(text));
        for (const text of own) await database.orm.em.getConnection().execute(text);
        return database;
      };
      suite({ dialect, open: make, urlOf: (database) => urlsOf.get(database) ?? '' });
    });
  }
}
