/**
 * BieberKit
 *
 * @file        packages/testing/src/plan.ts
 * @description Helpers to prove that a list query uses an index: the plan of a statement on each dialect, and the scans that it lists (OPS-05).
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

import type { Dialect } from '@bieberkit/core';
import type { Database } from '@bieberkit/data/orm';

const UUID = '00000000-0000-7000-8000-000000000001';

/**
 * Puts a literal where the query log left a placeholder (`?` or `$1`), because the log gives the text of a statement and not its
 * values. The literal follows the column that it is compared with, so that the planner and the type rules of the dialect accept it.
 */
export function withLiterals(statement: string): string {
  return statement.replaceAll(/\?|\$\d+/g, (_found, offset: number) => {
    const before = statement.slice(Math.max(0, offset - 80), offset);
    if (/limit\s*$/i.test(before)) return '26';
    if (/offset\s*$/i.test(before)) return '0';
    if (/\blike\s*$/i.test(before)) return "'x%'";
    if (/[`"]?(?:[a-z_]*(?:verified|enabled|system|restricted))[`"]?\s*=\s*$/i.test(before)) return 'true';
    if (/[`"]?(?:size|count|depth|version)[`"]?\s*(?:=|<|>|<=|>=)\s*$/i.test(before)) return '1';
    if (/(?:^|[^\w])[`"]?(?:at|[a-z_]*_at)[`"]?\s*(?:=|<|>|<=|>=)\s*$/i.test(before)) return "'2026-01-01 00:00:00'";
    if (/[`"]?(?:id|[a-z_]*_id)[`"]?\s*(?:=|<|>|<=|>=)\s*$/i.test(before)) return `'${UUID}'`;
    if (/[`"]?(?:id|[a-z_]*_id)[`"]?\s*in\s*\([^)]*$/i.test(before)) return `'${UUID}'`;
    return "'x'";
  });
}

/** The plan of a statement as text, one line for each step. */
export async function planOf(db: Database, logged: string): Promise<string[]> {
  const statement = withLiterals(logged);
  const connection = db.orm.em.getConnection();
  if (db.dialect === 'sqlite') {
    const rows: Record<string, unknown>[] = await connection.execute(`explain query plan ${statement}`);
    return rows.map((row) => String(row['detail']));
  }
  if (db.dialect === 'postgres') {
    const rows: Record<string, unknown>[] = await connection.execute(`explain ${statement}`);
    return rows.map((row) => String(row['QUERY PLAN']));
  }
  const rows: Record<string, unknown>[] = await connection.execute(`explain ${statement}`);
  return rows.map((row) => `${String(row['table'])} type=${String(row['type'])} key=${String(row['key'])}`);
}

/**
 * The steps of a plan that read a whole table: `SCAN t` with no index on SQLite, `Seq Scan` on PostgreSQL and `type=ALL` on MySQL.
 * A scan that is ordered by an index, or a small table, does not count.
 */
export function fullScans(plan: readonly string[], dialect: Dialect): string[] {
  if (dialect === 'sqlite') return plan.filter((line) => /^SCAN\b/.test(line) && !/USING (COVERING )?INDEX/.test(line));
  if (dialect === 'postgres') return plan.filter((line) => /Seq Scan/.test(line));
  return plan.filter((line) => /type=ALL\b/.test(line));
}

/** Refreshes the statistics of a table after a bulk insert, as the autovacuum of a real database would, so that the planner knows its size. */
export async function analyze(db: Database, table: string): Promise<void> {
  const connection = db.orm.em.getConnection();
  if (db.dialect === 'postgres') await connection.execute(`analyze ${table}`);
  else if (db.dialect === 'mysql') await connection.execute(`analyze table ${table}`);
  else await connection.execute(`analyze ${table}`);
}
