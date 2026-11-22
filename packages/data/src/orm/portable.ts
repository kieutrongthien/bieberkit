/**
 * BieberKit
 *
 * @file        packages/data/src/orm/portable.ts
 * @description Portable schema helpers for plugin migration steps: the UUID column type and setNotNull on every dialect (DATA-24, DATA-27).
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
import type { Kysely, RawBuilder } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { cutSql } from '../migrations/destructive.ts';
import type { StepDatabase } from '../migrations/steps.ts';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COLUMN_TYPE = /^[A-Za-z][A-Za-z0-9_ (),]*$/;

function assertIdentifier(value: string, what: string): void {
  if (!IDENTIFIER.test(value)) {
    throw dataError(
      'DATA_IDENTIFIER_INVALID',
      500,
      `"${value}" is not a ${what}.`,
      'Use letters, digits and underscores, and start with a letter or an underscore.',
    );
  }
}

/** The column type of a UUID key on the dialect, the same one `Uuid7Type` uses: `uuid`, `binary(16)` or `blob` (DATA-14). */
export function uuidType(dialect: Dialect): RawBuilder<unknown> {
  return sql.raw(dialect === 'postgres' ? 'uuid' : dialect === 'mysql' ? 'binary(16)' : 'blob');
}

const unquote = (name: string): string => name.replaceAll(/^["`[]|["`\]]$/g, '').toLowerCase();

/** Rebuilds a SQLite table with `column` not null, from the text of its own `create table`, so nothing else about it changes. */
async function rebuildSqlite(db: Kysely<StepDatabase>, table: string, column: string): Promise<void> {
  const found = await sql<{
    sql: string;
  }>`select sql from sqlite_master where type = 'table' and name = ${table}`.execute(db);
  const create = found.rows[0]?.sql;
  if (create === undefined) {
    throw dataError(
      'DATA_IDENTIFIER_INVALID',
      500,
      `The table ${table} does not exist.`,
      'Create it in an earlier step.',
    );
  }
  const open = create.indexOf('(');
  const close = create.lastIndexOf(')');
  const definitions = cutSql(create.slice(open + 1, close), ',', true).map((piece) => piece.replace(/,$/, '').trim());
  const index = definitions.findIndex(
    (definition) => unquote(definition.split(/\s+/)[0] ?? '') === column.toLowerCase(),
  );
  const definition = definitions[index];
  if (definition === undefined) {
    throw dataError(
      'DATA_IDENTIFIER_INVALID',
      500,
      `The table ${table} has no column ${column}.`,
      'Check the name of the column.',
    );
  }
  if (/\bnot\s+null\b/i.test(definition)) return;
  definitions[index] = `${definition} not null`;
  const temporary = `${table}__new`;
  const header = create
    .slice(0, open)
    .replace(/^(create\s+table\s+(?:if\s+not\s+exists\s+)?).*$/is, `$1"${temporary}" `);
  const recreated = `${header}(${definitions.join(', ')})${create.slice(close + 1)}`;

  const info = await sql<{ name: string }>`select name from pragma_table_xinfo(${table}) where hidden = 0`.execute(db);
  const names = info.rows.map((row) => `"${row.name}"`).join(', ');
  const extras = await sql<{
    sql: string;
  }>`select sql from sqlite_master where tbl_name = ${table} and type in ('index', 'trigger') and sql is not null`.execute(
    db,
  );

  await sql.raw(recreated).execute(db);
  await sql.raw(`insert into "${temporary}" (${names}) select ${names} from "${table}"`).execute(db);
  await sql.raw(`drop table "${table}"`).execute(db);
  await sql.raw(`alter table "${temporary}" rename to "${table}"`).execute(db);
  for (const extra of extras.rows) await sql.raw(extra.sql).execute(db);
}

/**
 * Makes a column required, the same way on every dialect. `type` is the type of the column in the dialect, because MySQL needs it
 * to restate the column. Fill every row first: a row that is still null fails the step. On SQLite the table is rebuilt, so the
 * runner switches foreign keys off around the step (DATA-27), and views that name the table must be dropped before and made again after.
 */
export async function setNotNull(
  db: Kysely<StepDatabase>,
  dialect: Dialect,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  assertIdentifier(table, 'table name');
  assertIdentifier(column, 'column name');
  if (!COLUMN_TYPE.test(type)) {
    throw dataError(
      'DATA_IDENTIFIER_INVALID',
      500,
      `"${type}" is not a column type.`,
      'Give the type as the dialect writes it, for example varchar(50).',
    );
  }
  if (dialect === 'postgres') {
    await db.schema
      .alterTable(table)
      .alterColumn(column, (c) => c.setNotNull())
      .execute();
  } else if (dialect === 'mysql') {
    await sql.raw(`alter table \`${table}\` modify column \`${column}\` ${type} not null`).execute(db);
  } else {
    await rebuildSqlite(db, table, column);
  }
}
