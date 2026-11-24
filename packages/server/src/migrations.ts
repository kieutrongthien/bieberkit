/**
 * BieberKit
 *
 * @file        packages/server/src/migrations.ts
 * @description The migrate commands over a project: the steps of the framework and of the plugins, then the migration files of the project, under one lock, on the connection of the migrate role (DATA-08, DATA-24, DATA-25).
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

import { join } from 'node:path';
import { AUTH_PLUGIN, authMigrationSteps } from '@bieberkit/auth';
import { createLogger, loadEnv } from '@bieberkit/core';
import type { CoreEnv, EnvSource } from '@bieberkit/core';
import type { EntityDef, PluginMigrationStep } from '@bieberkit/data';
import { compileEntities, DATA_PLUGIN, dataMigrationSteps, openMigrator } from '@bieberkit/data/orm';
import type { MadeMigration, Migrator, PluginRun } from '@bieberkit/data/orm';
import { QUEUE_PLUGIN, queueMigrationSteps } from '@bieberkit/queue';
import { ServerError } from './errors.ts';
import { allModules, contributed } from './modules.ts';
import { envOwnersOf, loadProject } from './project.ts';

/** The folder of the migration files and of the snapshots, in version control (spec section 9.3). */
export const MIGRATIONS_DIR = 'migrations';

export interface MigrationsOptions {
  /** The directory to start the search for the project from. Defaults to the working directory. */
  readonly cwd?: string;
  /** The variables to read. Without it, the real environment (core reads it, P8). */
  readonly env?: EnvSource;
  /** Names this run in the ledger of the steps. A new id is made when omitted. */
  readonly deployId?: string;
}

/** The steps of the framework, then of the plugins, and the plugins in the order that they run. */
export function stepsOf(
  env: Pick<CoreEnv, 'QUEUE_DRIVER'>,
  pluginSteps: readonly PluginMigrationStep[],
  plugins: readonly string[],
): { steps: PluginMigrationStep[]; order: string[] } {
  const steps: PluginMigrationStep[] = [...dataMigrationSteps, ...authMigrationSteps];
  const order = [DATA_PLUGIN, AUTH_PLUGIN];
  if (env.QUEUE_DRIVER === 'database') {
    steps.push(...queueMigrationSteps);
    order.push(QUEUE_PLUGIN);
  }
  steps.push(...pluginSteps);
  order.push(...plugins);
  return { steps, order };
}

interface Opened {
  readonly migrator: Migrator;
  readonly steps: readonly PluginMigrationStep[];
  readonly order: readonly string[];
  readonly deployId: string | undefined;
}

async function withMigrator<T>(options: MigrationsOptions, run: (opened: Opened) => Promise<T>): Promise<T> {
  const project = await loadProject(options.cwd ?? process.cwd());
  const modules = await allModules(project);
  const { env } = loadEnv({
    ...(options.env === undefined ? {} : { source: options.env }),
    envFile: join(project.root, '.env'),
    extra: envOwnersOf(project),
  });
  const entities = contributed<EntityDef<string>>(modules, 'entities');
  const migrator = await openMigrator(env, {
    entities: compileEntities(entities),
    directory: join(project.root, MIGRATIONS_DIR),
    logger: createLogger({ level: env.LOG_LEVEL, role: 'migrate' }),
  });
  try {
    const { steps, order } = stepsOf(
      env,
      contributed<PluginMigrationStep>(modules, 'migrations'),
      project.plugins.map(({ def }) => def.name),
    );
    return await run({ migrator, steps, order, deployId: options.deployId });
  } finally {
    await migrator.close();
  }
}

/** Writes the migration for what the entities changed since the snapshot, or answers `null` when nothing changed. */
export function makeMigration(options: MigrationsOptions & { readonly name?: string }): Promise<MadeMigration | null> {
  return withMigrator(options, ({ migrator }) => migrator.make(options.name));
}

export interface RunMigrationsOptions extends MigrationsOptions {
  /** Runs migrations that drop, rename or narrow something. Only the contract release says so (DATA-08). */
  readonly allowDestructive?: boolean;
}

export interface MigrationsRun {
  readonly steps: PluginRun;
  /** The names of the files that ran. */
  readonly migrations: readonly string[];
}

/**
 * What the migrate role does (section 7.1): the steps of the framework and of the plugins, then the files of the project, all under
 * the lock of DATA-25 and on `MIGRATE_DATABASE_URL`. A refused step stops the run before the files.
 */
export function runMigrations(options: RunMigrationsOptions = {}): Promise<MigrationsRun> {
  return withMigrator(options, async ({ migrator, steps, order, deployId }) => {
    const run = await migrator.runPluginSteps(steps, {
      pluginOrder: order,
      ...(deployId === undefined ? {} : { deployId }),
    });
    if (run.refused.length > 0) {
      throw new ServerError(
        `${run.refused.length} migration step(s) were refused:\n${run.refused.map((item) => `${item.step}: ${item.message}`).join('\n')}`,
        {
          code: 'BK_MIGRATE_REFUSED',
          fix: 'Split a destructive step from the release that adds the code that needs it, and run the contract step in a later deploy (DATA-08).',
        },
      );
    }
    const migrations = await migrator.up(
      options.allowDestructive === undefined ? {} : { allowDestructive: options.allowDestructive },
    );
    return { steps: run, migrations };
  });
}

/** Rolls back the last migration file of the project. The steps of plugins are never rolled back: they only go forward (DATA-24). */
export function rollbackMigration(options: MigrationsOptions = {}): Promise<string[]> {
  return withMigrator(options, ({ migrator }) => migrator.down());
}

export interface MigrationsStatus {
  readonly executed: readonly string[];
  readonly pending: readonly string[];
  readonly steps: { readonly applied: readonly string[]; readonly pending: readonly string[] };
}

export function migrationStatus(options: MigrationsOptions = {}): Promise<MigrationsStatus> {
  return withMigrator(options, async ({ migrator, steps, order }) => ({
    ...(await migrator.status()),
    steps: await migrator.pluginStatus(steps, order),
  }));
}
