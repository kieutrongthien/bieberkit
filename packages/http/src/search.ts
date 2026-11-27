/**
 * BieberKit
 *
 * @file        packages/http/src/search.ts
 * @description The search of a list, `q`: the text is folded as the shadow column of a searchable field is, and the rows are those where the folded text of one of the searchable fields starts with it (UI-11, SR-01).
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

import { apiFields } from '@bieberkit/data/schema';
import type { ApiField, EntityDef } from '@bieberkit/data/schema';

type Row = Record<string, unknown>;

/**
 * The fields that a `q` looks in: the texts that are declared `searchable()` and indexed. They are compared folded, so each has a
 * shadow column, and the search is a prefix match on it that reads the index. A per-word match and a ranked one are for
 * the search contract (SR-01), which a project adds with an engine.
 */
export function searchableOf(def: EntityDef<string>): readonly ApiField[] {
  return apiFields(def).filter(
    (field) =>
      field.def.searchable === true &&
      (field.def.kind === 'string' || field.def.kind === 'email') &&
      field.def.compare !== undefined &&
      field.def.compare !== 'exact' &&
      // The prefix is looked up in the index of the shadow column: a field without one cannot be filtered either (DATA-07).
      (field.def.index === true || field.def.unique === true),
  );
}

/** What the signs of a pattern would do in a `LIKE`, taken out of the text, so that a person's `%` is a character that no row has. */
const PATTERN_SIGNS = /[%_\\]/g;

/**
 * The condition of a `q`, or `undefined` when there is nothing to look for. Spaces are made one, the signs of a pattern are left out,
 * and a row matches when one of the fields starts with the text once both are folded.
 */
export function searchWhere(def: EntityDef<string>, q: string | undefined): Row | undefined {
  const text = q?.trim();
  if (text === undefined || text === '') return undefined;
  // The data layer folds the text as the field does and looks it up in the shadow column, so the field is named and not its shadow.
  const wanted = text.replaceAll(PATTERN_SIGNS, '').replaceAll(/\s+/g, ' ');
  if (wanted === '') return undefined;
  const alternatives = searchableOf(def).map((field) => ({ [field.name]: { $like: `${wanted}%` } }));
  return alternatives.length === 0 ? undefined : { $or: alternatives };
}
