/**
 * BieberKit
 *
 * @file        packages/data/src/orm/plugin-migrate.ts
 * @description The runner of plugin migration steps: the ledger, the order, the same deploy guard and a transaction per step (DATA-08, DATA-24, DATA-27).
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

import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { orderSteps, stepName, validateSteps } from '../migrations/steps.ts';
import type { PluginMigrationStep, StepDatabase } from '../migrations/steps.ts';

const LEDGER = 'bieberkit_plugin_migrations';

export interface PluginRefusal {
  /** `plugin/id` */
  readonly step: string;
  readonly code: string;
  readonly message: string;
}

export interface PluginRun {
  readonly deployId: string;
  /** Steps that ran, in order. */
  readonly applied: string[];
  /** Steps that were refused. The run exits with a failure when this is not empty. */
  readonly refused: PluginRefusal[];
  /** Steps that did not run because an earlier step of their plugin was refused. */
  readonly waiting: string[];
}

export interface PluginRunOptions {
  /** The plugins in boot order, from the resolver. Steps run in this order. */
  readonly pluginOrder: readonly string[];
  /** Names this run. Every step that it applies carries it in the ledger. A new one is made when omitted. */
  readonly deployId?: string;
}

async function ensureLedger(db: Kysely<StepDatabase>): Promise<void> {
  await db.schema
    .createTable(LEDGER)
    .ifNotExists()
    .addColumn('plugin', 'varchar(120)', (c) => c.notNull())
    .addColumn('step_id', 'varchar(120)', (c) => c.notNull())
    .addColumn('version', 'varchar(20)', (c) => c.notNull())
    .addColumn('kind', 'varchar(10)', (c) => c.notNull())
    .addColumn('applied_at', 'bigint', (c) => c.notNull())
    .addColumn('deploy_id', 'varchar(40)', (c) => c.notNull())
    .addPrimaryKeyConstraint(`${LEDGER}_pk`, ['plugin', 'step_id'])
    .execute();
}

/** The number of rows that break a foreign key. Zero when the database is consistent. */
async function violations(db: Kysely<StepDatabase>): Promise<number> {
  const { rows } = await sql`pragma foreign_key_check`.execute(db);
  return rows.length;
}

async function apply(
  db: Kysely<StepDatabase>,
  dialect: Dialect,
  step: PluginMigrationStep,
  deployId: string,
): Promise<void> {
  const sqlite = dialect === 'sqlite';
  // The pragma has no effect inside a transaction, so it is set around it (DATA-27).
  if (sqlite) await sql`pragma foreign_keys = off`.execute(db);
  try {
    await db.transaction().execute(async (trx) => {
      const before = sqlite ? await violations(trx) : 0;
      await step.up(trx, dialect);
      if (sqlite && (await violations(trx)) > before) {
        throw dataError(
          'DATA_MIGRATION_STEP_FAILED',
          500,
          'The step left rows that break a foreign key.',
          'Fill or remove the rows that point nowhere.',
        );
      }
      await trx
        .insertInto(LEDGER)
        .values({
          plugin: step.plugin,
          step_id: step.id,
          version: step.version,
          kind: step.kind,
          applied_at: Date.now(),
          deploy_id: deployId,
        })
        .execute();
    });
  } catch (error) {
    throw dataError(
      'DATA_MIGRATION_STEP_FAILED',
      500,
      `The step ${stepName(step)} failed, and the steps after it did not run.`,
      'Fix the step and run migrate again. Steps before it stay applied. MySQL cannot roll back DDL, so check what it changed first.',
      error,
    );
  } finally {
    if (sqlite) await sql`pragma foreign_keys = on`.execute(db);
  }
}

/**
 * Runs the pending steps of the plugins (DATA-24). Each step runs in its own transaction together with its ledger row, so a failed
 * step leaves no row, and the run stops there with `DATA_MIGRATION_STEP_FAILED`. A contract step whose expand step ran in the
 * same deploy is refused with `PLG_CONTRACT_SAME_DEPLOY`, and the later steps of that plugin wait (DATA-08). Other plugins go on.
 */
export async function runPluginMigrations(
  db: Kysely<StepDatabase>,
  dialect: Dialect,
  steps: readonly PluginMigrationStep[],
  options: PluginRunOptions,
): Promise<PluginRun> {
  validateSteps(steps, options.pluginOrder);
  const deployId = options.deployId ?? randomUUID();
  if (deployId === '' || deployId.length > 40) {
    throw dataError(
      'DATA_MIGRATION_STEP_INVALID',
      500,
      'The deploy id must have 1 to 40 characters.',
      'Use a short id, such as the id of the release.',
    );
  }
  await ensureLedger(db);
  const rows = await db.selectFrom(LEDGER).select(['plugin', 'step_id', 'deploy_id']).execute();
  const ledger = new Map(
    rows.map((row) => [`${String(row['plugin'])}/${String(row['step_id'])}`, String(row['deploy_id'])]),
  );
  const run: PluginRun = { deployId, applied: [], refused: [], waiting: [] };
  const blocked = new Set<string>();
  for (const step of orderSteps(steps, options.pluginOrder)) {
    const name = stepName(step);
    if (ledger.has(name)) continue;
    if (blocked.has(step.plugin)) {
      run.waiting.push(name);
      continue;
    }
    if (
      step.kind === 'contract' &&
      step.after !== undefined &&
      ledger.get(`${step.plugin}/${step.after}`) === deployId
    ) {
      run.refused.push({
        step: name,
        code: 'PLG_CONTRACT_SAME_DEPLOY',
        message: `${name} finishes ${step.plugin}/${step.after}, which ran in this deploy. Run it in the next deploy, so that the old version of the code is gone first.`,
      });
      blocked.add(step.plugin);
      continue;
    }
    await apply(db, dialect, step, deployId);
    ledger.set(name, deployId);
    run.applied.push(name);
  }
  return run;
}
