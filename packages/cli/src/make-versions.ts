/**
 * BieberKit
 *
 * @file        packages/cli/src/make-versions.ts
 * @description The versions that a made plugin asks for: those that the project has, and for what it has not those that this release of the framework is built with (UI-38).
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

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ADMIN_VERSIONS } from 'create-bieberkit';
import { ADMIN_APP } from './admin-app.ts';

/** The tools of a plugin at the versions that the repository of the framework builds with. A test holds them equal. */
export const PINNED: Readonly<Record<'tsdown' | 'typescript' | 'vitest', string>> = {
  tsdown: '0.23.7',
  typescript: '7.0.2',
  vitest: '4.1.12',
};

const FRAMEWORK = ['bieberkit', '@bieberkit/core', '@bieberkit/data', '@bieberkit/admin-antd', '@bieberkit/admin-core'];

/** The version of this release, which every package of the framework shares. */
function release(): string {
  const manifest: unknown = createRequire(import.meta.url)('../package.json');
  return String(Reflect.get(Object(manifest), 'version'));
}

/** The exact versions that a manifest declares. A link of the workspace or a range is no version that a plugin can pin. */
function declared(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const found: Record<string, string> = {};
  for (const list of ['dependencies', 'devDependencies'])
    for (const [name, version] of Object.entries(Object(Reflect.get(Object(manifest), list))))
      if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) found[name] = version;
  return found;
}

export function versionsOf(root: string | undefined): Readonly<Record<string, string>> {
  const framework = release();
  const manifests = root === undefined ? [] : [`${ADMIN_APP}/package.json`, 'apps/server/package.json', 'package.json'];
  // The first manifest that declares a package says its version: the admin before the server and the root.
  const project: Record<string, string> = {};
  for (const path of manifests)
    for (const [name, version] of Object.entries(declared(join(root ?? '', path)))) project[name] ??= version;
  return {
    ...Object.fromEntries(FRAMEWORK.map((name) => [name, project['bieberkit'] ?? framework])),
    ...ADMIN_VERSIONS.dependencies,
    ...ADMIN_VERSIONS.devDependencies,
    ...PINNED,
    ...project,
  };
}
