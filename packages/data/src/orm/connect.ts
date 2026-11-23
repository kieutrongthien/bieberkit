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
import { createLogger } from '@bieberkit/core';
import type { Dialect, Logger } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { auditTableSink } from './audit.ts';
import { BieberEntityManager } from './entity-manager.ts';
import { frameworkEntities } from './framework.ts';
import type { ReferenceVisibility } from './references.ts';
import { createSqliteDialect } from './sqlite.ts';
import { DataSubscriber } from './subscriber.ts';
import { openSystemScope } from './tenant.ts';
import type { AuditSink, SystemScopeEntry } from './tenant.ts';

/** The keys of `CoreEnv` that this module reads. Core validates them, so nothing here reads `process.env` (P8). */
export interface DatabaseEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_READ_URLS: readonly string[];
  readonly DB_POOL_MAX: number;
}

export interface DatabaseOptions {
  readonly entities: readonly EntitySchema[];
  /**
   * Where `asSystem` records its use (AUTHZ-05). `'table'` writes the audit log, which needs the framework tables (`dataMigrationSteps`).
   * Defaults to a `warn` line through `logger`, for a project that has not made them yet.
   */
  readonly audit?: AuditSink | 'table';
  /** The CASL read rule that decides which referenced ids a user may see (DATA-20). */
  readonly references?: ReferenceVisibility;
  readonly logger?: Logger;
  /** Receives the text of every query. For tests that count queries (PERF-04). */
  readonly queryLog?: (sql: string) => void;
}

/** The MikroORM instance, whichever driver it runs on. */
export type Orm = MikroORM<IDatabaseDriver, EntityManager, readonly EntitySchema[]>;

export interface Database {
  readonly dialect: Dialect;
  readonly orm: Orm;
  /** A new EntityManager with an empty identity map. Use `runInUnitOfWork` for a request or a job. */
  fork(): EntityManager;
  /**
   * Runs `fn` with the tenant filter switched off, after recording `reason` in the audit sink (DATA-09). A blank reason is refused,
   * and if the sink fails the scope does not start.
   */
  asSystem<T>(reason: string, fn: () => Promise<T>): Promise<T>;
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

/**
 * Picks the dialect and location from validated config. `DB_CONNECTION` may repeat what the URL says, never contradict it.
 * `variable` is the name that messages give to the URL, because the migrate role connects with `MIGRATE_DATABASE_URL`.
 */
export function resolveConnection(env: DatabaseEnv, variable = 'DATABASE_URL'): ResolvedConnection {
  if (env.DATABASE_URL === undefined || env.DATABASE_URL === '') {
    throw dataError(
      'DATA_CONNECTION_MISSING',
      500,
      `${variable} is not set.`,
      `Set ${variable}, for example postgres://user:password@localhost:5432/app.`,
    );
  }
  const primary = locate(env.DATABASE_URL, variable);
  if (env.DB_CONNECTION !== undefined && env.DB_CONNECTION !== primary.dialect) {
    throw dataError(
      'DATA_DIALECT_MISMATCH',
      500,
      `DB_CONNECTION is ${env.DB_CONNECTION}, but ${variable} points at ${primary.dialect}.`,
      `Make DB_CONNECTION and the scheme of ${variable} name the same database.`,
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

/** MikroORM logs `[query] sql [took 1 ms]`. The callback gets the sql only. */
function queryLogger(sink: (sql: string) => void): (message: string) => void {
  return (message) => {
    const match = /^\[query\]\s*([\s\S]*?)(?:\s*\[took [\s\S]*)?$/.exec(message);
    if (match?.[1] !== undefined) sink(match[1]);
  };
}

/** The settings of MikroORM that the dialects share. Everything else is chosen from the dialect in `initOrm`. */
export type CommonOrmSettings = Readonly<Record<string, unknown>>;

/**
 * Starts MikroORM on the driver of the dialect. Only that driver is loaded, so a SQLite project never imports `pg`.
 * MikroORM types its options per driver, and one settings object cannot be all of them, so the three calls are cast alike.
 */
export async function initOrm(resolved: ResolvedConnection, common: CommonOrmSettings, poolMax: number): Promise<Orm> {
  const pool = { min: 0, max: poolMax };
  const replicas = resolved.readLocations.map((clientUrl) => ({ clientUrl }));
  if (resolved.dialect === 'sqlite') {
    const { MikroORM: Orm, SqliteDriver } = await import('@mikro-orm/sqlite');
    const settings = {
      ...common,
      driver: SqliteDriver,
      dbName: resolved.location,
      driverOptions: createSqliteDialect(resolved.location),
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Orm.init(settings as never) as Promise<Orm>;
  }
  if (resolved.dialect === 'postgres') {
    const { MikroORM: Orm, PostgreSqlDriver } = await import('@mikro-orm/postgresql');
    const settings = { ...common, driver: PostgreSqlDriver, clientUrl: resolved.location, pool, replicas };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Orm.init(settings as never) as Promise<Orm>;
  }
  const { MikroORM: Orm, MySqlDriver } = await import('@mikro-orm/mysql');
  const settings = { ...common, driver: MySqlDriver, clientUrl: resolved.location, pool, replicas };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Orm.init(settings as never) as Promise<Orm>;
}

/**
 * Connects and returns the database. Every dialect runs in UTC, and the global EntityManager is switched off, so a request
 * can only reach the database through its own fork (DATA-04, DATA-05). Only the driver of the chosen dialect is loaded.
 */
export async function createDatabase(env: DatabaseEnv, options: DatabaseOptions): Promise<Database> {
  const resolved = resolveConnection(env);
  const common = {
    entities: [...options.entities, ...frameworkEntities],
    forceUtcTimezone: true,
    allowGlobalContext: false,
    ensureDatabase: false,
    discovery: { warnWhenNoEntities: false },
    // The class extends the EntityManager of every SQL driver, and MikroORM types it per driver.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    entityManager: BieberEntityManager as never,
    ...(options.queryLog === undefined
      ? {}
      : { debug: ['query'] as ['query'], colors: false, logger: queryLogger(options.queryLog) }),
    subscribers: [new DataSubscriber(options.references)],
  } as const;
  const orm = await initOrm(resolved, common, env.DB_POOL_MAX);
  const logger = options.logger ?? createLogger({ level: 'info', role: 'data' });
  const sink: AuditSink =
    options.audit === 'table'
      ? auditTableSink(orm)
      : (options.audit ?? {
          record: (entry: SystemScopeEntry) => logger.warn('tenant filter switched off', { ...entry }),
        });
  return {
    dialect: resolved.dialect,
    orm,
    fork: () => orm.em.fork(),
    asSystem: (reason, fn) => openSystemScope(reason, sink, fn),
    close: () => orm.close(),
  };
}

const current = new AsyncLocalStorage<EntityManager>();

/** The EntityManager of the unit of work that is running, or `undefined` outside one. */
export function currentEntityManager(): EntityManager | undefined {
  return current.getStore();
}

/**
 * Runs `fn` in a unit of work that is also a database transaction: it commits when `fn` returns and rolls back when it throws. The
 * ORM and every Kysely of `requestKysely` write in this one transaction. Only a service, or a boundary that stands for one (the
 * auth routes), opens a transaction (MOD-16).
 */
export function runInTransaction<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T> {
  return db.fork().transactional(async (em) => current.run(em, () => fn(em)));
}

/** Runs `fn` with its own EntityManager, for one request or one job. Two units of work never share an identity map (DATA-05). */
export function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T> {
  const em = db.fork();
  return current.run(em, () => fn(em));
}
