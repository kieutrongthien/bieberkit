/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/shell/Brand.tsx
 * @description The brand of the admin: the logo of BieberKit, or the name and the logo that the project gave in the config, and the sentence of the sign in (UI-23, UI-33).
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

import { labelText, readAdminSettings } from '@bieberkit/admin-core';
import type { AdminSettings } from '@bieberkit/admin-core';
import type { JSX } from 'react';
import logo from '../app/assets/logo.svg';
import { useLanguage, useT } from '../lib/language.tsx';

let read: AdminSettings | undefined;

/** What the server wrote in the page from the `admin` key of the config (UI-24, UI-33). Read from the page once, when first asked. */
export function pageSettings(): AdminSettings {
  read ??= readAdminSettings(document.querySelector('meta[name="bk-admin"]')?.getAttribute('content'));
  return read;
}

/** The first character of a text, whole also when it is outside the basic plane, such as a rare Chinese one. */
export const firstLetter = (text: string): string => {
  const code = text.codePointAt(0);
  return code === undefined ? '' : String.fromCodePoint(code);
};

/** Shows on the frame, so it is drawn for a dark color. */
export function Brand(): JSX.Element {
  const t = useT();
  const brand = pageSettings().brand;
  if (brand?.logo !== undefined) {
    return <img className="bk-logo" src={brand.logo} alt={brand.name ?? t('app.name')} />;
  }
  if (brand?.name !== undefined) {
    return (
      <span className="bk-brand-name">
        <span className="bk-monogram" aria-hidden="true">
          {firstLetter(brand.name.trim()).toUpperCase()}
        </span>
        <span>{brand.name}</span>
      </span>
    );
  }
  return <img className="bk-logo" src={logo} alt="BieberKit" />;
}

/** The sentence of the sign in: the one of the project in the language of the person, or the one of BieberKit. */
export function useTagline(): string {
  const t = useT();
  const { locale } = useLanguage();
  const tagline = pageSettings().brand?.tagline;
  if (tagline === undefined) return t('brand.tagline');
  return typeof tagline === 'string' ? tagline : labelText(tagline, locale, t('brand.tagline'));
}
