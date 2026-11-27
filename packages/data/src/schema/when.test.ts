/**
 * BieberKit
 *
 * @file        packages/data/src/schema/when.test.ts
 * @description Tests of the conditions that show or require a field of a form: what they say, how they are checked and how they are read (UI-11).
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
import { defineEntity } from './define-entity.ts';
import { f } from './fields.ts';
import { evaluateWhen, mapWhenFields, whenFields, whenProblem } from './when.ts';
import type { When } from './when.ts';

describe('UI-11 a condition is data that reads the values of a form', () => {
  const values = { tier: 'gold', active: true, note: '', visits: 3, owner: null };

  it('UI-11 eq, ne and in compare with the value, and a missing value is the same as null', () => {
    expect(evaluateWhen({ field: 'tier', eq: 'gold' }, values)).toBe(true);
    expect(evaluateWhen({ field: 'tier', eq: 'vip' }, values)).toBe(false);
    expect(evaluateWhen({ field: 'tier', ne: 'vip' }, values)).toBe(true);
    expect(evaluateWhen({ field: 'tier', in: ['gold', 'vip'] }, values)).toBe(true);
    expect(evaluateWhen({ field: 'tier', in: ['basic'] }, values)).toBe(false);
    expect(evaluateWhen({ field: 'owner', eq: null }, values)).toBe(true);
    expect(evaluateWhen({ field: 'absent', eq: null }, values)).toBe(true);
    expect(evaluateWhen({ field: 'active', eq: true }, values)).toBe(true);
    expect(evaluateWhen({ field: 'visits', eq: 3 }, values)).toBe(true);
  });

  it('UI-11 set says whether a field has a value: an empty text, null and a missing value have none', () => {
    expect(evaluateWhen({ field: 'tier', set: true }, values)).toBe(true);
    expect(evaluateWhen({ field: 'note', set: true }, values)).toBe(false);
    expect(evaluateWhen({ field: 'note', set: false }, values)).toBe(true);
    expect(evaluateWhen({ field: 'owner', set: true }, values)).toBe(false);
    expect(evaluateWhen({ field: 'visits', set: true }, { visits: 0 })).toBe(true);
    expect(evaluateWhen({ field: 'active', set: true }, { active: false })).toBe(true);
  });

  it('UI-11 all, any and not combine conditions', () => {
    const gold: When = { field: 'tier', eq: 'gold' };
    const off: When = { field: 'active', eq: false };
    expect(evaluateWhen({ all: [gold, { field: 'active', eq: true }] }, values)).toBe(true);
    expect(evaluateWhen({ all: [gold, off] }, values)).toBe(false);
    expect(evaluateWhen({ any: [off, gold] }, values)).toBe(true);
    expect(evaluateWhen({ any: [] }, values)).toBe(false);
    expect(evaluateWhen({ all: [] }, values)).toBe(true);
    expect(evaluateWhen({ not: off }, values)).toBe(true);
  });

  it('UI-11 names the fields that a condition reads, and renames them for another key space', () => {
    const when: When = { all: [{ field: 'owner', eq: null }, { not: { field: 'tier', in: ['basic'] } }] };
    expect(whenFields(when).toSorted()).toEqual(['owner', 'tier']);
    expect(whenFields(mapWhenFields(when, (name) => `${name}Id`)).toSorted()).toEqual(['ownerId', 'tierId']);
    expect(
      evaluateWhen(
        mapWhenFields({ field: 'owner', set: false }, (name) => `${name}Id`),
        { ownerId: null },
      ),
    ).toBe(true);
  });
});

describe('UI-11 a condition that is not one is refused with the place of the mistake', () => {
  const known = new Set(['tier', 'active']);
  it('UI-11 accepts a well formed condition over known fields', () => {
    expect(whenProblem({ field: 'tier', in: ['gold'] }, known, 'note')).toBeUndefined();
    expect(
      whenProblem({ all: [{ field: 'tier', eq: 'a' }, { not: { field: 'active', set: true } }] }, known, 'note'),
    ).toBeUndefined();
  });

  it('UI-11 refuses an unknown field, the field itself, a shape that is none, an empty in and a deep tree', () => {
    expect(whenProblem({ field: 'nope', eq: 1 }, known, 'note')).toContain('nope');
    expect(whenProblem({ field: 'note', eq: 1 }, new Set(['note']), 'note')).toContain('itself');
    expect(whenProblem({ field: 'tier' }, known, 'note')).toContain('eq, ne, in or set');
    expect(whenProblem({ field: 'tier', eq: 1, ne: 2 }, known, 'note')).toContain('one');
    expect(whenProblem({ field: 'tier', in: [] }, known, 'note')).toContain('in');
    expect(whenProblem({ field: 'tier', set: 'yes' }, known, 'note')).toContain('set');
    expect(whenProblem('tier', known, 'note')).toContain('object');
    expect(whenProblem({ all: 'x' }, known, 'note')).toContain('all');
    let deep: unknown = { field: 'tier', eq: 1 };
    for (let n = 0; n < 12; n += 1) deep = { not: deep };
    expect(whenProblem(deep, known, 'note')).toContain('deep');
  });
});

const entity = (fields: Record<string, ReturnType<typeof f.string>>) =>
  defineEntity({
    name: 'crm.Thing',
    table: 'crm_things',
    fields: { id: f.id(), tier: f.oneOf(['a', 'b']).default('a'), ...fields },
  });

describe('UI-11 the admin options of a field', () => {
  it('UI-11 a field may be shown or required by a condition, and the entity keeps it', () => {
    const thing = entity({
      note: f
        .string({ max: 20 })
        .optional()
        .admin({ visibleWhen: { field: 'tier', eq: 'b' }, requiredWhen: { field: 'tier', eq: 'b' } }),
    });
    expect(thing.fields['note']?.admin).toEqual({
      visibleWhen: { field: 'tier', eq: 'b' },
      requiredWhen: { field: 'tier', eq: 'b' },
    });
  });

  it('UI-11 a condition that names an unknown field is DATA_ENTITY_INVALID, with the field that holds it', () => {
    expect(() =>
      entity({
        note: f
          .string({ max: 20 })
          .optional()
          .admin({ visibleWhen: { field: 'nope', eq: 1 } }),
      }),
    ).toThrow(/note.*nope/);
  });

  it('UI-11 a field that a condition can hide must be optional or have a default, because a hidden field is not sent', () => {
    expect(() => entity({ note: f.string({ max: 20 }).admin({ visibleWhen: { field: 'tier', eq: 'b' } }) })).toThrow(
      /optional or have a default/,
    );
    expect(() =>
      entity({
        note: f
          .string({ max: 20 })
          .default('x')
          .admin({ visibleWhen: { field: 'tier', eq: 'b' } }),
      }),
    ).not.toThrow();
  });

  it('UI-11 requiredWhen is for a field that is optional, and not for a field that the server fills', () => {
    expect(() => entity({ note: f.string({ max: 20 }).admin({ requiredWhen: { field: 'tier', eq: 'b' } }) })).toThrow(
      /optional/,
    );
    expect(() => f.sequence({ pattern: 'A-{seq:4}' }).admin({ requiredWhen: { field: 'tier', eq: 'b' } })).toThrow(
      /sequence/,
    );
    expect(() =>
      f
        .state({ initial: 'a', transitions: { go: { from: ['a'], to: 'b' } } })
        .admin({ visibleWhen: { field: 'tier', eq: 'b' } }),
    ).toThrow(/state/);
  });

  it('UI-11 a condition in the options is checked in shape when the field is made', () => {
    expect(() =>
      f
        .string({ max: 5 })
        .optional()
        .admin({ visibleWhen: JSON.parse('{"field":"tier"}') }),
    ).toThrow(/eq, ne, in or set/);
  });
});
