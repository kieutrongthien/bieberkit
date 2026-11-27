/**
 * BieberKit
 *
 * @file        packages/admin-core/src/drafts.ts
 * @description The unsaved changes of a form: dirty tracking, the local draft of a long form, and the three-way merge that a 412 conflict needs (UI-17, UI-18).
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

/** What a draft needs of a browser storage. `localStorage` has it. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Values = Readonly<Record<string, unknown>>;

const MAX_DRAFT_CHARS = 100_000;
const DRAFT_TTL_MS = 7 * 86_400_000;

/** An empty value is the same as none: a text that was cleared is not a change of an empty field. */
function normal(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value.map(normal);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, inner]) => [key, normal(inner)]),
    );
  }
  return value;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(normal(a)) === JSON.stringify(normal(b));

/** Whether a form has a value that differs from the one that it started with (UI-17). */
export function isDirty(initial: Values, current: Values): boolean {
  return [...new Set([...Object.keys(initial), ...Object.keys(current)])].some(
    (key) => !same(initial[key], current[key]),
  );
}

/** The key of a draft: for one user, one entity and one record (or a new one), so people who share a browser do not share a draft. */
export const draftKey = (entity: string, id: string | undefined, userId: string): string =>
  `bk-draft:${userId}:${entity}:${id ?? 'new'}`;

/** Keeps the values of a form, except the fields that must not rest in a browser. A draft that is too big, or a storage that refuses, is skipped. */
export function saveDraft(
  storage: DraftStorage,
  key: string,
  values: Values,
  now: number,
  skip: ReadonlySet<string> = new Set(),
): void {
  const kept = Object.fromEntries(Object.entries(values).filter(([name]) => !skip.has(name)));
  const text = JSON.stringify({ at: now, values: kept });
  try {
    if (text.length > MAX_DRAFT_CHARS) storage.removeItem(key);
    else storage.setItem(key, text);
  } catch {
    // The browser keeps no draft here. The form works as it did.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The draft of a form, if there is one and it is not older than a week. An old or broken one is dropped. */
export function loadDraft(storage: DraftStorage, key: string, now: number): Record<string, unknown> | undefined {
  try {
    const text = storage.getItem(key);
    if (text === null) return undefined;
    const found: unknown = JSON.parse(text);
    if (
      isRecord(found) &&
      typeof found['at'] === 'number' &&
      isRecord(found['values']) &&
      now - found['at'] <= DRAFT_TTL_MS
    )
      return found['values'];
    storage.removeItem(key);
  } catch {
    // A text that is not a draft, or a storage that refuses: there is none.
  }
  return undefined;
}

export function clearDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to remove here.
  }
}

export interface Conflict {
  readonly key: string;
  readonly base: unknown;
  readonly mine: unknown;
  readonly theirs: unknown;
}

/**
 * The three-way merge of a 412 (UI-18). `base` is the row that the person opened, `mine` what the form holds, `theirs` the row as it is
 * now. A field that only the person changed keeps their value, one that only others changed takes the new one, and one that both changed
 * differently is a conflict, for which the person's value is kept until they choose.
 */
export function reapply(
  base: Values,
  mine: Values,
  theirs: Values,
): { values: Record<string, unknown>; conflicts: Conflict[] } {
  const values: Record<string, unknown> = {};
  const conflicts: Conflict[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const [b, m, t] = [base[key], mine[key], theirs[key]];
    if (same(m, b)) values[key] = t;
    else if (same(t, b) || same(m, t)) values[key] = m;
    else {
      values[key] = m;
      conflicts.push({ key, base: b, mine: m, theirs: t });
    }
  }
  return { values, conflicts };
}
