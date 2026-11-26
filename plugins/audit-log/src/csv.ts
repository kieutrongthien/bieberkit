/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/csv.ts
 * @description The CSV and NDJSON lines of an audit export, with the cells that a spreadsheet would run as a formula escaped (IO-04).
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

import type { EntryView } from './entries.ts';

export const CSV_COLUMNS: readonly string[] = [
  'id',
  'at',
  'tenant',
  'actorId',
  'actorEmail',
  'requestId',
  'action',
  'entity',
  'recordId',
  'reason',
  'data',
];

/** A cell that a spreadsheet would run as a formula starts with `'` (IO-04). A tab and a carriage return are escaped as well. */
const FORMULA = /^[=+\-@\t\r]/;

/** One CSV cell: escaped against formulas, then quoted when it holds a comma, a quote or a line break. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const safe = FORMULA.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function csvLine(entry: EntryView): string {
  const cells = [
    entry.id,
    entry.at,
    entry.tenant,
    entry.actorId,
    entry.actor?.email ?? null,
    entry.requestId,
    entry.action,
    entry.entity,
    entry.recordId,
    entry.reason,
    entry.data,
  ];
  return `${cells.map(csvCell).join(',')}\n`;
}

export const ndjsonLine = (entry: EntryView): string => `${JSON.stringify(entry)}\n`;
