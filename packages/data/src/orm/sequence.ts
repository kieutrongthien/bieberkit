/**
 * BieberKit
 *
 * @file        packages/data/src/orm/sequence.ts
 * @description Sequences: the number pattern, the period of a counter and the atomic allocation inside the saving transaction (MOD-12).
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

import type { EntityManager } from '@mikro-orm/core';
import { SqlEntityManager } from '@mikro-orm/sql';
import { sql } from 'kysely';
import { dataError } from '../errors.ts';
import { isUuid, uuid7ToBytes } from '../keys/uuid7.ts';
import type { StepDatabase } from '../migrations/steps.ts';
import type { ResetEvery } from '../schema/fields.ts';
import { SEQUENCE_TABLE } from './framework.ts';

/** The tenant of a counter that no tenant owns, for an entity without `tenant: true`. */
export const NIL_TENANT = '00000000-0000-0000-0000-000000000000';

const SEQ = /\{seq:(\d+)\}/;

/** `PO-{yyyy}-{seq:5}` and 42 give `PO-2026-00042`. The date is read in UTC. A number longer than its width is not cut. */
export function formatSequence(pattern: string, value: number, now: Date = new Date()): string {
  const seq = SEQ.exec(pattern);
  if (seq === null) {
    throw dataError(
      'DATA_SEQUENCE_INVALID',
      500,
      `The pattern "${pattern}" has no {seq:N} token.`,
      "Use a pattern such as 'PO-{yyyy}-{seq:5}'.",
    );
  }
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return pattern
    .replace('{yyyy}', year)
    .replace('{yy}', year.slice(-2))
    .replace('{mm}', month)
    .replace(SEQ, String(value).padStart(Number(seq[1]), '0'));
}

/** The key that a counter restarts under: the year, the month or a dash. */
export function periodOf(resetEvery: ResetEvery | undefined, now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  if (resetEvery === 'year') return year;
  if (resetEvery === 'month') return `${year}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return '-';
}

export interface SequenceKey {
  /** The entity name, for example `billing.Invoice`. */
  readonly entity: string;
  /** The property that holds the number. */
  readonly field: string;
  /** The tenant of the counter. Without one the counter belongs to no tenant. */
  readonly tenantId?: string;
}

export interface SequenceOptions {
  readonly resetEvery?: ResetEvery;
  readonly now?: Date;
}

function dialectOf(em: SqlEntityManager): 'postgres' | 'mysql' | 'sqlite' {
  const name = em.getPlatform().constructor.name;
  if (name.includes('PostgreSql')) return 'postgres';
  if (name.includes('MySql') || name.includes('MariaDb')) return 'mysql';
  return 'sqlite';
}

/**
 * Takes the next number of a counter, and returns it. Call it inside the transaction that saves the row: the counter row is locked
 * until the commit, so writers queue, numbers have no gap, and a save that is rolled back gives its number back (MOD-12).
 * The first call of a tenant, name and period makes the row.
 */
export async function nextSequence(
  em: EntityManager,
  key: SequenceKey,
  options: SequenceOptions = {},
): Promise<number> {
  const tenant = (key.tenantId ?? NIL_TENANT).toLowerCase();
  if (!isUuid(tenant)) {
    throw dataError(
      'DATA_UUID_INVALID',
      400,
      `The tenant "${String(key.tenantId)}" is not a UUID.`,
      'Use the UUID of the tenant.',
    );
  }
  if (!(em instanceof SqlEntityManager)) {
    throw dataError(
      'DATA_DRIVER_UNSUPPORTED',
      500,
      'This database has no SQL query builder.',
      'Use PostgreSQL, MySQL or SQLite.',
    );
  }
  const dialect = dialectOf(em);
  const kysely = em.getKysely<StepDatabase>();
  const tenantValue = dialect === 'postgres' ? tenant : Buffer.from(uuid7ToBytes(tenant));
  const name = `${key.entity}.${key.field}`;
  const period = periodOf(options.resetEvery, options.now);

  // One statement takes the row: it makes it on the first use and raises it after that. Taking a shared lock first and a
  // exclusive one second deadlocks between writers on MySQL, and two statements cost a second round trip everywhere.
  if (dialect === 'mysql') {
    await kysely
      .insertInto(SEQUENCE_TABLE)
      .values({ tenant_id: tenantValue, name, period, value: sql`LAST_INSERT_ID(1)` })
      .onDuplicateKeyUpdate({ value: sql`LAST_INSERT_ID(value + 1)` })
      .execute();
    const { rows } = await sql<{ next: string | number }>`select LAST_INSERT_ID() as next`.execute(kysely);
    return Number(rows[0]?.next);
  }
  const row = await kysely
    .insertInto(SEQUENCE_TABLE)
    .values({ tenant_id: tenantValue, name, period, value: 1 })
    .onConflict((conflict) =>
      conflict
        .columns(['tenant_id', 'name', 'period'])
        .doUpdateSet((eb) => ({ value: eb('bk_sequences.value', '+', 1) })),
    )
    .returning('value')
    .executeTakeFirstOrThrow();
  return Number(row['value']);
}
