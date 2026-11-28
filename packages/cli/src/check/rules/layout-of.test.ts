/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/layout-of.test.ts
 * @description Tests of where the files of a module, a plugin, its admin part and the admin shell go (MOD-19, spec 7.4).
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
import { moduleFileProblem, shellFileProblem } from './layout-of.ts';

const misplaced = (check: (path: string) => string | undefined, paths: readonly string[]): string[] =>
  paths.filter((path) => check(path) !== undefined);

describe('MOD-19 the files of a module and of a plugin', () => {
  it('MOD-19 each kind has its folder, and the root holds the entry, tests and types only', () => {
    const placed = [
      'index.ts',
      'module.ts',
      'index.test.ts',
      'scale.dialects.test.ts',
      'types.d.ts',
      'entities/deal.ts',
      'services/deals.ts',
      'services/deals.test.ts',
      'routes/index.ts',
      'actions/close.ts',
      'jobs/send-welcome.ts',
      'events/subscriptions.ts',
      'workflows/onboarding.ts',
      'settings/site.ts',
      'testing/fixtures.ts',
    ];
    expect(misplaced(moduleFileProblem, placed)).toEqual([]);
  });

  it('MOD-19 code at the root, or in a folder that is none of these, is out of place', () => {
    const out = ['entity.ts', 'routes.ts', 'service.ts', 'helpers/x.ts', 'i18n/vi.json', 'controllers/y.ts'];
    expect(misplaced(moduleFileProblem, out)).toEqual(out);
  });

  it('MOD-19 says where such a file goes', () => {
    expect(moduleFileProblem('routes.ts')).toContain('routes/');
    expect(moduleFileProblem('entity.ts')).toContain('entities/');
    expect(moduleFileProblem('admin/NotesPage.tsx')).toContain('admin/pages/');
  });

  it('MOD-19 the admin part has folders by what a file is, and its root holds the declaration of the slots', () => {
    const placed = [
      'admin/index.ts',
      'admin/css.d.ts',
      'admin/tsconfig.json',
      'admin/pages/NotesPage.tsx',
      'admin/tabs/History.tsx',
      'admin/fields/FileControl.tsx',
      'admin/components/Badge.tsx',
      'admin/components/badge.module.css',
      'admin/lib/api.ts',
      'admin/lib/api.test.ts',
      'admin/messages/en.ts',
    ];
    expect(misplaced(moduleFileProblem, placed)).toEqual([]);
    const out = ['admin/NotesPage.tsx', 'admin/api.ts', 'admin/account.module.css', 'admin/screens/A.tsx'];
    expect(misplaced(moduleFileProblem, out)).toEqual(out);
  });
});

describe('MOD-19 the files of the admin shell', () => {
  it('MOD-19 app starts the application, and each other folder is one part of the shell', () => {
    const placed = [
      'index.ts',
      'slot-types.test.ts',
      'app/App.tsx',
      'app/start.tsx',
      'app/app.css',
      'app/app.d.css.ts',
      'app/css.d.ts',
      'app/assets/logo.svg',
      'shell/Gate.tsx',
      'screens/ListScreen.tsx',
      'slots/slots.tsx',
      'components/AuthShell.tsx',
      'lib/context.ts',
    ];
    expect(misplaced(shellFileProblem, placed)).toEqual([]);
  });

  it('MOD-19 a screen or a helper does not lie in app, which would take every file again', () => {
    const out = ['app/Gate.tsx', 'app/context.ts', 'Gate.tsx', 'misc/x.ts'];
    expect(misplaced(shellFileProblem, out)).toEqual(out);
  });
});
