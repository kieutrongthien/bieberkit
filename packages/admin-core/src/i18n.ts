/**
 * BieberKit
 *
 * @file        packages/admin-core/src/i18n.ts
 * @description The languages of the admin: the dictionaries of en, vi and zh, the translator, the choice of a language and the formats of numbers, dates and money (UI-05).
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

import { en } from './messages/en.ts';
import type { Dictionary, MessageKey } from './messages/en.ts';

export type Locale = 'en' | 'vi' | 'zh';

/** The languages that are bundled (UI-05). */
export const LOCALES: readonly Locale[] = ['en', 'vi', 'zh'];

export type { Dictionary, MessageKey } from './messages/en.ts';

/**
 * The dictionary of a language. English is in the bundle, because every text that another language lacks falls back to it and the screen
 * before the first answer is in it. Vietnamese and Chinese are chunks of their own, read when a person chooses them (UI-12).
 */
export async function loadMessages(locale: Locale): Promise<Dictionary> {
  switch (locale) {
    case 'vi':
      return (await import('./messages/vi.ts')).vi;
    case 'zh':
      return (await import('./messages/zh.ts')).zh;
    default:
      return en;
  }
}

/** The language tag that `Intl` takes for each language. */
const TAGS: Readonly<Record<Locale, string>> = { en: 'en-US', vi: 'vi-VN', zh: 'zh-CN' };

/** A function that gives the text of a key in one language. `{name}` in the text is replaced by `values.name`, once, so a value cannot add a placeholder. */
export function translator(
  dictionary: Dictionary = en,
): (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string {
  return (key, values) =>
    dictionary[key].replaceAll(/\{(\w+)\}/g, (found, name: string) => {
      const value = values?.[name];
      return value === undefined ? found : String(value);
    });
}

const isLocale = (value: unknown, among: readonly Locale[]): value is Locale =>
  among.some((locale) => locale === value);

/**
 * The language of a person: the one that they chose, if it is bundled and the project supports it; then the first language of the
 * browser that is; then English, or the first that the project supports.
 */
export function localeOf(
  languages: readonly string[],
  saved: string | undefined,
  supported: readonly Locale[] = LOCALES,
): Locale {
  if (isLocale(saved, supported)) return saved;
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    const found = supported.find((locale) => locale === primary);
    if (found !== undefined) return found;
  }
  return supported.includes('en') ? 'en' : (supported[0] ?? 'en');
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const isDecimal = (text: string): text is `${number}` => DECIMAL.test(text);

/** A number in the separators of the language. Text that is not a number comes back as it is. */
export function formatNumber(locale: Locale, value: number | string): string {
  if (typeof value === 'number')
    return Number.isFinite(value) ? new Intl.NumberFormat(TAGS[locale]).format(value) : String(value);
  return isDecimal(value) ? new Intl.NumberFormat(TAGS[locale], { maximumFractionDigits: 20 }).format(value) : value;
}

/** A calendar day (`YYYY-MM-DD`) in the language. It has no time, so no zone moves it. */
export function formatDate(locale: Locale, day: string): string {
  if (!DAY.test(day)) return day;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(TAGS[locale], { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** An instant (ISO 8601) in the language, in a zone: UTC unless the person's zone is given. */
export function formatDateTime(locale: Locale, instant: string, timeZone = 'UTC'): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return new Intl.DateTimeFormat(TAGS[locale], { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

/** An amount that the API sends as text, in its currency. The digits of the text are kept as they are: no number carries them. */
export function formatMoney(locale: Locale, amount: string, currency: string): string {
  if (!isDecimal(amount)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(TAGS[locale], { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
