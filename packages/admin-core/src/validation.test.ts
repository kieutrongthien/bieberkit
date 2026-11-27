/**
 * BieberKit
 *
 * @file        packages/admin-core/src/validation.test.ts
 * @description Tests of the check of a form value against the JSON Schema of its field (UI-03).
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

import { describe, expect, it } from 'vitest';
import { problemOf } from './validation.ts';
import type { MetaField } from './types.ts';

const field = (extra: Partial<MetaField> = {}): MetaField => ({
  key: 'k',
  kind: 'string',
  widget: 'text',
  required: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  ...extra,
});

describe('UI-03 the check of a form value', () => {
  it('UI-03 a required field that is empty is a problem, and one that is not required may be empty', () => {
    for (const value of [undefined, null, '', []])
      expect(problemOf(field({ required: true }), value)).toEqual({ code: 'required', values: {} });
    expect(problemOf(field(), '')).toBeUndefined();
    expect(problemOf(field({ required: true }), 0)).toBeUndefined();
    expect(problemOf(field({ required: true }), false)).toBeUndefined();
  });

  it('UI-03 a switch is never missing: off is an answer', () => {
    expect(problemOf(field({ required: true, widget: 'switch' }), undefined)).toBeUndefined();
  });

  it('UI-03 a text that is shorter or longer than the schema says is refused, with the limit', () => {
    const limited = field({ validation: { type: 'string', minLength: 3, maxLength: 5 } });
    expect(problemOf(limited, 'ab')).toEqual({ code: 'tooShort', values: { min: 3 } });
    expect(problemOf(limited, 'abcdef')).toEqual({ code: 'tooLong', values: { max: 5 } });
    expect(problemOf(limited, 'abcd')).toBeUndefined();
  });

  it('UI-03 a number outside its range is refused, with the limit', () => {
    const ranged = field({ kind: 'int', widget: 'number', validation: { minimum: 0, maximum: 10 } });
    expect(problemOf(ranged, -1)).toEqual({ code: 'tooSmall', values: { min: 0 } });
    expect(problemOf(ranged, 11)).toEqual({ code: 'tooBig', values: { max: 10 } });
    expect(problemOf(ranged, 0)).toBeUndefined();
  });

  it('UI-03 a pattern is checked, and one that cannot be read is left to the server', () => {
    expect(problemOf(field({ validation: { pattern: '^[A-Z]{2}-\\d+$' } }), 'x')).toEqual({
      code: 'pattern',
      values: {},
    });
    expect(problemOf(field({ validation: { pattern: '^[A-Z]{2}-\\d+$' } }), 'AB-12')).toBeUndefined();
    expect(problemOf(field({ validation: { pattern: '(' } }), 'x')).toBeUndefined();
  });
});
