/**
 * BieberKit
 *
 * @file        packages/server/src/project.ts
 * @description Finds and loads the project that a command runs in: its config, its plugins in boot order and the version of core that it runs on (section 5.2, section 11.2).
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

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePlugins, toManifest, validateConfig } from '@bieberkit/core';
import type { EnvOwner, PluginDef, ProjectConfigInput } from '@bieberkit/core';
import { ServerError } from './errors.ts';
import { COLLECTORS } from './manifest.ts';

export const CONFIG_FILE = 'bieberkit.config.ts';

export interface LoadedPlugin {
  readonly def: PluginDef<unknown>;
  /** The options that the config gave, checked by the plugin. */
  readonly options: unknown;
}

export interface Project {
  /** The directory that holds `bieberkit.config.ts`. */
  readonly root: string;
  readonly configPath: string;
  readonly config: ProjectConfigInput;
  /** In boot order: each plugin after the ones that it requires. */
  readonly plugins: readonly LoadedPlugin[];
  readonly coreVersion: string;
}

/** The nearest directory at or above `from` that has a config file. */
export function findProjectRoot(from: string): string | undefined {
  let current = resolve(from);
  for (;;) {
    if (existsSync(join(current, CONFIG_FILE))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function coreVersion(): string {
  const found: unknown = JSON.parse(
    readFileSync(createRequire(import.meta.url).resolve('@bieberkit/core/package.json'), 'utf8'),
  );
  const version = typeof found === 'object' && found !== null ? Reflect.get(found, 'version') : undefined;
  return typeof version === 'string' ? version : '0.0.0';
}

function isPluginDef(value: unknown): value is PluginDef<unknown> {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === 'plugin';
}

export async function importFile(path: string): Promise<unknown> {
  // The time of the file is part of the address, so a file that was edited since it was first read is read again. Whole
  // milliseconds only: a fraction puts a dot after the extension, and a tool that reads the extension of the address
  // (Vite, in the tests) takes the digits for it, and reads a TypeScript file as plain JavaScript.
  const url = `${pathToFileURL(path).href}?v=${String(Math.trunc(statSync(path).mtimeMs))}`;
  const loaded: unknown = await import(url);
  return typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : undefined;
}

async function loadPlugin(name: string, rooted: NodeJS.Require): Promise<PluginDef<unknown>> {
  let path: string;
  try {
    path = rooted.resolve(name);
  } catch (error) {
    throw new ServerError(`The plugin ${name} is in the config and is not installed.`, {
      code: 'BK_PLUGIN_NOT_INSTALLED',
      fix: `Run: pnpm add ${name}`,
      cause: error,
    });
  }
  const exported = await importFile(path);
  if (!isPluginDef(exported)) {
    throw new ServerError(`${name} does not export a plugin as its default export.`, {
      code: 'BK_PLUGIN_NOT_EXPORTED',
      fix: 'The main file of a plugin package is `export default definePlugin({ ... })`.',
    });
  }
  return exported;
}

/** The env schemas of the plugins, each with the prefix that its keys must start with. */
export function envOwnersOf(project: Pick<Project, 'plugins'>): EnvOwner[] {
  return project.plugins.map(({ def }) => ({
    name: def.shortName,
    prefix: `${def.shortName.toUpperCase()}_`,
    schema: def.envSchema,
  }));
}

export interface ProjectConfig {
  readonly root: string;
  readonly configPath: string;
  readonly config: ProjectConfigInput;
}

/** The root and the checked config of the project at or above `cwd`, without its plugins: for a command that reads files only. */
export async function loadConfig(cwd: string): Promise<ProjectConfig> {
  const root = findProjectRoot(cwd);
  if (root === undefined) {
    throw new ServerError(`There is no ${CONFIG_FILE} in ${resolve(cwd)} or above it.`, {
      code: 'BK_PROJECT_NOT_FOUND',
      fix: `Run the command in a BieberKit project, or pass --cwd <dir>. A new project: pnpm create bieberkit@latest <name>`,
    });
  }
  const configPath = join(root, CONFIG_FILE);
  return { root, configPath, config: validateConfig(await importFile(configPath)) };
}

/**
 * Loads the project at or above `cwd`: reads and checks `bieberkit.config.ts`, loads the plugins that it lists, checks their
 * options, and resolves them into boot order. Every problem has a code, and the config and the plugins report all of theirs together.
 */
export async function loadProject(cwd: string): Promise<Project> {
  const { root, configPath, config } = await loadConfig(cwd);
  const rooted = createRequire(configPath);
  const entries = config.plugins.map((entry) => (typeof entry === 'string' ? ([entry, undefined] as const) : entry));
  const loaded = new Map<string, LoadedPlugin>();
  for (const [name, given] of entries) {
    const def = await loadPlugin(name, rooted);
    let options: unknown;
    try {
      options = def.options.parse(given);
    } catch (error) {
      throw new ServerError(
        `The options of ${name} in the config are not valid: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: 'BK_PLUGIN_OPTIONS',
          fix: `Fix the entry of ${name} in the plugins of ${CONFIG_FILE}.`,
          cause: error,
        },
      );
    }
    loaded.set(def.name, { def, options });
  }
  const version = coreVersion();
  const { order } = resolvePlugins(
    [...loaded.values()].map(({ def }) => ({
      name: def.name,
      version: def.version,
      manifest: toManifest(def, COLLECTORS),
    })),
    { core: version, dialect: config.database.dialect },
  );
  const plugins = order.flatMap((name) => loaded.get(name) ?? []);
  return { root, configPath, config, plugins, coreVersion: version };
}
