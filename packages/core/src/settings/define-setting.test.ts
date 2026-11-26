/**
 * BieberKit
 *
 * @file        packages/core/src/settings/define-setting.test.ts
 * @description Tests of defineSetting: a valid declaration of each type, the refusals of a bad one, the check of a value and the type of a declaration (SET-01, ADR 0030).
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

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Parser } from '../config/parser.ts';
import { defineSetting } from './define-setting.ts';
import type { SettingDef } from './define-setting.ts';

const label = { en: 'A setting' } as const;

/** A hand-written parser, as a Zod Mini schema would be: an object with a throwing `parse`. */
const colors: Parser<{ primary: string }> = {
  parse(input) {
    const primary: unknown = Reflect.get(Object(input), 'primary');
    if (typeof primary !== 'string' || !/^#[0-9a-f]{6}$/.test(primary)) throw new Error('primary must be a hex color');
    return { primary };
  },
};

describe('SET-01 defineSetting', () => {
  it('SET-01 declares a setting of each type, with global scope and neither public nor secret by default', () => {
    const name = defineSetting({ key: 'site.name', type: 'string', default: 'BieberKit', label });
    expect(name).toMatchObject({
      key: 'site.name',
      type: 'string',
      default: 'BieberKit',
      label,
      scope: 'global',
      public: false,
      secret: false,
    });
    expect(defineSetting({ key: 'site.items', type: 'number', default: 25, label }).default).toBe(25);
    expect(defineSetting({ key: 'site.open', type: 'boolean', default: true, label, scope: 'tenant' }).scope).toBe(
      'tenant',
    );
    expect(
      defineSetting({ key: 'site.locale', type: 'enum', values: ['en', 'vi'], default: 'vi', label }).values,
    ).toEqual(['en', 'vi']);
    expect(
      defineSetting({ key: 'site.theme', type: 'json', parser: colors, default: { primary: '#123456' }, label }),
    ).toMatchObject({ type: 'json', default: { primary: '#123456' } });
  });

  it('SET-01 a declaration is frozen, so nobody changes it after boot', () => {
    const name = defineSetting({ key: 'site.name', type: 'string', default: '', label });
    expect(Object.isFrozen(name)).toBe(true);
  });

  it.each([
    ['an empty key', { key: '', type: 'string', default: '', label }],
    ['a key without a dot', { key: 'name', type: 'string', default: '', label }],
    ['a key in upper case', { key: 'Site.Name', type: 'string', default: '', label }],
    ['a key over 120 characters', { key: `site.${'a'.repeat(120)}`, type: 'string', default: '', label }],
    ['an unknown type', { key: 'site.x', type: 'date', default: '', label }],
    ['an enum without values', { key: 'site.x', type: 'enum', default: 'a', label }],
    ['an enum with a default outside its values', { key: 'site.x', type: 'enum', values: ['a'], default: 'b', label }],
    ['a json setting without a parser', { key: 'site.x', type: 'json', default: {}, label }],
    ['a json default that the parser refuses', { key: 'site.x', type: 'json', parser: colors, default: {}, label }],
    ['a default of the wrong type', { key: 'site.x', type: 'number', default: 'ten', label }],
    ['a number default that is not finite', { key: 'site.x', type: 'number', default: Number.NaN, label }],
    ['a label without English', { key: 'site.x', type: 'string', default: '', label: { vi: 'Tên' } }],
    ['a secret that is public', { key: 'site.x', type: 'string', default: '', label, secret: true, public: true }],
    ['an unknown scope', { key: 'site.x', type: 'string', default: '', label, scope: 'user' }],
  ])('SET-01 refuses %s with CORE_SETTING_INVALID', (_why, input) => {
    // The input is wrong on purpose, so its type is not one that defineSetting accepts.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    expect(() => defineSetting(input as never)).toThrow(expect.objectContaining({ code: 'CORE_SETTING_INVALID' }));
  });

  it('SET-01 check gives the value of a valid input and refuses a bad one with the reason', () => {
    const items = defineSetting({ key: 'site.items', type: 'number', default: 25, label });
    expect(items.check(10)).toBe(10);
    expect(() => items.check('10')).toThrow(expect.objectContaining({ code: 'CORE_SETTING_VALUE' }));
    const locale = defineSetting({ key: 'site.locale', type: 'enum', values: ['en', 'vi'], default: 'vi', label });
    expect(() => locale.check('fr')).toThrow(/en, vi/);
    const theme = defineSetting({
      key: 'site.theme',
      type: 'json',
      parser: colors,
      default: { primary: '#123456' },
      label,
    });
    expect(theme.check({ primary: '#abcdef' })).toEqual({ primary: '#abcdef' });
    expect(() => theme.check({ primary: 'red' })).toThrow(/hex color/);
    const open = defineSetting({ key: 'site.open', type: 'boolean', default: true, label });
    expect(() => open.check('true')).toThrow(expect.objectContaining({ code: 'CORE_SETTING_VALUE' }));
  });

  it('SET-05 the type of a value comes from the declaration', () => {
    const name = defineSetting({ key: 'site.name', type: 'string', default: 'x', label });
    expectTypeOf(name).toEqualTypeOf<SettingDef<string>>();
    expectTypeOf(
      defineSetting({ key: 'site.items', type: 'number', default: 1, label }).default,
    ).toEqualTypeOf<number>();
    expectTypeOf(
      defineSetting({ key: 'site.locale', type: 'enum', values: ['en', 'vi'] as const, default: 'vi', label }).default,
    ).toEqualTypeOf<'en' | 'vi'>();
    const theme = defineSetting({
      key: 'site.theme',
      type: 'json',
      parser: colors,
      default: { primary: '#123456' },
      label,
    });
    expectTypeOf(theme).toEqualTypeOf<SettingDef<{ primary: string }>>();
  });
});
