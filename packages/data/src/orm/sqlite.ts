/**
 * BieberKit
 *
 * @file        packages/data/src/orm/sqlite.ts
 * @description The SQLite dialect for Kysely and MikroORM: WAL, a busy timeout and write transactions that start with BEGIN IMMEDIATE (DATA-23, ADR 0008).
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

import Database from 'better-sqlite3';
import { CompiledQuery, SqliteDialect, SqliteDriver } from 'kysely';
import type { DatabaseConnection, Driver } from 'kysely';

export interface SqliteOptions {
  /** How long a writer waits for the write lock before it fails with `SQLITE_BUSY`. Defaults to 5000. */
  readonly busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/**
 * The stock driver starts a plain `begin`, which takes no lock. A transaction that reads and then writes after another
 * connection committed fails at once with `SQLITE_BUSY_SNAPSHOT`, and cannot be retried by waiting. `begin immediate` takes
 * the write lock first, so a second writer waits (up to the busy timeout) at the start instead (ADR 0008, decision 6).
 */
class ImmediateSqliteDriver extends SqliteDriver {
  override async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin immediate'));
  }
}

class ImmediateSqliteDialect extends SqliteDialect {
  readonly #database: () => Promise<Database.Database>;

  constructor(database: () => Promise<Database.Database>) {
    super({ database });
    this.#database = database;
  }

  override createDriver(): Driver {
    return new ImmediateSqliteDriver({ database: this.#database });
  }
}

/**
 * A Kysely dialect over `better-sqlite3` for a file path or `:memory:`. A file runs in WAL mode with `synchronous = NORMAL`,
 * so web, worker and scheduler processes can share it (DATA-23). Foreign keys are switched on here as well as by MikroORM.
 */
export function createSqliteDialect(location: string, options: SqliteOptions = {}): SqliteDialect {
  const busyTimeout = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  return new ImmediateSqliteDialect(async () => {
    const database = new Database(location, { timeout: busyTimeout });
    database.pragma(`busy_timeout = ${busyTimeout}`);
    if (location !== ':memory:') {
      database.pragma('journal_mode = WAL');
      database.pragma('synchronous = NORMAL');
    }
    database.pragma('foreign_keys = ON');
    return database;
  });
}
