/**
 * BieberKit
 *
 * @file        packages/admin-core/src/related.ts
 * @description The tabs of a detail screen: the entities that point at a row (its child tables), the filter that finds their rows, the values that a new one starts with, and the history of a row from the audit log (UI-03, UI-11).
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

import type { Filter } from './lists.ts';
import type { Meta, MetaEntity, MetaField, Row } from './types.ts';

/** An entity that holds a relation to another one, and the field that holds it. */
export interface Related {
  readonly entity: MetaEntity;
  /** The key of the relation as the API sends it (`accountId`). */
  readonly via: MetaField;
}

/**
 * The entities whose rows belong to a row of `entity`: those that the user may list and that have a relation to it that the API can filter
 * by. They are the child tables of the detail screen. An entity does not list itself, so a tree is not a loop.
 */
export function relatedOf(meta: Meta, entity: MetaEntity): readonly Related[] {
  return meta.entities
    .filter((other) => other.name !== entity.name && other.operations.list && other.can.read)
    .flatMap((other) =>
      other.fields
        .filter((field) => field.kind === 'belongsTo' && field.target?.entity === entity.name && field.filterable)
        .map((via) => ({ entity: other, via })),
    )
    .toSorted((a, b) => a.entity.name.localeCompare(b.entity.name) || a.via.key.localeCompare(b.via.key));
}

/** The filter that finds the rows of a related entity that belong to the row `id`. */
export const relatedFilter = (related: Related, id: string): Filter => ({
  field: related.via.key,
  op: 'eq',
  value: id,
});

/** What a new related row starts with: the relation points at the row that the person is looking at. */
export const relatedDefaults = (related: Related, id: string): Readonly<Record<string, string>> => ({
  [related.via.key]: id,
});

/**
 * The values of a new row that the address gives, such as `?accountId=...` from the button of a child table. Only the fields of the form
 * that exist are taken, and a value is a text, so that an address cannot set what the form does not show.
 */
export function prefillOf(
  form: readonly MetaField[],
  search: Readonly<Record<string, unknown>>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of form) {
    const value = search[field.key];
    if (typeof value === 'string' && value !== '') values[field.key] = value;
  }
  return values;
}

/** The path of the audit log for one row, newest first. */
export const HISTORY_PATH = '/api/v1/audit-log/entries';

export const historyQuery = (entity: string, id: string, pageSize = 20): string =>
  `?entity=${encodeURIComponent(entity)}&recordId=${encodeURIComponent(id)}&pageSize=${String(pageSize)}`;

/** One entry of the history of a row, as the screen shows it. */
export interface HistoryEntry {
  readonly id: string;
  readonly at: string;
  readonly action: string;
  readonly who: string;
  /** The fields that the entry says changed, when it says. */
  readonly fields: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The entries of an answer of the audit log. What is not an entry is left out, and a missing actor is `-`. */
export function historyOf(body: unknown): HistoryEntry[] {
  const data = isRecord(body) && Array.isArray(body['data']) ? body['data'] : [];
  return data.filter(isRecord).flatMap((entry) => {
    const { id, at, action } = entry;
    if (typeof id !== 'string' || typeof at !== 'string' || typeof action !== 'string') return [];
    const actor = isRecord(entry['actor']) ? entry['actor'] : undefined;
    const name =
      typeof actor?.['name'] === 'string' ? actor['name'] : typeof actor?.['email'] === 'string' ? actor['email'] : '-';
    const detail = isRecord(entry['data']) ? entry['data']['fields'] : undefined;
    return [
      {
        id,
        at,
        action,
        who: name,
        fields: Array.isArray(detail) ? detail.filter((item): item is string => typeof item === 'string') : [],
      },
    ];
  });
}

/** A short line for an entry: what was done, and the fields that changed. */
export const historyLine = (entry: HistoryEntry): string =>
  `${entry.action.split('.').at(-1) ?? entry.action}${entry.fields.length === 0 ? '' : ` (${entry.fields.join(', ')})`}`;

/** The fields of a row that the form does not edit, with their values: what a detail screen shows beside the form (computed and state fields). */
export function readOnlyOf(entity: MetaEntity, row: Row): { readonly key: string; readonly value: unknown }[] {
  return entity.fields
    .filter((field) => !entity.form.includes(field.key) && field.key !== 'id')
    .map((field) => ({ key: field.key, value: row[field.key] }));
}
