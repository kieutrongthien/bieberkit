/**
 * BieberKit
 *
 * @file        packages/admin-core/src/lists.ts
 * @description The generic list: filters as the query of the API, saved views, the CSV export and the outcome of a bulk call (UI-03).
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

import type { DraftStorage } from './drafts.ts';
import type { MetaEntity } from './types.ts';

export type FilterOperator = 'eq' | 'ne' | 'in' | 'lt' | 'lte' | 'gt' | 'gte' | 'null';

/** One condition of the list. `value` is the text of the control; for `in` it is a comma separated list, for `null` it is `true` or `false`. */
export interface Filter {
  readonly field: string;
  readonly op: FilterOperator;
  readonly value: string;
}

const OPERATORS: readonly FilterOperator[] = ['eq', 'ne', 'in', 'lt', 'lte', 'gt', 'gte', 'null'];
const WORDS: readonly FilterOperator[] = ['eq', 'ne', 'in', 'null'];
const RANGES: readonly FilterOperator[] = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'null'];

const NUMBER = /^-?\d+(\.\d+)?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The operators that the API takes for a kind of field, in the order that a person expects them. */
export function operatorsOf(kind: string): readonly FilterOperator[] {
  switch (kind) {
    case 'int':
    case 'decimal':
    case 'date':
    case 'dateTime':
      return RANGES;
    case 'boolean':
      return ['eq', 'null'];
    case 'belongsTo':
      return ['eq', 'in', 'null'];
    default:
      return WORDS;
  }
}

function valueProblem(kind: string, values: readonly string[] | undefined, text: string): string | undefined {
  switch (kind) {
    case 'int':
      return /^-?\d+$/.test(text) ? undefined : 'a whole number';
    case 'decimal':
      return NUMBER.test(text) ? undefined : 'a number';
    case 'boolean':
      return text === 'true' || text === 'false' ? undefined : 'true or false';
    case 'date':
      return DAY.test(text) && !Number.isNaN(Date.parse(text)) ? undefined : 'a date as 2026-03-05';
    case 'dateTime':
      return (DAY.test(text) || /^\d{4}-\d{2}-\d{2}T/.test(text)) && !Number.isNaN(Date.parse(text))
        ? undefined
        : 'a date and time as 2026-03-05T10:00:00Z';
    case 'oneOf':
      return values === undefined || values.includes(text) ? undefined : `one of ${values.join(', ')}`;
    default:
      return undefined;
  }
}

/** Why the API would refuse the filter, or `undefined` when it would not. A filter that is refused is not sent: the person is told first. */
export function filterProblem(entity: MetaEntity, filter: Filter): string | undefined {
  const field = entity.fields.find((candidate) => candidate.key === filter.field);
  if (field === undefined) return `${filter.field} is not a field of ${entity.name}.`;
  if (!field.filterable) return `${filter.field} has no index, so a list cannot be filtered by it.`;
  if (!operatorsOf(field.kind).includes(filter.op)) return `${filter.field} does not take the operator ${filter.op}.`;
  if (filter.op === 'null')
    return filter.value === 'true' || filter.value === 'false' ? undefined : `${filter.field}: null is true or false.`;
  const items = filter.op === 'in' ? filter.value.split(',') : [filter.value];
  for (const item of items) {
    const wrong = valueProblem(field.kind, field.values, item);
    if (wrong !== undefined) return `${filter.field}: ${item === '' ? 'an empty value' : item} is not ${wrong}.`;
  }
  return undefined;
}

/** The filters as the query of the API: `filter[field][op]=value`. A filter that the API would refuse throws, so the caller checks them first. */
export function filterParams(entity: MetaEntity, filters: readonly Filter[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const filter of filters) {
    const problem = filterProblem(entity, filter);
    if (problem !== undefined) throw new Error(problem);
    params[`filter[${filter.field}][${filter.op}]`] = filter.value;
  }
  return params;
}

/** A named set of filters and a sort that a person keeps (UI-03). */
export interface SavedView {
  readonly name: string;
  readonly filters: readonly Filter[];
  readonly sort?: string;
}

const MAX_VIEWS = 20;

/** The key of the views of one user for one entity, so people who share a browser do not share views. */
export const viewsKey = (entity: string, userId: string): string => `bk-views:${userId}:${entity}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOperator = (value: unknown): value is FilterOperator => OPERATORS.some((operator) => operator === value);

function filtersOf(value: unknown): Filter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filters: Filter[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const { field, op, value: text } = item;
    if (typeof field !== 'string' || !isOperator(op) || typeof text !== 'string') return undefined;
    filters.push({ field, op, value: text });
  }
  return filters;
}

function viewOf(value: unknown): SavedView | undefined {
  if (!isRecord(value) || typeof value['name'] !== 'string') return undefined;
  const filters = filtersOf(value['filters']);
  if (filters === undefined) return undefined;
  const sort = value['sort'];
  return { name: value['name'], filters, ...(typeof sort === 'string' && sort !== '' ? { sort } : {}) };
}

/** The saved views. A storage that refuses, a text that is not JSON and an entry that is not a view give no view, never an error. */
export function loadViews(storage: DraftStorage, key: string): SavedView[] {
  try {
    const text = storage.getItem(key);
    if (text === null) return [];
    const found: unknown = JSON.parse(text);
    if (!Array.isArray(found)) return [];
    return found.map(viewOf).filter((view): view is SavedView => view !== undefined);
  } catch {
    return [];
  }
}

function keep(storage: DraftStorage, key: string, views: readonly SavedView[]): void {
  try {
    storage.setItem(key, JSON.stringify(views));
  } catch {
    // The browser keeps no views here. The list works as it did.
  }
}

/** Saves a view. A view of the same name is replaced where it stands, and beyond twenty the oldest goes. */
export function saveView(storage: DraftStorage, key: string, view: SavedView): void {
  const views = loadViews(storage, key);
  const at = views.findIndex((candidate) => candidate.name === view.name);
  if (at === -1) views.push(view);
  else views[at] = view;
  keep(storage, key, views.slice(-MAX_VIEWS));
}

export function deleteView(storage: DraftStorage, key: string, name: string): void {
  keep(
    storage,
    key,
    loadViews(storage, key).filter((view) => view.name !== name),
  );
}

/** The search of the address for a view, so that a link opens the same list. The filters travel as JSON text. */
export function viewToSearch(view: SavedView): { filters?: string; sort?: string } {
  return {
    ...(view.filters.length === 0 ? {} : { filters: JSON.stringify(view.filters) }),
    ...(view.sort === undefined || view.sort === '' ? {} : { sort: view.sort }),
  };
}

/** The view that an address holds. The filters may come as the JSON text or as the array that a router has already parsed. Anything else is no filter. */
export function viewFromSearch(search: Readonly<Record<string, unknown>>): SavedView {
  let raw: unknown = search['filters'];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = undefined;
    }
  }
  const filters = filtersOf(raw) ?? [];
  const sort = search['sort'];
  return { name: '', filters, ...(typeof sort === 'string' && sort !== '' ? { sort } : {}) };
}

export interface CsvColumn {
  readonly key: string;
  readonly title: string;
}

const FORMULA = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = '';
  else if (typeof value === 'string') text = FORMULA.test(value) ? `'${value}` : value;
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : '';
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The rows as CSV (RFC 4180, CRLF). A text that a spreadsheet would run as a formula starts with a quote mark, so that an exported name
 * such as `=HYPERLINK(...)` is shown and not run (IO-04). Numbers and booleans are written as they are.
 */
export function csvOf(columns: readonly CsvColumn[], rows: readonly Readonly<Record<string, unknown>>[]): string {
  const lines = [
    columns.map((column) => cell(column.title)),
    ...rows.map((row) => columns.map((column) => cell(row[column.key]))),
  ];
  return lines.map((line) => `${line.join(',')}\r\n`).join('');
}

/** How many pages an export reads, and whether the limit cut it, so that the person is told that the file is not the whole list. */
export function exportPages(total: number, pageSize: number, limit: number): { pages: number; truncated: boolean } {
  return { pages: Math.ceil(Math.min(total, limit) / pageSize), truncated: total > limit };
}

/** One answer of the bulk route (API-14). */
export interface BulkOutcome {
  readonly id: string;
  readonly status: string;
  readonly version?: number;
  readonly error?: { readonly code: string; readonly message: string };
}

/** What worked and what did not, with the reason that the API gave for each row that failed. */
export function bulkSummary(outcomes: readonly BulkOutcome[]): {
  ok: number;
  failed: { id: string; message: string }[];
} {
  const failed = outcomes
    .filter((outcome) => outcome.status !== 'ok')
    .map((outcome) => ({ id: outcome.id, message: outcome.error?.message ?? outcome.status }));
  return { ok: outcomes.length - failed.length, failed };
}
