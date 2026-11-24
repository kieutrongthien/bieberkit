/**
 * BieberKit
 *
 * @file        packages/queue/src/tables.ts
 * @description The tables of the database driver of the queue, as migration steps of the plugin @bieberkit/queue: the jobs and the locks of the scheduler (Q-05, Q-07).
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

import { sql } from 'kysely';
import type { PluginMigrationStep } from '@bieberkit/data';

/** The name of this package in the ledger of plugin steps. */
export const QUEUE_PLUGIN = '@bieberkit/queue';

/** The channel of PostgreSQL on which a job that is added is announced (`pg_notify`, `LISTEN`). */
export const WAKE_CHANNEL: string = 'bk_jobs';

export const JOBS_TABLE = 'bk_jobs';
export const LOCKS_TABLE = 'bk_locks';

function step(id: string, up: PluginMigrationStep['up'], version = '0.1.0'): PluginMigrationStep {
  return { plugin: QUEUE_PLUGIN, version, id, kind: 'expand', up };
}

/**
 * The jobs and the locks (version 0.1.0). Ids and times are plain text and numbers (epoch milliseconds), so the same statements work
 * on every dialect and with the Kysely of the outbox dispatcher, which hands its transaction to the publisher.
 */
export const queueMigrationSteps: readonly PluginMigrationStep[] = [
  step('jobs-create', async (trx) => {
    await trx.schema
      .createTable(JOBS_TABLE)
      .addColumn('id', 'varchar(36)', (c) => c.notNull())
      .addColumn('job_id', 'varchar(255)', (c) => c.notNull())
      .addColumn('queue', 'varchar(16)', (c) => c.notNull())
      .addColumn('name', 'varchar(200)', (c) => c.notNull())
      .addColumn('input', 'text', (c) => c.notNull())
      .addColumn('tenant_id', 'varchar(36)')
      .addColumn('user_id', 'varchar(36)')
      .addColumn('request_id', 'varchar(64)')
      .addColumn('status', 'varchar(10)', (c) => c.notNull())
      .addColumn('attempts', 'integer', (c) => c.notNull())
      .addColumn('max_attempts', 'integer', (c) => c.notNull())
      .addColumn('available_at', 'bigint', (c) => c.notNull())
      .addColumn('locked_by', 'varchar(64)')
      .addColumn('locked_until', 'bigint')
      .addColumn('last_error', 'text')
      .addColumn('created_at', 'bigint', (c) => c.notNull())
      .addColumn('finished_at', 'bigint')
      .addPrimaryKeyConstraint('bk_jobs_pkey', ['id'])
      .addUniqueConstraint('bk_jobs_job_id_unique', ['job_id'])
      .execute();
  }),
  step('jobs-claim-index', async (trx) => {
    await trx.schema
      .createIndex('bk_jobs_claim_index')
      .on(JOBS_TABLE)
      .columns(['status', 'queue', 'available_at'])
      .execute();
  }),
  step('locks-create', async (trx) => {
    await trx.schema
      .createTable(LOCKS_TABLE)
      .addColumn('name', 'varchar(200)', (c) => c.notNull())
      .addColumn('owner', 'varchar(64)', (c) => c.notNull())
      .addColumn('until', 'bigint', (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_locks_pkey', ['name'])
      .execute();
  }),
  // Version 0.2.0: what a job answered. MySQL needs MEDIUMTEXT, because TEXT is 64 KB and the answer of a bulk call is more.
  step(
    'jobs-result',
    async (trx, dialect) => {
      await trx.schema
        .alterTable(JOBS_TABLE)
        .addColumn('result', dialect === 'mysql' ? sql`mediumtext` : 'text')
        .execute();
    },
    '0.2.0',
  ),
  // Also 0.2.0: the input of a job. MySQL's TEXT is 64 KB, and a bulk call of 500 rows with a patch can come near it. A job takes up to 1 MiB.
  step(
    'jobs-input-wide',
    async (trx, dialect) => {
      if (dialect === 'mysql')
        await sql`alter table ${sql.table(JOBS_TABLE)} modify ${sql.ref('input')} mediumtext not null`.execute(trx);
    },
    '0.2.0',
  ),
];
