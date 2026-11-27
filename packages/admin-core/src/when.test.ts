/**
 * BieberKit
 *
 * @file        packages/admin-core/src/when.test.ts
 * @description Tests of the conditions of a form and of the state of its fields, and the proof that the evaluator of the admin and the one of the data package give the same answers (UI-11).
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
import { conditionalFields, evaluateWhen, statesOf, visibleValues } from './when.ts';
import type { MetaEntity, MetaField } from './types.ts';

const field = (key: string, extra: Partial<MetaField> = {}): MetaField => ({
  key,
  kind: 'string',
  widget: 'text',
  required: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  ...extra,
});

describe('UI-11 the evaluator of the admin', () => {
  it('UI-11 compares with eq, ne and in, says whether a field has a value with set, and combines with all, any and not', () => {
    const values = { tier: 'gold', note: '', owner: null, visits: 0 };
    expect(evaluateWhen({ field: 'tier', eq: 'gold' }, values)).toBe(true);
    expect(evaluateWhen({ field: 'tier', in: ['basic'] }, values)).toBe(false);
    expect(evaluateWhen({ field: 'owner', eq: null }, values)).toBe(true);
    expect(evaluateWhen({ field: 'note', set: false }, values)).toBe(true);
    expect(evaluateWhen({ field: 'visits', set: true }, values)).toBe(true);
    expect(evaluateWhen({ any: [{ field: 'tier', ne: 'gold' }, { not: { field: 'note', set: true } }] }, values)).toBe(
      true,
    );
  });
});

describe('UI-11 what a form shows and asks for', () => {
  const fields = [
    field('tier', { widget: 'select' }),
    field('reason', { visibleWhen: { field: 'tier', eq: 'basic' }, requiredWhen: { field: 'tier', eq: 'basic' } }),
    field('bonus', { requiredWhen: { field: 'tier', eq: 'vip' } }),
    field('code', { required: true }),
  ];

  it('UI-11 a field with no condition is shown and is required as the metadata says', () => {
    const { visible, required } = statesOf(fields, { tier: 'gold' });
    expect([...visible]).toEqual(['tier', 'bonus', 'code']);
    expect([...required]).toEqual(['code']);
  });

  it('UI-11 a field is shown when its condition holds, and required when its other condition holds', () => {
    const { visible, required } = statesOf(fields, { tier: 'basic' });
    expect([...visible]).toEqual(['tier', 'reason', 'bonus', 'code']);
    expect([...required].toSorted()).toEqual(['code', 'reason']);
    expect([...statesOf(fields, { tier: 'vip' }).required].toSorted()).toEqual(['bonus', 'code']);
  });

  it('UI-11 a field that is hidden is not required, even when its other condition holds', () => {
    const odd = [field('a'), field('b', { visibleWhen: { field: 'a', eq: 1 }, requiredWhen: { field: 'a', eq: 2 } })];
    expect([...statesOf(odd, { a: 2 }).required]).toEqual([]);
  });

  it('UI-11 what is sent has no field that its condition hides, and keeps the keys that no field names', () => {
    expect(visibleValues(fields, { tier: 'gold', reason: 'x', bonus: 1, code: 'c', extra: 1 })).toEqual({
      tier: 'gold',
      bonus: 1,
      code: 'c',
      extra: 1,
    });
  });

  it('UI-11 lists the fields of an entity that have a condition', () => {
    const entity: MetaEntity = {
      name: 'crm.X',
      path: '/x',
      label: {},
      operations: { list: true, get: true, create: true, update: true, delete: true },
      can: { read: true, create: true, update: true, delete: true },
      softDelete: false,
      tenant: false,
      list: [],
      form: [],
      fields,
    };
    expect(conditionalFields(entity).map((item) => item.key)).toEqual(['reason', 'bonus']);
  });
});
