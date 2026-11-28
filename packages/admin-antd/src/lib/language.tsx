/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/lib/language.tsx
 * @description The language of the screens: the choice of a person, the translator of the screens and the locale of Ant Design with its two missing Vietnamese texts (UI-05).
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

import { ENGLISH, loadMessages, localeOf, LOCALES, translator } from '@bieberkit/admin-core';
import type { AdminPart, Dictionary, Locale, MessageKey, Texts } from '@bieberkit/admin-core';
import type { ConfigProviderProps } from 'antd';
import enUS from 'antd/locale/en_US';
import { createContext, useContext, useMemo } from 'react';
import type { Context } from 'react';
import { loadTexts } from './texts.ts';

type AntLocale = NonNullable<ConfigProviderProps['locale']>;

const STORAGE_KEY = 'bk-admin-language';

/**
 * The text that Ant Design draws itself (the pagination, the empty state, the date picker), by language. English is in the bundle, and
 * the other two are chunks of their own that are read when a person chooses them (UI-12). Ant Design 6 has no Vietnamese text for two
 * of its keys (`global.clear`, `Input.otpCell`), so the adapter gives them (ADR 0025).
 */
export async function antdLocaleOf(locale: Locale): Promise<AntLocale> {
  if (locale === 'vi') {
    const { default: viVN } = await import('antd/locale/vi_VN');
    return {
      ...viVN,
      global: { ...viVN.global, clear: 'Xóa' },
      Input: { ...viVN.Input, otpCell: 'Ký tự ${index} trên ${total}' },
    };
  }
  if (locale === 'zh') return (await import('antd/locale/zh_CN')).default;
  return enUS;
}

/** What a language needs on the screen: its texts, and the texts of Ant Design. */
export interface Resources {
  readonly locale: Locale;
  readonly dictionary: Dictionary;
  readonly antd: AntLocale;
  /** The texts of the plugins. */
  readonly texts: Texts;
}

export const ENGLISH_RESOURCES: Resources = { locale: 'en', dictionary: ENGLISH, antd: enUS, texts: {} };

export async function loadResources<C>(locale: Locale, parts: readonly AdminPart<C>[]): Promise<Resources> {
  const [dictionary, antd, texts] = await Promise.all([
    loadMessages(locale),
    antdLocaleOf(locale),
    loadTexts(parts, locale),
  ]);
  return { locale, dictionary, antd, texts };
}

/** The language that this person chose, when the browser keeps it. A browser that refuses storage just forgets the choice. */
export function savedLocale(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not kept. The next visit starts from the language of the browser.
  }
}

export function initialLocale(): Locale {
  return localeOf(navigator.languages, savedLocale());
}

export interface Language {
  /** The language that is on the screen. It changes when the texts of a new one have been read. */
  readonly locale: Locale;
  readonly dictionary: Dictionary;
  readonly texts: Texts;
  readonly setLocale: (locale: Locale) => void;
}

export const LanguageContext: Context<Language> = createContext<Language>({
  locale: 'en',
  dictionary: ENGLISH,
  texts: {},
  setLocale: () => undefined,
});

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

/** The translator of the language that is on, for the texts of a screen. */
export function useT(): (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string {
  const { dictionary } = useLanguage();
  return useMemo(() => translator(dictionary), [dictionary]);
}

export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', vi: 'Tiếng Việt', zh: '中文' };
export { LOCALES };
