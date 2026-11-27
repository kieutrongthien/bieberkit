/**
 * BieberKit
 *
 * @file        packages/admin-core/src/validation.ts
 * @description The check of a value of a form against the JSON Schema that the metadata carries for the field, so that a form refuses what the API would refuse before it asks (UI-03).
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

import type { MetaField } from './types.ts';

/** What is wrong with a value. A screen turns the `code` into a sentence of its language, with the numbers of `values`. */
export interface ValueProblem {
  readonly code: 'required' | 'tooShort' | 'tooLong' | 'tooSmall' | 'tooBig' | 'pattern';
  readonly values: Readonly<Record<string, number>>;
}

const empty = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const numberOf = (schema: Readonly<Record<string, unknown>>, key: string): number | undefined => {
  const found = schema[key];
  return typeof found === 'number' ? found : undefined;
};

/**
 * The first thing that is wrong with `value` for `field`, or `undefined`. A switch is never missing, and a field that is not required may
 * be left empty. `required` is `field.required` unless a condition of the form says otherwise.
 */
export function problemOf(
  field: MetaField,
  value: unknown,
  required: boolean = field.required,
): ValueProblem | undefined {
  if (empty(value)) return required && field.widget !== 'switch' ? { code: 'required', values: {} } : undefined;
  const schema = field.validation ?? {};
  if (typeof value === 'string') {
    const min = numberOf(schema, 'minLength');
    const max = numberOf(schema, 'maxLength');
    if (min !== undefined && value.length < min) return { code: 'tooShort', values: { min } };
    if (max !== undefined && value.length > max) return { code: 'tooLong', values: { max } };
    const pattern = schema['pattern'];
    if (typeof pattern === 'string') {
      try {
        if (!new RegExp(pattern, 'u').test(value)) return { code: 'pattern', values: {} };
      } catch {
        // A pattern that this browser cannot read is left to the server.
      }
    }
  }
  if (typeof value === 'number') {
    const min = numberOf(schema, 'minimum');
    const max = numberOf(schema, 'maximum');
    if (min !== undefined && value < min) return { code: 'tooSmall', values: { min } };
    if (max !== undefined && value > max) return { code: 'tooBig', values: { max } };
  }
  return undefined;
}
