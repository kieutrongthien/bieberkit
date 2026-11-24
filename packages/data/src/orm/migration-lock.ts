/**
 * BieberKit
 *
 * @file        packages/data/src/orm/migration-lock.ts
 * @description The lock of the migrate role: one run of migrations at a time on every dialect, a second run waits, and a lease that ran out is taken over (DATA-25).
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
import type { Kysely } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import type { StepDatabase } from '../migrations/steps.ts';

export const MIGRATION_LOCK_TABLE = 'bk_migration_lock';
const LOCK_NAME = 'migrate';

export interface MigrationLockOptions {
  /** Who takes the lock. A new id when omitted. */
  readonly owner?: string;
  /** How long the lease lasts without a renewal. A run renews it while it works. Defaults to 5 minutes. */
  readonly ttlMs?: number;
  /** How long a second run waits for the first before it gives up. Defaults to 10 minutes. 0 gives up at once. */
  readonly waitMs?: number;
  /** How often a waiting run looks again. Defaults to 500 ms. */
  readonly pollMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureTable(kysely: Kysely<StepDatabase>): Promise<void> {
  const create = (): Promise<unknown> =>
    kysely.schema
      .createTable(MIGRATION_LOCK_TABLE)
      .ifNotExists()
      .addColumn('name', 'varchar(60)', (c) => c.notNull())
      .addColumn('owner', 'varchar(64)', (c) => c.notNull())
      .addColumn('until', 'bigint', (c) => c.notNull())
      .addPrimaryKeyConstraint(`${MIGRATION_LOCK_TABLE}_pk`, ['name'])
      .execute();
  try {
    await create();
  } catch (error) {
    // Two runs that start together can both try to make the table, and PostgreSQL fails one of them. It exists now, or this is a real error.
    try {
      await kysely.selectFrom(MIGRATION_LOCK_TABLE).select('owner').limit(1).execute();
    } catch {
      throw error;
    }
  }
}

async function take(kysely: Kysely<StepDatabase>, dialect: Dialect, owner: string, ttlMs: number): Promise<boolean> {
  const now = Date.now();
  const insert = kysely.insertInto(MIGRATION_LOCK_TABLE).values({ name: LOCK_NAME, owner, until: now + ttlMs });
  if (dialect === 'mysql') await insert.ignore().execute();
  else await insert.onConflict((conflict) => conflict.column('name').doNothing()).execute();
  await kysely
    .updateTable(MIGRATION_LOCK_TABLE)
    .set({ owner, until: now + ttlMs })
    .where('name', '=', LOCK_NAME)
    .where('until', '<', now)
    .execute();
  const row = await kysely
    .selectFrom(MIGRATION_LOCK_TABLE)
    .select('owner')
    .where('name', '=', LOCK_NAME)
    .executeTakeFirst();
  return row?.['owner'] === owner;
}

/**
 * Runs `run` while this process holds the migration lock (DATA-25). A row with a lease does it on every dialect and does not depend
 * on one connection, so a pool of any size works. The run renews the lease while it works, so a long migration is never taken over, and
 * a run that crashes leaves a lease that ends by itself. A second run waits up to `waitMs`, and then it finds the work done.
 */
export async function withMigrationLock<T>(
  kysely: Kysely<StepDatabase>,
  dialect: Dialect,
  run: () => Promise<T>,
  options: MigrationLockOptions = {},
): Promise<T> {
  const owner = options.owner ?? randomUUID();
  const ttlMs = options.ttlMs ?? 300_000;
  const waitMs = options.waitMs ?? 600_000;
  const pollMs = options.pollMs ?? 500;
  await ensureTable(kysely);
  const deadline = Date.now() + waitMs;
  while (!(await take(kysely, dialect, owner, ttlMs))) {
    if (Date.now() >= deadline) {
      throw dataError(
        'DATA_MIGRATE_LOCKED',
        409,
        'Another migrate run holds the lock.',
        `Wait for it to end. If no run is alive, its lease ends by itself within ${Math.ceil(ttlMs / 1000)} seconds, or delete the row "${LOCK_NAME}" of ${MIGRATION_LOCK_TABLE}.`,
      );
    }
    await sleep(pollMs);
  }
  const heartbeat = setInterval(
    () => {
      void kysely
        .updateTable(MIGRATION_LOCK_TABLE)
        .set({ until: Date.now() + ttlMs })
        .where('name', '=', LOCK_NAME)
        .where('owner', '=', owner)
        .execute()
        .catch(() => undefined);
    },
    Math.max(10, Math.floor(ttlMs / 3)),
  );
  try {
    return await run();
  } finally {
    clearInterval(heartbeat);
    await kysely
      .deleteFrom(MIGRATION_LOCK_TABLE)
      .where('name', '=', LOCK_NAME)
      .where('owner', '=', owner)
      .execute()
      .catch(() => undefined);
  }
}
