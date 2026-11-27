/**
 * BieberKit
 *
 * @file        packages/http/src/conditions.ts
 * @description The conditions of a field on a write: a field that its condition hides is dropped, and a field that its condition requires must have a value, as a refusal at the field (UI-11).
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

import { apiFields, evaluateWhen, isUnset } from '@bieberkit/data/schema';
import type { EntityDef } from '@bieberkit/data/schema';
import { ValidationFailed } from './problem.ts';

type Row = Record<string, unknown>;

/**
 * Applies the `visibleWhen` and `requiredWhen` of the fields of `def` to a write. `current` holds what the row is before the write, by
 * the names of the fields (the defaults for a create, the row for an update) and `body` is what was sent, by the keys of the API.
 * It answers the body without the fields that their condition hides, and throws `ValidationFailed` for each field that its
 * condition requires and that has no value after the write.
 */
export function enforceConditions(def: EntityDef<string>, current: Readonly<Row>, body: Readonly<Row>): Row {
  const governed = apiFields(def).filter(
    (field) => field.def.admin?.visibleWhen !== undefined || field.def.admin?.requiredWhen !== undefined,
  );
  if (governed.length === 0) return { ...body };
  const values: Row = { ...current };
  for (const field of apiFields(def)) if (field.key in body) values[field.name] = body[field.key];
  const out: Row = { ...body };
  const issues: { path: string; keyword: string; message: string }[] = [];
  for (const field of governed) {
    const { visibleWhen, requiredWhen } = field.def.admin ?? {};
    if (visibleWhen !== undefined && !evaluateWhen(visibleWhen, values)) {
      // A field that is hidden is not part of the write, and a stored value stays as it was.
      delete out[field.key];
      continue;
    }
    if (requiredWhen !== undefined && evaluateWhen(requiredWhen, values) && isUnset(values[field.name])) {
      issues.push({
        path: `body.${field.key}`,
        keyword: 'required',
        message: 'is required for the other values of this record',
      });
    }
  }
  if (issues.length > 0) throw new ValidationFailed(issues);
  return out;
}
