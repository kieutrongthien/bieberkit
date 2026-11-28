/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/admin/history.ts
 * @description The history of a row as the audit log tells it: the call, and how an entry of the answer is read and shown (UI-03).
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

import type { AdminClient } from '@bieberkit/admin-core';

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

/** What the audit log says about one row, newest first. A person without the permission of the audit log gets the error of the API. */
export async function readHistory(
  client: Pick<AdminClient, 'request'>,
  entity: string,
  id: string,
): Promise<readonly HistoryEntry[]> {
  return historyOf(await client.request('GET', `${HISTORY_PATH}${historyQuery(entity, id)}`));
}
