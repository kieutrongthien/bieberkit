/**
 * BieberKit
 *
 * @file        plugins/settings/src/declarations.ts
 * @description The settings that the settings plugin declares itself: the name, the language and the logo of the site, public for the login screen and the site (SET-07).
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

import { defineSetting } from '@bieberkit/core';
import type { SettingDef } from '@bieberkit/core';

export const siteName: SettingDef<string> = defineSetting({
  key: 'settings.site.name',
  type: 'string',
  default: 'BieberKit',
  label: { en: 'Site name', vi: 'Tên trang' },
  group: 'general',
  public: true,
});

export const siteLocale: SettingDef<'en' | 'vi' | 'zh'> = defineSetting({
  key: 'settings.site.locale',
  type: 'enum',
  values: ['en', 'vi', 'zh'],
  default: 'en',
  label: { en: 'Default language', vi: 'Ngôn ngữ mặc định' },
  group: 'general',
  public: true,
});

export const siteLogo: SettingDef<string> = defineSetting({
  key: 'settings.site.logo',
  type: 'string',
  default: '',
  label: { en: 'Logo address', vi: 'Địa chỉ logo' },
  description: { en: 'The URL of the logo on the login screen and the site. Empty shows the name.' },
  group: 'general',
  public: true,
});

export const declarations: readonly SettingDef[] = [siteName, siteLocale, siteLogo];
