/**
 * BieberKit
 *
 * @file        tools/lib/shared-admin.test.ts
 * @description Tests of the check that keeps the shared packages of the admin free of every first-party plugin (UI-34).
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
import { findPluginKnowledge, isShared } from './shared-admin.ts';

const found = (text: string): readonly [number, string][] =>
  findPluginKnowledge('packages/admin-antd/src/app/x.ts', text).map((violation) => [violation.line, violation.found]);

describe('UI-34 the shared packages name no first-party plugin', () => {
  it('UI-34 scans the sources of admin-core and admin-antd, and not their tests and fixtures', () => {
    const paths = [
      'packages/admin-core/src/client.ts',
      'packages/admin-antd/src/shell/Gate.tsx',
      'packages/admin-core/src/client.test.ts',
      'packages/admin-core/src/fixtures/text-adapter.ts',
      'packages/admin-antd/src/screens/controls.test.tsx',
      'plugins/users/src/admin/api.ts',
      'packages/cli/src/admin-vite.ts',
    ];
    expect(paths.map(isShared)).toEqual([true, true, false, false, false, false, false]);
  });

  it('UI-34 refuses the name of a first-party plugin, a route of one, and the routes of the account', () => {
    const text = [
      "import users from '@bieberkit/plugin-users/admin';",
      "const a = '/api/v1/users/me';",
      'const b = `/api/v1/audit-log/entries?x=${id}`;',
      "const c = '/api/v1/media';",
      "await post('/two-factor/enable', {});",
      "await post('/request-password-reset', {});",
      "const d = '/api/v1/roles' + '/api/v1/settings/settings' + '/api/v1/notifications';",
    ].join('\n');
    expect(found(text)).toEqual([
      [1, '@bieberkit/plugin-'],
      [2, '/api/v1/users'],
      [3, '/api/v1/audit-log'],
      [4, '/api/v1/media'],
      [5, '/two-factor/'],
      [6, '/request-password-reset'],
      [7, '/api/v1/roles'],
    ]);
  });

  it('UI-34 leaves what the shell owns: the session, the metadata, the reports, and a route of an entity that is not known', () => {
    const text = [
      "await request('GET', '/api/auth/get-session');",
      "await request('POST', '/api/auth/sign-out');",
      "await request('GET', '/api/v1/_meta');",
      "const entries = { users: 'M9', media: 'M3' };",
      "const path = '/api/v1/mediator/things';",
    ].join('\n');
    expect(found(text)).toEqual([]);
  });
});
