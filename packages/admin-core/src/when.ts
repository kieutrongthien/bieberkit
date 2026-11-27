/**
 * BieberKit
 *
 * @file        packages/admin-core/src/when.ts
 * @description The conditions that show or require a field of a form, as the metadata carries them, and the state of each field of a form that follows from them (UI-11).
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

import type { MetaEntity, MetaField, When } from './types.ts';

/** A missing value, null, an empty text and an empty list are no value. Zero and false are values. */
export const isUnset = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const same = (a: unknown, b: unknown): boolean => (isUnset(a) && b === null) || a === b;

/**
 * Whether the condition holds for these values. It is the evaluator of `@bieberkit/data/schema`, written again here because the admin
 * has no dependency (ADR 0025); `packages/testing/src/when.contract.test.ts` runs both over the same table so that they cannot drift.
 */
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

/** What a form shows and asks for now, by the key of each field. */
export interface FieldStates {
  readonly visible: ReadonlySet<string>;
  readonly required: ReadonlySet<string>;
}

/**
 * The fields of the form that are shown, and the ones that are required, for the values that it holds. A field with no condition is shown,
 * and is required when the metadata says so. A field that is hidden is not required.
 */
export function statesOf(fields: readonly MetaField[], values: Readonly<Record<string, unknown>>): FieldStates {
  const visible = new Set<string>();
  const required = new Set<string>();
  for (const field of fields) {
    if (field.visibleWhen !== undefined && !evaluateWhen(field.visibleWhen, values)) continue;
    visible.add(field.key);
    if (field.requiredWhen === undefined ? field.required : evaluateWhen(field.requiredWhen, values))
      required.add(field.key);
  }
  return { visible, required };
}

/** The values of a form without the fields that its conditions hide: what is sent. */
export function visibleValues(
  fields: readonly MetaField[],
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { visible } = statesOf(fields, values);
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => visible.has(key) || !fields.some((field) => field.key === key)),
  );
}

/** The fields of the form of an entity, for `statesOf`. */
export const conditionalFields = (entity: MetaEntity): readonly MetaField[] =>
  entity.fields.filter((field) => field.visibleWhen !== undefined || field.requiredWhen !== undefined);
