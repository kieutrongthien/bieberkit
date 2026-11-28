/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/admin.ts
 * @description The files of apps/admin in a new project: the application that builds the admin from the plugins of the config with Vite (section 16.6, UI-37, ADR 0040).
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

import type { ProjectFile } from './render.ts';

/**
 * The versions of the packages that an admin is built with, the ones that `@bieberkit/admin-antd` is built and tested with. A test
 * holds them equal: another version of React in the admin would put two copies of it in a build.
 */
export const ADMIN_VERSIONS: Readonly<Record<'dependencies' | 'devDependencies', Readonly<Record<string, string>>>> = {
  dependencies: { antd: '6.7.1', react: '19.3.1', 'react-dom': '19.3.1' },
  devDependencies: {
    '@types/react': '19.3.0',
    '@types/react-dom': '19.3.0',
    '@vitejs/plugin-react': '6.3.0',
    vite: '8.3.8',
  },
};

export interface AdminApp {
  readonly folder: string;
  /** Versions of the framework packages, by name. */
  readonly pins: (names: readonly string[]) => Readonly<Record<string, string>>;
  /** The plugins of the project, with their versions: each is a dependency of the admin too, whose React its screens use. */
  readonly plugins: Readonly<Record<string, string>>;
  /** The header of a file of the project, in the style of its kind. */
  readonly header: (style: 'block' | 'html', path: string, description: string) => string;
}

// The files below import these. Named here, so that the check of the layers does not read a line of a made file as an import of this
// package, which depends on neither.
const CLI = 'bieberkit';
const ADAPTER = '@bieberkit/admin-antd';

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const sorted = (value: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)));

export function adminFiles(app: AdminApp): ProjectFile[] {
  const { header } = app;
  return [
    {
      path: 'apps/admin/package.json',
      content: json({
        name: `${app.folder}-admin`,
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: sorted({
          ...app.pins(['@bieberkit/admin-antd', '@bieberkit/admin-core']),
          ...ADMIN_VERSIONS.dependencies,
          ...app.plugins,
        }),
        devDependencies: sorted({ ...app.pins(['bieberkit']), ...ADMIN_VERSIONS.devDependencies }),
      }),
    },
    {
      path: 'apps/admin/vite.config.ts',
      content: `${header('block', 'apps/admin/vite.config.ts', 'Builds the admin of the project from the admin parts of the plugins of bieberkit.config.ts.')}import react from '@vitejs/plugin-react';
import { bieberkitAdmin } from '${CLI}/admin-vite';
import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';

const config: UserConfig = defineConfig({ plugins: [react(), bieberkitAdmin()] });

export default config;
`,
    },
    {
      path: 'apps/admin/index.html',
      content: `${header('html', 'apps/admin/index.html', 'The page of the admin: an empty root that the application fills.')}<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BieberKit admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'apps/admin/src/main.tsx',
      content: `${header('block', 'apps/admin/src/main.tsx', 'Starts the admin with the admin parts of the plugins. Screens of your own go in src/part.ts.')}import { startAdmin } from '${ADAPTER}';
import { parts } from 'virtual:bieberkit/admin';

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root.');
startAdmin(root, { parts });
`,
    },
    {
      path: 'apps/admin/src/admin.d.ts',
      content: `${header('block', 'apps/admin/src/admin.d.ts', 'The type of the module that bieberkit/admin-vite makes: the admin parts of the plugins of the config.')}declare module 'virtual:bieberkit/admin' {
  import type { AdminPart } from '${ADAPTER}';

  export const parts: readonly AdminPart[];
}
`,
    },
    {
      path: 'apps/admin/tsconfig.json',
      content: json({
        compilerOptions: {
          target: 'esnext',
          module: 'esnext',
          moduleResolution: 'bundler',
          lib: ['esnext', 'dom', 'dom.iterable'],
          types: [],
          jsx: 'react-jsx',
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          allowImportingTsExtensions: true,
          erasableSyntaxOnly: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['src'],
      }),
    },
  ];
}
