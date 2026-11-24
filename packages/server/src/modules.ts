/**
 * BieberKit
 *
 * @file        packages/server/src/modules.ts
 * @description Finds the modules of a project and what they contribute: the entities, the routes and the jobs of the plugins and of apps/server/src/modules (section 7.4).
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
import type { ModuleDef } from '@bieberkit/core';
import { ServerError } from './errors.ts';
import { importFile } from './project.ts';
import type { Project } from './project.ts';

/** Where the modules of the project live (section 4.2). */
export const MODULES_DIR = 'apps/server/src/modules';

const isModule = (value: unknown): value is ModuleDef =>
  typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === 'module';

/** The modules of the project: `modules/<name>/module.ts`, whose default export is the module (section 7.4). */
export async function projectModules(root: string): Promise<ModuleDef[]> {
  const folder = join(root, MODULES_DIR);
  if (!existsSync(folder)) return [];
  const found: ModuleDef[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true }).toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
    const file = join(folder, entry.name, 'module.ts');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const exported = await importFile(file);
    if (!isModule(exported)) {
      throw new ServerError(`${MODULES_DIR}/${entry.name}/module.ts does not export a module as its default export.`, {
        code: 'BK_MODULE_NOT_EXPORTED',
        fix: 'The file is `export default defineModule({ name, entities, ... })`.',
      });
    }
    found.push(exported);
  }
  return found;
}

/** The modules of the plugins in boot order, then those of the project by name. */
export async function allModules(project: Project): Promise<ModuleDef[]> {
  return [...project.plugins.map(({ def }) => def.module), ...(await projectModules(project.root))];
}

/** What the modules contribute under `key`, in the order of the modules. The package that owns the key declared its type. */
export function contributed<T>(modules: readonly ModuleDef[], key: string): T[] {
  return modules.flatMap((module) => {
    const value: unknown = module.contributions[key];
    // The package that owns the key declared its type, a readonly list of `T`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Array.isArray(value) ? (value as T[]) : [];
  });
}

/** What the modules contribute under `key` when each gives an object by name, merged into one. A later module wins a name. */
export function contributedRecord<T>(modules: readonly ModuleDef[], key: string): Record<string, T> {
  const merged: Record<string, T> = {};
  for (const module of modules) {
    const value: unknown = module.contributions[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    // The package that owns the key declared its type, a record of `T` by name.
    for (const [name, item] of Object.entries(value)) merged[name] = item;
  }
  return merged;
}
