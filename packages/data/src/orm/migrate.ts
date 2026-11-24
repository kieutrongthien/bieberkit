/**
 * BieberKit
 *
 * @file        packages/data/src/orm/migrate.ts
 * @description Project migrations over MikroORM's migrator: snapshot diff per dialect, make, up, down, status and the refusal of destructive statements (DATA-08, DATA-25).
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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { EntitySchema } from '@mikro-orm/core';
import { createLogger } from '@bieberkit/core';
import type { Dialect, Logger } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { detectDestructive, upStatementsOfMigration } from '../migrations/destructive.ts';
import type { DestructiveFinding } from '../migrations/destructive.ts';
import { migrationFileName } from '../migrations/names.ts';
import type { PluginMigrationStep } from '../migrations/steps.ts';
import { initOrm, resolveConnection } from './connect.ts';
import { kyselyOf } from './internals.ts';
import { withMigrationLock } from './migration-lock.ts';
import type { MigrationLockOptions } from './migration-lock.ts';
import { pluginMigrationStatus, runPluginMigrations } from './plugin-migrate.ts';
import type { PluginRun, PluginRunOptions, PluginStatus } from './plugin-migrate.ts';

/** The keys of `CoreEnv` that the migrate role reads. Only this role reads `MIGRATE_DATABASE_URL` (DATA-25). */
export interface MigrationEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly MIGRATE_DATABASE_URL: string | undefined;
  readonly DB_POOL_MAX: number;
}

export interface MigratorOptions {
  /** The compiled entities of the project. The snapshot is compared with them. */
  readonly entities: readonly EntitySchema[];
  /** The folder of the migration files and of the snapshots. Keep it in version control. */
  readonly directory: string;
  readonly logger?: Logger;
  /** How the lock of the migrate role behaves. The defaults suit a deploy. A test shortens them. */
  readonly lock?: MigrationLockOptions;
}

export interface MadeMigration {
  /** The file name without its extension, which is also the name in the table of executed migrations. */
  readonly name: string;
  readonly path: string;
  readonly up: readonly string[];
  readonly down: readonly string[];
  readonly destructive: readonly DestructiveFinding[];
}

export interface MigrationStatus {
  readonly executed: string[];
  readonly pending: string[];
}

export interface UpOptions {
  /** Runs migrations that drop, rename or narrow something. Only the contract release says so (DATA-08). */
  readonly allowDestructive?: boolean;
}

export interface Migrator {
  readonly dialect: Dialect;
  /** Writes the migration for the difference between the entities and the snapshot, or returns `null` when there is none. */
  make(name?: string): Promise<MadeMigration | null>;
  /** Runs the pending migrations, oldest first, and returns their names. A destructive one stops all of them first. */
  up(options?: UpOptions): Promise<string[]>;
  /** Rolls back the last executed migration. */
  down(): Promise<string[]>;
  status(): Promise<MigrationStatus>;
  /** Runs the pending steps of the plugins over the connection of the migrate role (DATA-24). */
  runPluginSteps(steps: readonly PluginMigrationStep[], options: PluginRunOptions): Promise<PluginRun>;
  /** What the ledger of the plugin steps says, without running anything. */
  pluginStatus(steps: readonly PluginMigrationStep[], pluginOrder: readonly string[]): Promise<PluginStatus>;
  close(): Promise<void>;
}

const EXTENSION = /\.(?:ts|js|cjs)$/;

function nameOf(file: string): string {
  return basename(file).replace(EXTENSION, '');
}

/**
 * Connects as the migrate role and returns the migrator. The diff is always the entities against the snapshot in `directory`,
 * never against the live database (ADR 0008), so every machine makes the same file. Run it in the migrate role only, once per deploy.
 */
export async function openMigrator(env: MigrationEnv, options: MigratorOptions): Promise<Migrator> {
  if (env.MIGRATE_DATABASE_URL === undefined || env.MIGRATE_DATABASE_URL === '') {
    throw dataError(
      'DATA_MIGRATE_CONNECTION_MISSING',
      500,
      'MIGRATE_DATABASE_URL is not set.',
      'Set MIGRATE_DATABASE_URL to the role that owns the schema. The application role has no DDL rights (DATA-25).',
    );
  }
  const resolved = resolveConnection(
    {
      DB_CONNECTION: env.DB_CONNECTION,
      DATABASE_URL: env.MIGRATE_DATABASE_URL,
      DATABASE_READ_URLS: [],
      DB_POOL_MAX: env.DB_POOL_MAX,
    },
    'MIGRATE_DATABASE_URL',
  );
  const { directory } = options;
  const logger = options.logger ?? createLogger({ level: 'info', role: 'migrate' });
  const snapshot = `.snapshot-${resolved.dialect}`;
  const { Migrator: MikroMigrator, TSMigrationGenerator } = await import('@mikro-orm/migrations');
  /** The file imports its base class from this package, so that a project needs no dependency on the ORM of its own. */
  class FileGenerator extends TSMigrationGenerator {
    override generateMigrationFile(className: string, diff: { up: string[]; down: string[] }): string {
      return super
        .generateMigrationFile(className, diff)
        .replace("'@mikro-orm/migrations'", "'@bieberkit/data/migration'");
    }
  }
  const orm = await initOrm(
    resolved,
    {
      entities: [...options.entities],
      forceUtcTimezone: true,
      allowGlobalContext: false,
      ensureDatabase: false,
      discovery: { warnWhenNoEntities: false },
      extensions: [MikroMigrator],
      migrations: {
        path: directory,
        pathTs: directory,
        glob: '!(*.d).{js,ts}',
        emit: 'ts',
        generator: FileGenerator,
        tableName: 'bieberkit_migrations',
        snapshot: true,
        snapshotName: snapshot,
        // The snapshot changes only when a migration is made, never from the live database.
        snapshotOnMigrate: false,
        transactional: true,
        allOrNothing: true,
        silent: true,
        fileName: (timestamp: string, name?: string) =>
          migrationFileName(timestamp, name, (candidate) => existsSync(join(directory, `${candidate}.ts`))),
      },
    },
    env.DB_POOL_MAX,
  );
  const migrator = orm.migrator;

  /** One run at a time on the database, whichever process it is (DATA-25). */
  const locked = async <T>(run: () => Promise<T>): Promise<T> =>
    withMigrationLock(await kyselyOf(orm.em), resolved.dialect, run, options.lock);

  const files = (): string[] =>
    existsSync(directory)
      ? readdirSync(directory).filter((file) => EXTENSION.test(file) && !file.endsWith('.d.ts'))
      : [];

  const status = async (): Promise<MigrationStatus> => ({
    executed: (await migrator.getExecuted()).map((row) => row.name).toSorted(),
    pending: (await migrator.getPending()).map((info) => info.name).toSorted(),
  });

  const runUp = async (upOptions: UpOptions): Promise<string[]> => {
    const pending = await migrator.getPending();
    if (upOptions.allowDestructive !== true) {
      const found: string[] = [];
      for (const info of pending.toSorted((a, b) => a.name.localeCompare(b.name))) {
        if (info.path === undefined) continue;
        const findings = detectDestructive(upStatementsOfMigration(readFileSync(info.path, 'utf8')));
        for (const finding of findings) found.push(`${info.name}: ${finding.kind}: ${finding.statement}`);
      }
      if (found.length > 0) {
        throw dataError(
          'DATA_MIGRATION_DESTRUCTIVE',
          409,
          `No migration ran, because these statements drop, rename or narrow something:\n${found.join('\n')}`,
          'Split the change: add and fill in this release, remove in a later one (DATA-08). Pass allowDestructive in the contract release.',
        );
      }
    }
    const applied = (await migrator.up()).map((info) => info.name);
    for (const name of applied) logger.info('migration applied', { migration: name });
    return applied;
  };

  const runDown = async (): Promise<string[]> => {
    const reverted = (await migrator.down()).map((info) => info.name);
    for (const name of reverted) logger.warn('migration rolled back', { migration: name });
    return reverted;
  };

  return {
    dialect: resolved.dialect,
    async make(name) {
      const hasSnapshot = existsSync(join(directory, `${snapshot}.json`));
      if (!hasSnapshot && files().length > 0) {
        throw dataError(
          'DATA_MIGRATION_SNAPSHOT_MISSING',
          500,
          `${directory} has migrations but no ${snapshot}.json.`,
          'Restore the snapshot from version control. Without it the next migration would be made from the live database.',
        );
      }
      const result = hasSnapshot
        ? await migrator.create(undefined, false, false, name)
        : await migrator.create(undefined, false, true, name);
      if (result.diff.up.length === 0) return null;
      const made = nameOf(result.fileName);
      logger.info('migration made', { migration: made });
      return {
        name: made,
        path: join(directory, `${made}.ts`),
        up: result.diff.up,
        down: result.diff.down,
        destructive: detectDestructive(result.diff.up),
      };
    },
    up: (upOptions = {}) => locked(() => runUp(upOptions)),
    down: () => locked(runDown),
    status,
    runPluginSteps: (steps, runOptions) =>
      locked(async () => runPluginMigrations(await kyselyOf(orm.em), resolved.dialect, steps, runOptions)),
    pluginStatus: async (steps, pluginOrder) => pluginMigrationStatus(await kyselyOf(orm.em), steps, pluginOrder),
    close: () => orm.close(),
  };
}
