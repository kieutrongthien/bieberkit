/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/layout-of.ts
 * @description Where the files of a module, a plugin, its admin part and the admin shell go: what `bieberkit check layout` and the check of the repository share (MOD-19, spec 7.4). It imports nothing, so that a tool of the repository runs it as it is.
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

/** The folders of a module and of the backend of a plugin (spec 7.4). One is made when it has a file. */
const MODULE_FOLDERS = [
  'entities',
  'services',
  'routes',
  'actions',
  'jobs',
  'events',
  'workflows',
  'settings',
  'testing',
  'admin',
];
/** The folders of an admin part. */
const ADMIN_FOLDERS = ['pages', 'tabs', 'fields', 'components', 'lib', 'messages'];
/** The folders of the shell of the admin. `app` only starts the application. */
const SHELL_FOLDERS = ['shell', 'screens', 'slots', 'components', 'lib'];

const TEST_OR_TYPES = /(?:\.test\.[cm]?tsx?|\.d\.(?:[\w-]+\.)?[cm]?ts)$/;

const split = (path: string): readonly [string, string] => {
  const at = path.indexOf('/');
  return at === -1 ? ['', path] : [path.slice(0, at), path.slice(at + 1)];
};

function adminFileProblem(path: string): string | undefined {
  const [folder, rest] = split(path);
  if (folder === '')
    return TEST_OR_TYPES.test(rest) || rest === 'index.ts' || rest === 'tsconfig.json'
      ? undefined
      : 'The root of an admin part holds index.ts. A screen goes in admin/pages/, admin/tabs/ or admin/fields/, a smaller piece in admin/components/, and what has no user interface in admin/lib/.';
  return ADMIN_FOLDERS.includes(folder)
    ? undefined
    : `An admin part has the folders ${ADMIN_FOLDERS.join(', ')}, and no ${folder}/.`;
}

/**
 * What is out of place about a file of a module or of the backend of a plugin, as a sentence that says where it goes, or nothing.
 * `path` is from the root of the module (`modules/<name>/`) or of the source of the plugin (`src/`).
 */
export function moduleFileProblem(path: string): string | undefined {
  const [folder, rest] = split(path);
  if (folder === '')
    return TEST_OR_TYPES.test(rest) || rest === 'index.ts' || rest === 'module.ts'
      ? undefined
      : 'The root holds the entry only. An entity goes in entities/, business logic in services/, a route in routes/, a job in jobs/ and a subscription in events/.';
  if (folder === 'admin') return adminFileProblem(rest);
  return MODULE_FOLDERS.includes(folder)
    ? undefined
    : `A module has the folders ${MODULE_FOLDERS.join(', ')}, and no ${folder}/.`;
}

/** The same for the source of `@bieberkit/admin-antd`. */
export function shellFileProblem(path: string): string | undefined {
  const [folder, rest] = split(path);
  if (folder === '')
    return TEST_OR_TYPES.test(rest) || rest === 'index.ts'
      ? undefined
      : 'The root holds index.ts. The rest has a folder.';
  if (folder === 'app')
    return /^(?:App\.tsx|start\.tsx|app\.css|assets\/[^/]+)$/.test(rest) || TEST_OR_TYPES.test(rest)
      ? undefined
      : `app/ starts the application. Put it in ${SHELL_FOLDERS.join('/, ')}/.`;
  return SHELL_FOLDERS.includes(folder)
    ? undefined
    : `The shell has the folders app, ${SHELL_FOLDERS.join(', ')}, and no ${folder}/.`;
}
