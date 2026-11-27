/**
 * BieberKit
 *
 * @file        packages/admin-core/src/extensions.test.ts
 * @description Tests of what the plugins add to the admin, as an adapter reads it (UI-04, ADR 0037).
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
import { extensionsOf, fieldWidgetFor, labelText, moduleSrc, pageFor, screenFor, widgetsIn } from './extensions.ts';
import type { MetaExtensions } from './types.ts';

const EXT: MetaExtensions = {
  pages: [{ plugin: 'reports', path: 'sales', module: '/plugins/reports/sales.js', title: { en: 'Sales' } }],
  widgets: [
    { plugin: 'reports', slot: 'dashboard', module: '/plugins/reports/a.js', title: { en: 'A' } },
    { plugin: 'crm', slot: 'dashboard', module: '/plugins/crm/b.js', title: { en: 'B' } },
    { plugin: 'crm', slot: 'form:crm.Account', module: '/plugins/crm/p.js', title: { en: 'P' } },
    { plugin: 'crm', slot: 'field:rating', module: '/plugins/crm/r.js', title: { en: 'R' } },
    { plugin: 'other', slot: 'field:rating', module: '/plugins/other/r.js', title: { en: 'R2' } },
  ],
  screens: [{ plugin: 'crm', replace: 'list:crm.Note', module: '/plugins/crm/n.js' }],
};

describe('UI-04 what the plugins add', () => {
  it('UI-04 none for a server that sends none, and the metadata of one that does', () => {
    expect(extensionsOf(undefined)).toEqual({ pages: [], widgets: [], screens: [] });
    expect(extensionsOf({ schemaVersion: 1, entities: [], menu: [], permissions: [] })).toEqual({
      pages: [],
      widgets: [],
      screens: [],
    });
    expect(extensionsOf({ schemaVersion: 1, entities: [], menu: [], permissions: [], extensions: EXT })).toBe(EXT);
  });

  it('UI-04 finds a page by its plugin and path, the widgets of a slot in order, a field widget by name, and a screen by kind and entity', () => {
    expect(pageFor(EXT, 'reports', 'sales')?.module).toBe('/plugins/reports/sales.js');
    expect(pageFor(EXT, 'reports', 'nope')).toBeUndefined();
    expect(widgetsIn(EXT, 'dashboard').map((widget) => widget.title['en'])).toEqual(['A', 'B']);
    expect(widgetsIn(EXT, 'form:crm.Account')).toHaveLength(1);
    expect(widgetsIn(EXT, 'form:crm.Other')).toEqual([]);
    expect(fieldWidgetFor(EXT, 'rating')?.plugin).toBe('crm');
    expect(fieldWidgetFor(EXT, 'none')).toBeUndefined();
    expect(screenFor(EXT, 'list', 'crm.Note')?.module).toBe('/plugins/crm/n.js');
    expect(screenFor(EXT, 'form', 'crm.Note')).toBeUndefined();
  });

  it('UI-04 a label is in the language, then in English, then the first that there is, then the fallback', () => {
    expect(labelText({ en: 'Sales', vi: 'Doanh số' }, 'vi')).toBe('Doanh số');
    expect(labelText({ en: 'Sales' }, 'zh')).toBe('Sales');
    expect(labelText({ vi: 'Doanh số' }, 'zh')).toBe('Doanh số');
    expect(labelText({}, 'en', 'x')).toBe('x');
    expect(labelText(undefined, 'en', 'x')).toBe('x');
  });

  it('UI-04 the address of a module is under the admin, at any base, with no double slash', () => {
    expect(moduleSrc('/admin', '/plugins/a/x.js')).toBe('/admin/plugins/a/x.js');
    expect(moduleSrc('', '/plugins/a/x.js')).toBe('/plugins/a/x.js');
    expect(moduleSrc('/panel/', '/plugins/a/x.js')).toBe('/panel/plugins/a/x.js');
  });
});
