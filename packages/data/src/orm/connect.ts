/**
 * BieberKit
 *
 * @file        packages/data/src/orm/connect.ts
 * @description Connecting to PostgreSQL, MySQL or SQLite from validated config, and one unit of work per request or job (DATA-04, DATA-05).
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

import { AsyncLocalStorage } from 'node:async_hooks';
import type { EntityManager, EntitySchema, IDatabaseDriver, MikroORM } from '@mikro-orm/core';
import type { Dialect } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { createSqliteDialect } from './sqlite.ts';

/** The keys of `CoreEnv` that this module reads. Core validates them, so nothing here reads `process.env` (P8). */
export interface DatabaseEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_READ_URLS: readonly string[];
  readonly DB_POOL_MAX: number;
}

export interface DatabaseOptions {
  readonly entities: readonly EntitySchema[];
}

/** The MikroORM instance, whichever driver it runs on. */
export type Orm = MikroORM<IDatabaseDriver, EntityManager, readonly EntitySchema[]>;

export interface Database {
  readonly dialect: Dialect;
  readonly orm: Orm;
  /** A new EntityManager with an empty identity map. Use `runInUnitOfWork` for a request or a job. */
  fork(): EntityManager;
  close(): Promise<void>;
}

export interface ResolvedConnection {
  readonly dialect: Dialect;
  /** A connection URL for PostgreSQL and MySQL, a file path or `:memory:` for SQLite. */
  readonly location: string;
  readonly readLocations: readonly string[];
}

const SCHEMES: Readonly<Record<string, Dialect>> = {
  'postgres:': 'postgres',
  'postgresql:': 'postgres',
  'mysql:': 'mysql',
  'mariadb:': 'mysql',
};

interface Located {
  readonly dialect: Dialect;
  readonly location: string;
}

/** Reads one connection string. The messages never repeat it, because it holds a password. */
function locate(url: string, name: string): Located {
  if (url === ':memory:' || url === 'sqlite::memory:') return { dialect: 'sqlite', location: ':memory:' };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined || (scheme.length === 1 && /^[a-z]$/.test(scheme)))
    return { dialect: 'sqlite', location: url };
  const known = SCHEMES[`${scheme}:`];
  if (known !== undefined) return { dialect: known, location: url };
  if (scheme === 'sqlite' || scheme === 'file') {
    const path = url.slice(scheme.length + 1);
    return { dialect: 'sqlite', location: path.startsWith('//') ? path.slice(2) : path };
  }
  throw dataError(
    'DATA_CONNECTION_INVALID',
    500,
    `${name} does not start with a supported scheme.`,
    'Start it with postgres://, mysql:// or sqlite:, or use a file path for SQLite.',
  );
}

/** Picks the dialect and location from validated config. `DB_CONNECTION` may repeat what the URL says, never contradict it. */
export function resolveConnection(env: DatabaseEnv): ResolvedConnection {
  if (env.DATABASE_URL === undefined || env.DATABASE_URL === '') {
    throw dataError(
      'DATA_CONNECTION_MISSING',
      500,
      'DATABASE_URL is not set.',
      'Set DATABASE_URL, for example postgres://user:password@localhost:5432/app.',
    );
  }
  const primary = locate(env.DATABASE_URL, 'DATABASE_URL');
  if (env.DB_CONNECTION !== undefined && env.DB_CONNECTION !== primary.dialect) {
    throw dataError(
      'DATA_DIALECT_MISMATCH',
      500,
      `DB_CONNECTION is ${env.DB_CONNECTION}, but DATABASE_URL points at ${primary.dialect}.`,
      'Make DB_CONNECTION and the scheme of DATABASE_URL name the same database.',
    );
  }
  if (env.DATABASE_READ_URLS.length > 0 && primary.dialect === 'sqlite') {
    throw dataError(
      'DATA_REPLICAS_UNSUPPORTED',
      500,
      'SQLite has one file, so DATABASE_READ_URLS cannot be used.',
      'Remove DATABASE_READ_URLS, or use PostgreSQL or MySQL.',
    );
  }
  const readLocations = env.DATABASE_READ_URLS.map((url) => {
    const replica = locate(url, 'DATABASE_READ_URLS');
    if (replica.dialect !== primary.dialect) {
      throw dataError(
        'DATA_DIALECT_MISMATCH',
        500,
        `A read replica points at ${replica.dialect}, but DATABASE_URL points at ${primary.dialect}.`,
        'Point every URL in DATABASE_READ_URLS at the same kind of database as DATABASE_URL.',
      );
    }
    return replica.location;
  });
  return { dialect: primary.dialect, location: primary.location, readLocations };
}

/**
 * Connects and returns the database. Every dialect runs in UTC, and the global EntityManager is switched off, so a request
 * can only reach the database through its own fork (DATA-04, DATA-05). Only the driver of the chosen dialect is loaded.
 */
export async function createDatabase(env: DatabaseEnv, options: DatabaseOptions): Promise<Database> {
  const resolved = resolveConnection(env);
  const common = {
    entities: [...options.entities],
    forceUtcTimezone: true,
    allowGlobalContext: false,
    ensureDatabase: false,
    discovery: { warnWhenNoEntities: false },
  } as const;
  const pool = { min: 0, max: env.DB_POOL_MAX };
  const replicas = resolved.readLocations.map((clientUrl) => ({ clientUrl }));

  let orm: Orm;
  if (resolved.dialect === 'sqlite') {
    const { MikroORM: Orm, SqliteDriver } = await import('@mikro-orm/sqlite');
    orm = await Orm.init({
      ...common,
      driver: SqliteDriver,
      dbName: resolved.location,
      driverOptions: createSqliteDialect(resolved.location),
    });
  } else if (resolved.dialect === 'postgres') {
    const { MikroORM: Orm, PostgreSqlDriver } = await import('@mikro-orm/postgresql');
    orm = await Orm.init({ ...common, driver: PostgreSqlDriver, clientUrl: resolved.location, pool, replicas });
  } else {
    const { MikroORM: Orm, MySqlDriver } = await import('@mikro-orm/mysql');
    orm = await Orm.init({ ...common, driver: MySqlDriver, clientUrl: resolved.location, pool, replicas });
  }
  return {
    dialect: resolved.dialect,
    orm,
    fork: () => orm.em.fork(),
    close: () => orm.close(),
  };
}

const current = new AsyncLocalStorage<EntityManager>();

/** The EntityManager of the unit of work that is running, or `undefined` outside one. */
export function currentEntityManager(): EntityManager | undefined {
  return current.getStore();
}

/** Runs `fn` with its own EntityManager, for one request or one job. Two units of work never share an identity map (DATA-05). */
export function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T> {
  const em = db.fork();
  return current.run(em, () => fn(em));
}
