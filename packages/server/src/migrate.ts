/**
 * BieberKit
 *
 * @file        packages/server/src/migrate.ts
 * @description Makes the tables of a database: the steps of the framework, of auth and of the queue, and in development the tables of the entities (section 6, step 10).
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

import { AUTH_PLUGIN, authMigrationSteps } from '@bieberkit/auth';
import type { CoreEnv } from '@bieberkit/core';
import type { PluginMigrationStep } from '@bieberkit/data';
import { applyPluginMigrations, DATA_PLUGIN, dataMigrationSteps } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { QUEUE_PLUGIN, queueMigrationSteps } from '@bieberkit/queue';
import { ServerError } from './errors.ts';

/** The tables that the steps make. The schema of the entities must not make them a second time. */
const STEP_TABLES = /bieberkit_|audit_log|\bauth_|\bbk_jobs|\bbk_locks/;

export interface Migrated {
  /** The steps that were applied now. */
  readonly applied: readonly string[];
  /** The statements that made or changed the tables of the entities. */
  readonly statements: number;
}

/**
 * Applies the steps of the framework and, with the database queue, of the queue. In development it then adds what the entities need and
 * does nothing destructive (a column or a table is never dropped here). A production database gets its entity tables from the migrations
 * of the project, which the commands of the migrator run (M1.8).
 */
export async function migrate(db: Database, env: Pick<CoreEnv, 'APP_ENV' | 'QUEUE_DRIVER'>): Promise<Migrated> {
  const steps: PluginMigrationStep[] = [...dataMigrationSteps, ...authMigrationSteps];
  const order = [DATA_PLUGIN, AUTH_PLUGIN];
  if (env.QUEUE_DRIVER === 'database') {
    steps.push(...queueMigrationSteps);
    order.push(QUEUE_PLUGIN);
  }
  const run = await applyPluginMigrations(db, steps, { pluginOrder: order });
  if (run.refused.length > 0) {
    throw new ServerError(`${run.refused.length} migration step(s) were refused.`, {
      code: 'BK_MIGRATE_REFUSED',
      fix: 'Run bieberkit check migrations, and split a destructive step from the release that adds the code that needs it (DATA-08).',
    });
  }
  let statements = 0;
  if (env.APP_ENV !== 'production') {
    const sql = await db.orm.schema.getUpdateSchemaSQL({ safe: true, dropTables: false });
    for (const text of sql.split(';').map((part) => part.trim())) {
      if (text === '' || STEP_TABLES.test(text)) continue;
      await db.orm.em.getConnection().execute(text);
      statements += 1;
    }
  }
  return { applied: run.applied, statements };
}
