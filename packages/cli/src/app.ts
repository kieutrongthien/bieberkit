/**
 * BieberKit
 *
 * @file        packages/cli/src/app.ts
 * @description Loads the application of a project without starting it: its modules, entities and routes, from the plugins and from apps/server/src/modules (section 7, section 7.4).
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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleDef } from '@bieberkit/core';
import type { EntityDef } from '@bieberkit/data';
import { compileEntities, createDatabase } from '@bieberkit/data/orm';
import { entityRoutes } from '@bieberkit/http';
import type { RouteDef } from '@bieberkit/http';
import { CliError } from './errors.ts';
import { importFile, loadProject } from './project.ts';
import type { Project } from './project.ts';

/** Where the modules of the project live (section 4.2). */
export const MODULES_DIR = 'apps/server/src/modules';

export interface App {
  readonly project: Project;
  /** The modules of the plugins in boot order, then those of the project by name. */
  readonly modules: readonly ModuleDef[];
  readonly entities: readonly EntityDef<string>[];
  /** The routes of the entities and of the modules, in the order that they are made. */
  readonly routes: readonly RouteDef[];
  /** The version of the project, from its `package.json`. */
  readonly version: string;
}

const isModule = (value: unknown): value is ModuleDef =>
  typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === 'module';

/** The modules of the project: `modules/<name>/module.ts`, whose default export is the module (section 7.4). */
async function projectModules(root: string): Promise<ModuleDef[]> {
  const folder = join(root, MODULES_DIR);
  if (!existsSync(folder)) return [];
  const found: ModuleDef[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true }).toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
    const file = join(folder, entry.name, 'module.ts');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const exported = await importFile(file);
    if (!isModule(exported)) {
      throw new CliError(`${MODULES_DIR}/${entry.name}/module.ts does not export a module as its default export.`, {
        code: 'BK_MODULE_NOT_EXPORTED',
        fix: 'The file is `export default defineModule({ name, entities, ... })`.',
      });
    }
    found.push(exported);
  }
  return found;
}

function contributed<T>(modules: readonly ModuleDef[], key: string): T[] {
  return modules.flatMap((module) => {
    const value: unknown = module.contributions[key];
    // The package that owns the key declared its type, a readonly list of `T`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Array.isArray(value) ? (value as T[]) : [];
  });
}

/**
 * Loads what the application is made of, without connecting to anything and without starting a server: the modules of the plugins
 * and of the project, their entities, and the routes that they make. A database in memory gives the routes something to close over.
 */
export async function loadApp(cwd: string): Promise<App> {
  const project = await loadProject(cwd);
  const modules = [...project.plugins.map(({ def }) => def.module), ...(await projectModules(project.root))];
  const byName = new Map<string, EntityDef<string>>();
  for (const entity of contributed<EntityDef<string>>(modules, 'entities')) byName.set(entity.name, entity);
  const entities = [...byName.values()];
  const schemas = compileEntities(entities);
  const db = await createDatabase(
    { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
    { entities: schemas },
  );
  try {
    const routes = [
      ...schemas.flatMap((schema) => entityRoutes(schema, { db, schemas })),
      ...contributed<RouteDef>(modules, 'routes'),
    ];
    return { project, modules, entities, routes, version: versionOf(project.root) };
  } finally {
    await db.close();
  }
}

function versionOf(root: string): string {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return '0.0.0';
  const found: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const version = typeof found === 'object' && found !== null ? Reflect.get(found, 'version') : undefined;
  return typeof version === 'string' ? version : '0.0.0';
}
