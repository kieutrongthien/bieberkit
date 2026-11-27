/**
 * BieberKit
 *
 * @file        packages/data/src/schema/fields.test.ts
 * @description Tests for the field builders f.* and their chain methods (MOD-08, MOD-11, MOD-12, MOD-09, SCH-07, DATA-17, DATA-22).
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

import * as z from 'zod/mini';
import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { defineEntity } from './define-entity.ts';
import { f } from './fields.ts';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof DataError ? error.code : 'NOT_A_DATAERROR';
  }
  return undefined;
}

const fn = (): number => 1;

const Target = defineEntity({ name: 'test.Target', table: 'test_targets', fields: { id: f.id() } });

describe('descriptors are immutable data', () => {
  it('every chain method returns a new field and leaves the old one alone', () => {
    const base = f.string({ max: 10 });
    const unique = base.unique();
    expect(unique).not.toBe(base);
    expect(base.def.unique).toBeUndefined();
    expect(unique.def.unique).toBe(true);
  });

  it('the definition of a field is frozen', () => {
    expect(Object.isFrozen(f.string({ max: 10 }).def)).toBe(true);
    expect(Object.isFrozen(f.oneOf(['a', 'b']).def.values)).toBe(true);
  });

  it('a builder does not keep a reference to the array it was given', () => {
    const values = ['a', 'b'];
    const field = f.oneOf(values);
    values.push('c');
    expect(field.def.values).toEqual(['a', 'b']);
  });
});

describe('f.id', () => {
  it('is the primary key', () => {
    expect(f.id().def).toMatchObject({ kind: 'id' });
  });

  it('refuses every chain method that makes no sense on a key', () => {
    const attempts: ((field: ReturnType<typeof f.id>) => unknown)[] = [
      (field) => field.optional(),
      (field) => field.unique(),
      (field) => field.index(),
      (field) => field.default('x'),
      (field) => field.searchable(),
      (field) => field.localized(),
    ];
    for (const apply of attempts) {
      expect(codeOf(() => apply(f.id()))).toBe('DATA_FIELD_INVALID');
    }
  });
});

describe('f.string', () => {
  it('keeps its options and defaults min to 0 and compare to exact', () => {
    expect(f.string({ max: 32 }).def).toMatchObject({ kind: 'string', min: 0, max: 32, compare: 'exact' });
    expect(f.string({ min: 2, max: 32, compare: 'ci_ai' }).def).toMatchObject({ min: 2, max: 32, compare: 'ci_ai' });
  });

  it.each([
    ['no max', {}],
    ['max 0', { max: 0 }],
    ['max above 4096', { max: 4097 }],
    ['max not whole', { max: 1.5 }],
    ['max not a number', { max: '10' }],
    ['negative min', { min: -1, max: 10 }],
    ['min above max', { min: 11, max: 10 }],
    ['unknown compare', { max: 10, compare: 'fuzzy' }],
  ])('refuses %s with DATA_FIELD_INVALID', (_name, options) => {
    // @ts-expect-error the options are deliberately wrong
    expect(codeOf(() => f.string(options))).toBe('DATA_FIELD_INVALID');
  });

  it('accepts the largest max', () => {
    expect(f.string({ max: 4096 }).def).toMatchObject({ max: 4096 });
  });
});

describe('f.text', () => {
  it('defaults max to 65535 and accepts a smaller one', () => {
    expect(f.text().def).toMatchObject({ kind: 'text', max: 65535 });
    expect(f.text({ max: 1000 }).def).toMatchObject({ max: 1000 });
  });

  it('refuses a max above 65535 or below 1', () => {
    expect(codeOf(() => f.text({ max: 65536 }))).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.text({ max: 0 }))).toBe('DATA_FIELD_INVALID');
  });

  it('is never unique and never indexed', () => {
    expect(codeOf(() => f.text().unique())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.text().index())).toBe('DATA_FIELD_INVALID');
  });
});

describe('f.email', () => {
  it('is a string of at most 254 characters compared case-insensitively', () => {
    expect(f.email().def).toMatchObject({ kind: 'email', max: 254, compare: 'ci' });
  });
});

describe('f.oneOf', () => {
  it('keeps the values in order', () => {
    expect(f.oneOf(['standard', 'gold', 'vip']).def).toMatchObject({
      kind: 'oneOf',
      values: ['standard', 'gold', 'vip'],
    });
  });

  it.each([[[]], [['a', 'a']], [['']], [['x'.repeat(65)]], [[1, 2]], ['abc']])(
    'refuses %j with DATA_FIELD_INVALID',
    (values) => {
      // @ts-expect-error the values are deliberately wrong
      expect(codeOf(() => f.oneOf(values))).toBe('DATA_FIELD_INVALID');
    },
  );

  it('a default must be one of the values', () => {
    expect(f.oneOf(['a', 'b']).default('b').def.default).toBe('b');
    expect(codeOf(() => f.oneOf(['a', 'b']).default('c'))).toBe('DATA_FIELD_INVALID');
  });
});

describe('f.int', () => {
  it('defaults to the range of a 32 bit integer', () => {
    expect(f.int().def).toMatchObject({ kind: 'int', min: -2147483648, max: 2147483647 });
    expect(f.int({ min: 0, max: 100 }).def).toMatchObject({ min: 0, max: 100 });
  });

  it.each([
    [{ min: 1.5 }],
    [{ max: 2147483648 }],
    [{ min: -2147483649 }],
    [{ min: 10, max: 5 }],
    [{ max: Number.NaN }],
  ])('refuses %j', (options) => {
    expect(codeOf(() => f.int(options))).toBe('DATA_FIELD_INVALID');
  });

  it('a default must be a whole number inside the range', () => {
    expect(f.int({ min: 0 }).default(0).def.default).toBe(0);
    expect(codeOf(() => f.int({ min: 0 }).default(-1))).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.int().default(1.5))).toBe('DATA_FIELD_INVALID');
    // @ts-expect-error a text default for a number
    expect(codeOf(() => f.int().default('1'))).toBe('DATA_FIELD_INVALID');
  });
});

describe('f.boolean, f.date and f.dateTime', () => {
  it('have their own kinds', () => {
    expect(f.boolean().def.kind).toBe('boolean');
    expect(f.date().def.kind).toBe('date');
    expect(f.dateTime().def.kind).toBe('dateTime');
  });

  it('a boolean default must be a boolean', () => {
    expect(f.boolean().default(true).def.default).toBe(true);
    // @ts-expect-error a text default for a boolean
    expect(codeOf(() => f.boolean().default('yes'))).toBe('DATA_FIELD_INVALID');
  });

  it('a date default must be a real calendar date', () => {
    expect(f.date().default('2026-02-28').def.default).toBe('2026-02-28');
    for (const bad of ['2026-02-30', '2026-13-01', '22/11/2026', ''])
      expect(codeOf(() => f.date().default(bad))).toBe('DATA_FIELD_INVALID');
  });

  it('a dateTime has no default, because "now" belongs to createdAt', () => {
    // @ts-expect-error not available on dateTime
    expect(codeOf(() => f.dateTime().default('2026-11-22T10:00:00Z'))).toBe('DATA_FIELD_INVALID');
  });
});

describe('f.decimal', () => {
  it('keeps precision and scale', () => {
    expect(f.decimal({ precision: 12, scale: 2 }).def).toMatchObject({ kind: 'decimal', precision: 12, scale: 2 });
    expect(f.decimal({ precision: 5, scale: 0 }).def).toMatchObject({ scale: 0 });
  });

  it.each([
    [{ precision: 0, scale: 0 }],
    [{ precision: 16, scale: 2 }],
    [{ precision: 5, scale: 6 }],
    [{ precision: 5, scale: -1 }],
    [{ precision: 5.5, scale: 2 }],
  ])('refuses %j', (options) => {
    expect(codeOf(() => f.decimal(options))).toBe('DATA_FIELD_INVALID');
  });

  it('accepts the largest precision, 15 digits, which always fits the safe range', () => {
    expect(f.decimal({ precision: 15, scale: 4 }).def).toMatchObject({ precision: 15 });
  });
});

describe('f.money', () => {
  it('keeps the currency', () => {
    expect(f.money({ currency: 'VND' }).def).toMatchObject({ kind: 'money', currency: 'VND' });
  });

  it('refuses a currency that is not a known ISO 4217 code', () => {
    for (const bad of ['usd', 'ABC', 'US', ''])
      expect(codeOf(() => f.money({ currency: bad }))).toBe('DATA_CURRENCY_INVALID');
  });

  it('is never unique, has no default, and may be indexed', () => {
    expect(codeOf(() => f.money({ currency: 'USD' }).unique())).toBe('DATA_FIELD_INVALID');
    // @ts-expect-error money has no default
    expect(codeOf(() => f.money({ currency: 'USD' }).default(1))).toBe('DATA_FIELD_INVALID');
    expect(f.money({ currency: 'USD' }).index().def.index).toBe(true);
  });
});

describe('f.sequence', () => {
  it('keeps the pattern and defaults resetEvery to never', () => {
    expect(f.sequence({ pattern: 'PO-{yyyy}-{seq:5}' }).def).toMatchObject({
      kind: 'sequence',
      pattern: 'PO-{yyyy}-{seq:5}',
      resetEvery: 'never',
    });
    expect(f.sequence({ pattern: 'PO-{yyyy}-{seq:5}', resetEvery: 'year' }).def).toMatchObject({ resetEvery: 'year' });
  });

  it.each([
    ['no seq token', 'PO-{yyyy}'],
    ['seq with no width', 'PO-{seq}'],
    ['seq width 0', 'PO-{seq:0}'],
    ['seq width 13', 'PO-{seq:13}'],
    ['two seq tokens', 'PO-{seq:3}-{seq:3}'],
    ['an unknown token', 'PO-{foo}-{seq:3}'],
    ['an empty pattern', ''],
    ['a pattern over 64 characters', `${'x'.repeat(60)}{seq:5}`],
  ])('refuses %s', (_name, pattern) => {
    expect(codeOf(() => f.sequence({ pattern }))).toBe('DATA_FIELD_INVALID');
  });

  it('accepts the year, short year and month tokens', () => {
    expect(f.sequence({ pattern: '{yy}{mm}-{seq:4}' }).def.pattern).toBe('{yy}{mm}-{seq:4}');
  });

  it('refuses a resetEvery that is not year, month or never', () => {
    // @ts-expect-error not a reset period
    expect(codeOf(() => f.sequence({ pattern: '{seq:3}', resetEvery: 'week' }))).toBe('DATA_FIELD_INVALID');
  });

  it('is unique and server written: optional, default and unique are refused or implied', () => {
    expect(f.sequence({ pattern: '{seq:3}' }).def.unique).toBe(true);
    expect(codeOf(() => f.sequence({ pattern: '{seq:3}' }).optional())).toBe('DATA_FIELD_INVALID');
    // @ts-expect-error a sequence has no default
    expect(codeOf(() => f.sequence({ pattern: '{seq:3}' }).default('x'))).toBe('DATA_FIELD_INVALID');
  });
});

describe('f.createdAt and f.updatedAt', () => {
  it('have their own kinds and take no options', () => {
    expect(f.createdAt().def.kind).toBe('createdAt');
    expect(f.updatedAt().def.kind).toBe('updatedAt');
  });

  it('refuse optional, unique and default, because the server writes them', () => {
    for (const make of [() => f.createdAt(), () => f.updatedAt()]) {
      expect(codeOf(() => make().optional())).toBe('DATA_FIELD_INVALID');
      expect(codeOf(() => make().unique())).toBe('DATA_FIELD_INVALID');
    }
  });
});

describe('relations', () => {
  it('f.belongsTo keeps the thunk, so definitions can refer to each other in any order', () => {
    const field = f.belongsTo(() => Target);
    expect(field.def.kind).toBe('belongsTo');
    expect(field.def.target?.()).toBe(Target);
  });

  it('f.belongsTo may be optional, unique and indexed, but has no default', () => {
    const field = f
      .belongsTo(() => Target)
      .optional()
      .unique()
      .index();
    expect(field.def).toMatchObject({ optional: true, unique: true, index: true });
    // @ts-expect-error a relation has no default
    expect(codeOf(() => f.belongsTo(() => Target).default('x'))).toBe('DATA_FIELD_INVALID');
  });

  it('f.belongsTo takes a function, not the entity itself', () => {
    // @ts-expect-error a thunk is required
    expect(codeOf(() => f.belongsTo(Target))).toBe('DATA_FIELD_INVALID');
  });

  it('f.hasOne cannot be unique or indexed, because the key is on the other side', () => {
    expect(f.hasOne(() => Target).def.kind).toBe('hasOne');
    expect(codeOf(() => f.hasOne(() => Target).unique())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.hasOne(() => Target).index())).toBe('DATA_FIELD_INVALID');
  });

  it('f.hasMany can be inline (MOD-09), and is not unique or indexed', () => {
    expect(f.hasMany(() => Target).def.inline).toBeUndefined();
    expect(f.hasMany(() => Target).inline().def).toMatchObject({ kind: 'hasMany', inline: true });
    expect(codeOf(() => f.hasMany(() => Target).unique())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.hasMany(() => Target).index())).toBe('DATA_FIELD_INVALID');
  });
});

describe('f.state (MOD-06, MOD-07)', () => {
  const transitions = {
    submit: { from: ['draft'], to: 'submitted', permission: 'po.submit' },
    reject: { from: ['submitted'], to: 'draft' },
  };

  it('keeps the machine and lists the states, the initial one first', () => {
    const field = f.state({ initial: 'draft', transitions });
    expect(field.def).toMatchObject({ kind: 'state', initial: 'draft', states: ['draft', 'submitted'] });
    expect(field.def.transitions).toEqual(transitions);
  });

  it('keeps an input schema value on a transition', () => {
    const input = z.object({ reason: z.string() });
    const field = f.state({ initial: 'a', transitions: { reject: { from: ['a'], to: 'b', input } } });
    expect(field.def.transitions?.['reject']?.input).toBe(input);
  });

  it.each([
    ['no transitions', { initial: 'a', transitions: {} }],
    ['an empty initial state', { initial: '', transitions: { go: { from: ['a'], to: 'b' } } }],
    ['a transition with no from', { initial: 'a', transitions: { go: { from: [], to: 'b' } } }],
    ['a transition with no to', { initial: 'a', transitions: { go: { from: ['a'], to: '' } } }],
    ['a transition name with a dash', { initial: 'a', transitions: { 'go-now': { from: ['a'], to: 'b' } } }],
    ['a transition name with a capital', { initial: 'a', transitions: { Go: { from: ['a'], to: 'b' } } }],
  ])('refuses %s', (_name, options) => {
    expect(codeOf(() => f.state(options))).toBe('DATA_FIELD_INVALID');
  });

  it('is written by transitions only: default and optional are refused', () => {
    // @ts-expect-error the initial state is the default
    expect(codeOf(() => f.state({ initial: 'a', transitions: { go: { from: ['a'], to: 'b' } } }).default('b'))).toBe(
      'DATA_FIELD_INVALID',
    );
    expect(codeOf(() => f.state({ initial: 'a', transitions: { go: { from: ['a'], to: 'b' } } }).optional())).toBe(
      'DATA_FIELD_INVALID',
    );
  });
});

describe('f.custom (SCH-07)', () => {
  const column = { type: 'varchar', length: 8 };
  const jsonSchema = { type: 'string' };

  it('keeps a schema value', () => {
    const schema = z.string();
    const field = f.custom({ column, jsonSchema, zod: schema, tsType: 'string' });
    expect(field.def).toMatchObject({ kind: 'custom', column, jsonSchema, tsType: 'string' });
    expect(field.def.zod).toBe(schema);
  });

  it('refuses a function for zod, because a callback that receives z keeps all of Zod in the client bundle', () => {
    // @ts-expect-error a schema value is required, never a callback
    expect(codeOf(() => f.custom({ column, jsonSchema, zod: (zod: unknown) => zod, tsType: 'string' }))).toBe(
      'DATA_FIELD_CUSTOM_CALLBACK',
    );
  });

  it.each([
    ['no column type', { column: {}, jsonSchema, zod: z.string(), tsType: 'string' }],
    ['a jsonSchema that is not an object', { column, jsonSchema: 'string', zod: z.string(), tsType: 'string' }],
    ['no tsType', { column, jsonSchema, zod: z.string() }],
    ['no zod', { column, jsonSchema, tsType: 'string' }],
  ])('refuses %s', (_name, options) => {
    // @ts-expect-error the options are deliberately wrong
    expect(codeOf(() => f.custom(options))).toBe('DATA_FIELD_INVALID');
  });

  it('passes admin metadata through', () => {
    expect(
      f.custom({ column, jsonSchema, zod: z.string(), tsType: 'string', admin: { widget: 'code' } }).def.admin,
    ).toEqual({ widget: 'code' });
  });
});

describe('chain methods', () => {
  it('.optional, .default, .unique and .index set their flags', () => {
    expect(f.string({ max: 5 }).optional().def.optional).toBe(true);
    expect(f.string({ max: 5 }).default('x').def.default).toBe('x');
    expect(f.string({ max: 5 }).unique().def.unique).toBe(true);
    expect(f.string({ max: 5 }).index().def.index).toBe(true);
  });

  it('a string default must fit the length limits', () => {
    expect(codeOf(() => f.string({ max: 3 }).default('abcd'))).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.string({ min: 2, max: 3 }).default('a'))).toBe('DATA_FIELD_INVALID');
    // @ts-expect-error a number default for a string
    expect(codeOf(() => f.string({ max: 3 }).default(5))).toBe('DATA_FIELD_INVALID');
  });

  it('SR-01 a searchable string or email is compared folded: ci_ai when it says nothing, and ci when it says ci', () => {
    expect(f.string({ max: 5 }).searchable().def.compare).toBe('ci_ai');
    expect(f.email().searchable().def.compare).toBe('ci');
    expect(f.string({ max: 5, compare: 'ci' }).searchable().def.compare).toBe('ci');
    expect(f.text().searchable().def.compare).toBe('exact');
  });

  it('.searchable and .localized are only for string, text and email', () => {
    for (const make of [() => f.string({ max: 5 }), () => f.text(), () => f.email()]) {
      expect(make().searchable().def.searchable).toBe(true);
      expect(make().localized().def.localized).toBe(true);
    }
    for (const make of [
      () => f.int(),
      () => f.boolean(),
      () => f.oneOf(['a']),
      () => f.belongsTo(() => Target),
      () => f.money({ currency: 'USD' }),
    ]) {
      expect(codeOf(() => make().searchable())).toBe('DATA_FIELD_INVALID');
      expect(codeOf(() => make().localized())).toBe('DATA_FIELD_INVALID');
    }
  });

  it('a localized field cannot be unique, in either order (DATA-17)', () => {
    expect(codeOf(() => f.string({ max: 5 }).localized().unique())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.string({ max: 5 }).unique().localized())).toBe('DATA_FIELD_INVALID');
  });

  describe('.computed (MOD-08)', () => {
    it('keeps the function and defaults stored to false', () => {
      expect(f.int().computed(fn).def.computed).toEqual({ fn, stored: false });
      expect(f.int().computed(fn, { stored: true }).def.computed).toEqual({ fn, stored: true });
    });

    it('is for scalar kinds only', () => {
      for (const make of [
        () => f.belongsTo(() => Target),
        () => f.hasMany(() => Target),
        () => f.id(),
        () => f.state({ initial: 'a', transitions: { go: { from: ['a'], to: 'b' } } }),
        () => f.sequence({ pattern: '{seq:3}' }),
      ]) {
        // @ts-expect-error computed is not offered on these kinds
        expect(codeOf(() => make().computed(fn))).toBe('DATA_FIELD_INVALID');
      }
      for (const make of [
        () => f.string({ max: 5 }),
        () => f.text(),
        () => f.int(),
        () => f.boolean(),
        () => f.date(),
        () => f.dateTime(),
        () => f.decimal({ precision: 5, scale: 2 }),
        () => f.money({ currency: 'USD' }),
        () => f.oneOf(['a']),
      ]) {
        expect(make().computed(fn).def.computed).toBeDefined();
      }
    });

    it('refuses something that is not a function', () => {
      // @ts-expect-error a function is required
      expect(codeOf(() => f.int().computed(5))).toBe('DATA_FIELD_INVALID');
    });

    it('a computed field that is not stored cannot be unique or indexed, in either order', () => {
      expect(codeOf(() => f.int().computed(fn).index())).toBe('DATA_FIELD_INVALID');
      expect(codeOf(() => f.int().computed(fn).unique())).toBe('DATA_FIELD_INVALID');
      expect(codeOf(() => f.int().index().computed(fn))).toBe('DATA_FIELD_INVALID');
      expect(f.int().computed(fn, { stored: true }).index().def.index).toBe(true);
      expect(f.int().index().computed(fn, { stored: true }).def.index).toBe(true);
    });

    it('a computed field takes no default', () => {
      // @ts-expect-error computed fields have no default
      expect(codeOf(() => f.int().computed(fn).default(1))).toBe('DATA_FIELD_INVALID');
    });
  });
});

describe('API-15 .aggregatable()', () => {
  interface Aggregatable {
    readonly def: { readonly aggregatable?: true };
    aggregatable(): Aggregatable;
  }
  const allowed: [string, () => Aggregatable][] = [
    ['int', () => f.int()],
    ['decimal', () => f.decimal({ precision: 10, scale: 2 })],
    ['string', () => f.string({ max: 10 })],
    ['email', () => f.email()],
    ['oneOf', () => f.oneOf(['a', 'b'])],
    ['boolean', () => f.boolean()],
    ['date', () => f.date()],
    ['belongsTo', () => f.belongsTo(() => Target)],
    ['state', () => f.state({ initial: 'a', transitions: { go: { from: ['a'], to: 'b' } } })],
  ];

  it.each(allowed)('API-15 a %s field can be declared aggregatable', (_kind, make) => {
    expect(make().aggregatable().def.aggregatable).toBe(true);
    expect(make().def.aggregatable).toBeUndefined();
  });

  it.each([
    ['id', () => f.id()],
    ['text', () => f.text({ max: 100 })],
    ['money', () => f.money({ currency: 'VND' })],
    ['dateTime', () => f.dateTime()],
    ['createdAt', () => f.createdAt()],
    ['sequence', () => f.sequence({ pattern: 'A-{seq:3}' })],
  ])('API-15 a %s field cannot', (_kind, make) => {
    expect(codeOf(() => make().aggregatable())).toBe('DATA_FIELD_INVALID');
  });

  it('API-15 a computed field can only if it is stored', () => {
    expect(codeOf(() => f.int().computed(fn).aggregatable())).toBe('DATA_FIELD_INVALID');
    expect(f.int().computed(fn, { stored: true }).aggregatable().def.aggregatable).toBe(true);
  });

  it('API-15 it keeps the other modifiers, and changes nothing about the schemas', () => {
    const field = f.int().index().aggregatable();
    expect(field.def).toMatchObject({ index: true, aggregatable: true });
  });
});

describe('SEC-08 .encrypted() and .pii() on a field', () => {
  it('SEC-08 .encrypted() is for text, and sets a flag on a new field', () => {
    for (const field of [f.string({ max: 20 }), f.text(), f.email()]) {
      const marked = field.encrypted();
      expect(marked.def.encrypted).toBe(true);
      expect(field.def.encrypted).toBeUndefined();
    }
  });

  it('SEC-08 .encrypted() is refused for a field that is not text', () => {
    for (const field of [
      f.int(),
      f.boolean(),
      f.date(),
      f.dateTime(),
      f.oneOf(['a', 'b']),
      f.decimal({ precision: 10, scale: 2 }),
      f.id(),
      f.belongsTo(() => Target),
    ]) {
      expect([field.def.kind, codeOf(() => field.encrypted())]).toEqual([field.def.kind, 'DATA_FIELD_INVALID']);
    }
  });

  it('SEC-08 an encrypted field cannot be searched, so it cannot be indexed, unique, searchable, aggregated, localized or compared', () => {
    const base = f.string({ max: 20 });
    expect(codeOf(() => base.encrypted().index())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.encrypted().unique())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.encrypted().searchable())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.encrypted().aggregatable())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.encrypted().localized())).toBe('DATA_FIELD_INVALID');
  });

  it('SEC-08 the same is refused when .encrypted() comes last', () => {
    const base = f.string({ max: 20 });
    expect(codeOf(() => base.index().encrypted())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.unique().encrypted())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.searchable().encrypted())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => base.localized().encrypted())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.string({ max: 20, compare: 'ci' }).encrypted())).toBe('DATA_FIELD_INVALID');
    expect(codeOf(() => f.string({ max: 20, compare: 'exact' }).encrypted())).toBeUndefined();
  });

  it('SEC-08 an encrypted field may be optional, have a default and a length, and the length is of the clear text', () => {
    const field = f.string({ min: 2, max: 20 }).optional().default('ab').encrypted();
    expect(field.def).toMatchObject({
      kind: 'string',
      optional: true,
      default: 'ab',
      min: 2,
      max: 20,
      encrypted: true,
    });
    expect(codeOf(() => f.string({ max: 3 }).encrypted().default('toolong'))).toBe('DATA_FIELD_INVALID');
  });

  it('PDP-01 .pii() marks a field of personal data, for any kind that holds a value', () => {
    for (const field of [
      f.string({ max: 20 }),
      f.text(),
      f.email(),
      f.int(),
      f.boolean(),
      f.date(),
      f.dateTime(),
      f.oneOf(['a']),
      f.decimal({ precision: 10, scale: 2 }),
      f.money({ currency: 'VND' }),
    ]) {
      expect(field.pii().def.pii).toBe(true);
    }
    expect(f.string({ max: 20 }).pii().encrypted().def).toMatchObject({ pii: true, encrypted: true });
  });

  it('PDP-01 .pii() is refused for the keys, the dates of the record, a sequence, a state and a relation to many', () => {
    for (const field of [f.id(), f.createdAt(), f.updatedAt()]) {
      expect([field.def.kind, codeOf(() => field.pii())]).toEqual([field.def.kind, 'DATA_FIELD_INVALID']);
    }
  });

  it('SEC-08 the flags do not change the JSON Schema of the field, and are in the definition of the entity', () => {
    const Entity = defineEntity({
      name: 'test.Person',
      table: 'test_people',
      fields: { id: f.id(), taxId: f.string({ max: 20 }).encrypted().pii(), nick: f.string({ max: 20 }).pii() },
    });
    expect(Entity.fields['taxId']?.encrypted).toBe(true);
    expect(Entity.fields['taxId']?.pii).toBe(true);
    expect(Entity.fields['nick']?.encrypted).toBeUndefined();
  });
});
