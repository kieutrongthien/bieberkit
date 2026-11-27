/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/language.tsx
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

import { localeOf, LOCALES, translator } from '@bieberkit/admin-core';
import type { Locale, MessageKey } from '@bieberkit/admin-core';
import type { ConfigProviderProps } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import zhCN from 'antd/locale/zh_CN';
import { createContext, useContext, useMemo } from 'react';
import type { Context } from 'react';

type AntLocale = NonNullable<ConfigProviderProps['locale']>;

const STORAGE_KEY = 'bk-admin-language';

/** Ant Design 6 has no Vietnamese text for two of its keys (`global.clear`, `Input.otpCell`), so the adapter gives them (ADR 0025). */
const vietnamese: AntLocale = {
  ...viVN,
  global: { ...viVN.global, clear: 'Xóa' },
  Input: { ...viVN.Input, otpCell: 'Ký tự ${index} trên ${total}' },
};

export function antdLocaleOf(locale: Locale): AntLocale {
  return locale === 'vi' ? vietnamese : locale === 'zh' ? zhCN : enUS;
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
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
}

export const LanguageContext: Context<Language> = createContext<Language>({ locale: 'en', setLocale: () => undefined });

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

/** The translator of the language that is on, for the texts of a screen. */
export function useT(): (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string {
  const { locale } = useLanguage();
  return useMemo(() => translator(locale), [locale]);
}

export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', vi: 'Tiếng Việt', zh: '中文' };
export { LOCALES };
