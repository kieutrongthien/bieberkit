/**
 * BieberKit
 *
 * @file        packages/admin-core/src/i18n.test.ts
 * @description Tests of the languages of the admin: the three dictionaries, their parity, the choice of a language and the formats of numbers, dates and money (UI-05).
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
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  LOCALES,
  localeOf,
  MESSAGES,
  translator,
} from './i18n.ts';
import type { Locale, MessageKey } from './i18n.ts';

const isKey = (key: string): key is MessageKey => key in MESSAGES.en;
const KEYS: readonly MessageKey[] = Object.keys(MESSAGES.en).filter(isKey);

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').toSorted();

describe('UI-05 the dictionaries', () => {
  it('UI-05 en, vi and zh are bundled, and the three have the same keys', () => {
    expect(LOCALES).toEqual(['en', 'vi', 'zh']);
    const keys = Object.keys(MESSAGES.en).toSorted();
    expect(keys.length).toBeGreaterThan(20);
    for (const locale of LOCALES) expect(Object.keys(MESSAGES[locale]).toSorted()).toEqual(keys);
  });

  it('UI-05 no text is empty, and a text of another language has the same placeholders as the English one', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        const text = MESSAGES[locale][key];
        expect(text.trim() === '' ? `${locale}.${key} is empty` : '').toBe('');
        expect(placeholders(text)).toEqual(placeholders(MESSAGES.en[key]));
      }
    }
  });

  it('UI-05 a language other than English is really translated: most of its texts differ from the English ones', () => {
    for (const locale of ['vi', 'zh'] as const) {
      const same = KEYS.filter((key) => MESSAGES[locale][key] === MESSAGES.en[key]);
      expect(same.length < 5).toBe(true);
    }
  });
});

describe('UI-05 the translator', () => {
  it('UI-05 gives the text of the language, and fills the placeholders', () => {
    expect(translator('en')('form.edit', { name: 'Customer' })).toBe('Edit Customer');
    expect(translator('vi')('form.edit', { name: 'Khách hàng' })).toContain('Khách hàng');
    expect(translator('zh')('list.new')).toBe(MESSAGES.zh['list.new']);
  });

  it('UI-05 a placeholder that is not given stays as it is, so a mistake shows and does not hide', () => {
    expect(translator('en')('form.edit')).toBe('Edit {name}');
  });

  it('UI-05 a value cannot add a placeholder of its own to the text', () => {
    expect(translator('en')('form.edit', { name: '{name}' })).toBe('Edit {name}');
  });
});

describe('UI-05 the choice of a language', () => {
  it('UI-05 a saved choice wins, then the first language of the browser that is bundled, then English', () => {
    expect(localeOf(['vi-VN', 'en'], 'zh')).toBe('zh');
    expect(localeOf(['fr-FR', 'vi-VN', 'en'], undefined)).toBe('vi');
    expect(localeOf(['zh-Hans-CN'], undefined)).toBe('zh');
    expect(localeOf(['fr', 'de'], undefined)).toBe('en');
    expect(localeOf([], undefined)).toBe('en');
  });

  it('UI-05 a saved choice that is not a bundled language is ignored', () => {
    expect(localeOf(['vi'], 'klingon')).toBe('vi');
  });

  it('UI-05 the supported languages of the project narrow the choice', () => {
    expect(localeOf(['vi'], undefined, ['en', 'zh'])).toBe('en');
    expect(localeOf(['zh'], undefined, ['en', 'zh'])).toBe('zh');
  });
});

describe('UI-05 numbers, dates and money follow the language', () => {
  it('UI-05 a number is written with the separators of the language', () => {
    expect(formatNumber('en', 1234.5)).toBe('1,234.5');
    expect(formatNumber('vi', 1234.5)).toBe('1.234,5');
  });

  it('UI-05 a date and an instant are written for the language, in UTC unless a zone is given', () => {
    expect(formatDate('en', '2026-03-05')).toBe('Mar 5, 2026');
    expect(formatDate('vi', '2026-03-05')).toContain('2026');
    expect(formatDateTime('en', '2026-03-05T10:30:00.000Z', 'UTC')).toContain('10:30');
    expect(formatDateTime('en', '2026-03-05T10:30:00.000Z', 'Asia/Ho_Chi_Minh')).toContain('5:30');
  });

  it('UI-05 money is an amount of text and a currency: VND has no decimals, USD has two, and the text keeps its precision', () => {
    expect(formatMoney('vi', '1500000', 'VND')).toMatch(/1\.500\.000/);
    expect(formatMoney('en', '12.5', 'USD')).toBe('$12.50');
    expect(formatMoney('en', '9007199254740993.10', 'USD')).toContain('9,007,199,254,740,993.10');
  });

  it('UI-05 a value that is not a number or a date is shown as it came, and nothing throws', () => {
    expect(formatNumber('en', 'abc')).toBe('abc');
    expect(formatDate('en', 'not a date')).toBe('not a date');
    expect(formatMoney('en', 'x', 'USD')).toBe('x USD');
  });

  it('UI-05 every locale formats without throwing', () => {
    for (const locale of LOCALES satisfies readonly Locale[]) {
      expect(formatNumber(locale, 1)).not.toBe('');
      expect(formatMoney(locale, '1', 'VND')).not.toBe('');
    }
  });
});
