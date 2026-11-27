/**
 * BieberKit
 *
 * @file        packages/http/src/admin-extensions.test.ts
 * @description Tests of what a plugin adds to the admin: pages, menu entries, widgets and replaced screens, how they are checked, and what `_meta` tells a caller about them (UI-04, ADR 0037).
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
import { adminExtensionsOf, extensionProblems } from './admin-extensions.ts';
import type { AdminContribution } from './admin-extensions.ts';

const CONTRIBUTION: AdminContribution = {
  pages: [
    { path: 'reports', module: 'reports.js', title: { en: 'Reports', vi: 'Báo cáo' }, menu: true },
    { path: 'secret', module: 'secret.js', title: 'Secret', permission: 'crm.secret.read', menu: true },
  ],
  widgets: [
    { slot: 'dashboard', module: 'stats.js', title: 'Stats' },
    { slot: 'form:crm.Account', module: 'panel.js', title: 'Panel', permission: 'crm.panel.read' },
    { slot: 'field:rating', module: 'rating.js' },
  ],
  screens: [{ replace: 'list:crm.Note', module: 'notes.js' }],
};

const bad = (module: string) => extensionProblems('crm', { pages: [{ path: 'a', module, title: 'A' }] }).join(' ');

describe('UI-04 what a plugin may add', () => {
  it('UI-04 a well formed contribution has no problem', () => {
    expect(extensionProblems('crm', CONTRIBUTION)).toEqual([]);
    expect(extensionProblems('crm', {})).toEqual([]);
  });

  it('UI-04 refuses a module that is not a file of the plugin: a path, a parent folder, no .js, an address', () => {
    for (const module of ['../x.js', 'a/b.js', '/etc/x.js', 'x.ts', 'x', 'https://evil.test/x.js', '.hidden.js', '']) {
      expect(`${module} => ${bad(module)}`).toContain('module');
    }
    expect(bad('ok-1.2_x.js')).toBe('');
  });

  it('UI-04 refuses a page path that is not one segment, two pages with the same path, a slot that is none, and a screen that replaces nothing', () => {
    expect(extensionProblems('crm', { pages: [{ path: 'a/b', module: 'a.js', title: 'A' }] }).join(' ')).toContain(
      'path',
    );
    expect(extensionProblems('crm', { pages: [{ path: 'A b', module: 'a.js', title: 'A' }] }).join(' ')).toContain(
      'path',
    );
    expect(
      extensionProblems('crm', {
        pages: [
          { path: 'a', module: 'a.js', title: 'A' },
          { path: 'a', module: 'b.js', title: 'B' },
        ],
      }).join(' '),
    ).toContain('twice');
    expect(extensionProblems('crm', { widgets: [{ slot: 'sidebar', module: 'a.js' }] }).join(' ')).toContain('slot');
    expect(extensionProblems('crm', { widgets: [{ slot: 'form:', module: 'a.js' }] }).join(' ')).toContain('slot');
    expect(extensionProblems('crm', { screens: [{ replace: 'delete:crm.Note', module: 'a.js' }] }).join(' ')).toContain(
      'replace',
    );
    expect(extensionProblems('crm', { pages: [{ path: 'a', module: 'a.js', title: '' }] }).join(' ')).toContain(
      'title',
    );
  });
});

describe('UI-04 what a plugin adds, as the admin needs it', () => {
  const extensions = adminExtensionsOf([{ plugin: 'crm', admin: CONTRIBUTION }]);

  it('UI-04 gives a page, a widget and a screen the address of their module, under the folder of their plugin', () => {
    expect(extensions.pages.map((page) => [page.plugin, page.path, page.module])).toEqual([
      ['crm', 'reports', '/plugins/crm/reports.js'],
      ['crm', 'secret', '/plugins/crm/secret.js'],
    ]);
    expect(extensions.widgets.map((widget) => [widget.slot, widget.module])).toEqual([
      ['dashboard', '/plugins/crm/stats.js'],
      ['form:crm.Account', '/plugins/crm/panel.js'],
      ['field:rating', '/plugins/crm/rating.js'],
    ]);
    expect(extensions.screens).toEqual([{ plugin: 'crm', replace: 'list:crm.Note', module: '/plugins/crm/notes.js' }]);
  });

  it('UI-04 a page with menu on is a menu entry that goes to the route of the page, with the label of the page', () => {
    expect(extensions.menu.map((item) => [item.path, item.label['en']])).toEqual([
      ['/ext/crm/reports', 'Reports'],
      ['/ext/crm/secret', 'Secret'],
    ]);
    expect(extensions.menu[0]?.label).toEqual({ en: 'Reports', vi: 'Báo cáo' });
    expect(extensions.menu[1]?.permission).toBe('crm.secret.read');
  });

  it('UI-04 plugins that add nothing add nothing, and the contributions of two plugins are kept apart by the name of the plugin', () => {
    expect(adminExtensionsOf([])).toEqual({ pages: [], widgets: [], screens: [], menu: [] });
    const both = adminExtensionsOf([
      { plugin: 'a', admin: { pages: [{ path: 'x', module: 'x.js', title: 'A' }] } },
      { plugin: 'b', admin: { pages: [{ path: 'x', module: 'x.js', title: 'B' }] } },
    ]);
    expect(both.pages.map((page) => page.module)).toEqual(['/plugins/a/x.js', '/plugins/b/x.js']);
  });
});
