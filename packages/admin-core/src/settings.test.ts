/**
 * BieberKit
 *
 * @file        packages/admin-core/src/settings.test.ts
 * @description Tests of the `admin` key of the config: the brand of a project and the order of its menu, every problem together, and a page that was changed on its way (UI-24, UI-33).
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
import { adminSection, parseAdminSettings, readAdminSettings } from './settings.ts';

const LOGO = 'data:image/svg+xml;base64,PHN2Zy8+';

const problems = (input: unknown): string => {
  try {
    parseAdminSettings(input);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('It did not throw.');
};

describe('UI-33 the brand of a project', () => {
  it('UI-33 it takes a name, a logo and a sentence, as one text or by language, and each is optional', () => {
    const brand = { name: 'Acme', logo: LOGO, tagline: { en: 'Hello', vi: 'Chào' } };
    expect(parseAdminSettings({ brand })).toEqual({ brand });
    expect(parseAdminSettings({ brand: { tagline: 'Hello' } })).toEqual({ brand: { tagline: 'Hello' } });
    expect(parseAdminSettings(undefined)).toEqual({});
    for (const type of ['png', 'jpeg', 'webp'])
      expect(parseAdminSettings({ brand: { logo: `data:image/${type};base64,AAAA` } }).brand?.logo).toContain(type);
  });

  it('UI-33 a logo is a data image: not an address, not a script and not another kind', () => {
    for (const logo of [
      'https://example.com/logo.svg',
      '/logo.svg',
      'javascript:alert(1)',
      'data:text/html;base64,AAAA',
      'data:image/svg+xml;utf8,<svg/>',
      `data:image/png;base64,${'A'.repeat(100_001)}`,
    ])
      expect(problems({ brand: { logo } })).toContain('admin.brand.logo');
  });

  it('UI-33 every problem is reported together, with the key that it is about', () => {
    const text = problems({
      brand: { name: ' ', tagline: { fr: 'Salut' }, color: 'red' },
      menu: [
        { id: 'Sales', items: 'shop' },
        { id: 'people', items: [''] },
        { id: 'people', items: [] },
      ],
      theme: {},
    });
    for (const key of [
      'admin.brand.name',
      'admin.brand.tagline.fr',
      'admin.brand.color',
      'admin.menu[0].id',
      'admin.menu[0].items',
      'admin.menu[1].items',
      'admin.menu[2].id',
      'admin.theme',
    ])
      expect(text).toContain(key);
    expect(problems({ brand: { name: 'x'.repeat(61), tagline: 'x'.repeat(121) } })).toMatch(
      /admin\.brand\.name[\s\S]*admin\.brand\.tagline/,
    );
  });

  it('UI-24 a group of another id takes a label, and the four ids of the framework need none', () => {
    expect(problems({ menu: [{ id: 'sales', items: ['shop'] }] })).toContain('admin.menu[0].label');
    expect(
      parseAdminSettings({
        menu: [
          { id: 'sales', label: { vi: 'Bán hàng' }, items: ['shop'] },
          { id: 'system', items: ['settings'] },
        ],
      }).menu,
    ).toHaveLength(2);
  });

  it('UI-33 the config section is named admin and parses with the same function', () => {
    expect(adminSection.key).toBe('admin');
    expect(adminSection.parser.parse({ brand: { name: 'Acme' } })).toEqual({ brand: { name: 'Acme' } });
    expect(adminSection.parser.parse(undefined)).toBeUndefined();
  });
});

describe('UI-33 the settings in the page', () => {
  it('UI-33 what the server wrote is read back, and a page that was changed on its way still opens the admin', () => {
    const settings = { brand: { name: 'Acme', logo: LOGO } };
    expect(readAdminSettings(JSON.stringify(settings))).toEqual(settings);
    for (const text of [null, undefined, '', '{', '[]', '"x"', JSON.stringify({ brand: { logo: 'http://x/y.png' } })])
      expect(readAdminSettings(text)).toEqual({});
  });
});
