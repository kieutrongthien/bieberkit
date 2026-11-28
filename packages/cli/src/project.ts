/**
 * BieberKit
 *
 * @file        packages/cli/src/project.ts
 * @description The loader of the project: the same module as @bieberkit/server, which the generated entry point also uses.
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

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export { CONFIG_FILE, envOwnersOf, findProjectRoot, importFile, loadConfig, loadProject } from '@bieberkit/server';
export type { LoadedPlugin, Project, ProjectConfig } from '@bieberkit/server';

/** The plugins that the project holds in `plugins/`, as folders from its root, in the order of their names. */
export function localPlugins(root: string): readonly string[] {
  const folder = join(root, 'plugins');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((name) => `plugins/${name}`)
    .filter((path) => existsSync(join(root, path, 'src')))
    .toSorted((a, b) => a.localeCompare(b));
}
