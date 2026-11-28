/**
 * BieberKit
 *
 * @file        tools/lib/shared-admin.ts
 * @description What the shared packages of the admin may not say: the name or a route of a first-party plugin, which belongs in the admin part of that plugin (UI-34).
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

export interface PluginKnowledge {
  readonly file: string;
  readonly line: number;
  readonly found: string;
  readonly fix: string;
}

const SHARED = /^packages\/(?:admin-core|admin-antd)\/src\//;
const TESTS = /\.test\.tsx?$|\/(?:fixtures|testing)\//;

/** Whether a file is of a shared package of the admin: its sources, without its tests and their fixtures. */
export const isShared = (path: string): boolean => SHARED.test(path) && /\.(?:ts|tsx)$/.test(path) && !TESTS.test(path);

// The first-party plugins by what their screens would need: their package, their routes, and the account routes of Better Auth,
// whose screens are of the users plugin. The session and the sign out stay in the shell.
const MARKS =
  /@bieberkit\/plugin-|\/api\/v1\/(?:users|roles|media|audit-log|notifications|settings)(?![\w-])|\/two-factor\/|\/request-password-reset/;

export function findPluginKnowledge(file: string, text: string): readonly PluginKnowledge[] {
  return text.split('\n').flatMap((line, index) => {
    const found = MARKS.exec(line)?.[0];
    return found === undefined
      ? []
      : [
          {
            file,
            line: index + 1,
            found,
            fix: 'Move it into the admin part of its plugin (src/admin), which the shell draws.',
          },
        ];
  });
}
