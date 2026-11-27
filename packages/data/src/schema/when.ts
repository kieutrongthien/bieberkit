/**
 * BieberKit
 *
 * @file        packages/data/src/schema/when.ts
 * @description The conditions that show or require a field of a form: data and not code, so the server enforces them and any admin adapter evaluates them the same way (UI-11).
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

/**
 * A condition over the values of a form. It is plain data, so it can be written in an entity, sent in `_meta`, kept in a JSON file and
 * evaluated in the browser and on the server by the same rules. `field` is the name of a field of the entity.
 */
export type When =
  | { readonly field: string; readonly eq: unknown }
  | { readonly field: string; readonly ne: unknown }
  | { readonly field: string; readonly in: readonly unknown[] }
  | { readonly field: string; readonly set: boolean }
  | { readonly all: readonly When[] }
  | { readonly any: readonly When[] }
  | { readonly not: When };

const MAX_DEPTH = 8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A missing value, null, an empty text and an empty list are no value. Zero and false are values. */
export const isUnset = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const same = (a: unknown, b: unknown): boolean =>
  (isUnset(a) && b === null) || a === b || (a === undefined && b === null);

/** Whether the condition holds for these values. A condition that is not well formed does not hold. */
export function evaluateWhen(when: When, values: Readonly<Record<string, unknown>>): boolean {
  if ('all' in when) return when.all.every((item) => evaluateWhen(item, values));
  if ('any' in when) return when.any.some((item) => evaluateWhen(item, values));
  if ('not' in when) return !evaluateWhen(when.not, values);
  const value = values[when.field];
  if ('eq' in when) return same(value, when.eq);
  if ('ne' in when) return !same(value, when.ne);
  if ('in' in when) return when.in.some((item) => same(value, item));
  return isUnset(value) !== when.set;
}

/** The names of the fields that a condition reads. */
export function whenFields(when: When): string[] {
  if ('all' in when) return when.all.flatMap(whenFields);
  if ('any' in when) return when.any.flatMap(whenFields);
  if ('not' in when) return whenFields(when.not);
  return [when.field];
}

/** The same condition over other names of the fields: the keys that the API uses are not always the names of the entity (`owner` is `ownerId`). */
export function mapWhenFields(when: When, rename: (name: string) => string): When {
  if ('all' in when) return { all: when.all.map((item) => mapWhenFields(item, rename)) };
  if ('any' in when) return { any: when.any.map((item) => mapWhenFields(item, rename)) };
  if ('not' in when) return { not: mapWhenFields(when.not, rename) };
  return { ...when, field: rename(when.field) };
}

/**
 * What is wrong with a condition, as a sentence, or `undefined`. `known` are the names of the fields of the entity and `owner` is the
 * field that holds the condition, which may not read itself.
 */
export function whenProblem(
  when: unknown,
  known: { has(name: string): boolean },
  owner: string,
  depth = 0,
): string | undefined {
  if (!isRecord(when)) return 'A condition is an object.';
  if (depth > MAX_DEPTH) return `A condition is too deep: ${String(MAX_DEPTH)} levels at most.`;
  for (const key of ['all', 'any'] as const) {
    if (!(key in when)) continue;
    const items = when[key];
    if (!Array.isArray(items)) return `${key} is a list of conditions.`;
    for (const item of items) {
      const problem = whenProblem(item, known, owner, depth + 1);
      if (problem !== undefined) return problem;
    }
    return undefined;
  }
  if ('not' in when) return whenProblem(when['not'], known, owner, depth + 1);
  const name = when['field'];
  if (typeof name !== 'string') return 'A condition names a field.';
  if (name === owner) return `A condition of ${owner} cannot read the field itself.`;
  if (!known.has(name)) return `The condition names the unknown field ${name}.`;
  const ops = ['eq', 'ne', 'in', 'set'].filter((op) => op in when);
  if (ops.length === 0) return `The condition on ${name} needs eq, ne, in or set.`;
  if (ops.length > 1) return `The condition on ${name} takes one of eq, ne, in and set, not ${ops.join(' and ')}.`;
  if ('in' in when && (!Array.isArray(when['in']) || when['in'].length === 0))
    return `in on ${name} is a list with a value.`;
  if ('set' in when && typeof when['set'] !== 'boolean') return `set on ${name} is true or false.`;
  return undefined;
}
