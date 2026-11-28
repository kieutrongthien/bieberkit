/**
 * BieberKit
 *
 * @file        packages/cli/src/wire-plugin.ts
 * @description Puts a made plugin into its project: the folders of the workspace, the dependency of the server and of the admin, and the list of the config. What it cannot do it says, so that the person does it (UI-38).
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_APP } from './admin-app.ts';
import { addPlugin, pluginNames } from './plugin-config.ts';
import { CONFIG_FILE } from './project.ts';

const WORKSPACE = 'pnpm-workspace.yaml';
const FOLDER = /^plugins\/[^/]+$/;
const LISTED = /^[ \t]*-[ \t]*['"]?plugins\/\*['"]?[ \t]*$/m;
const PACKAGES = /^packages:[ \t]*\r?\n/m;

/** Makes the workspace hold `plugins/*`. It answers what is left to do by hand. */
function inWorkspace(root: string): string | undefined {
  const path = join(root, WORKSPACE);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (LISTED.test(text)) return undefined;
  if (!PACKAGES.test(text)) return `Add 'plugins/*' to the packages of ${WORKSPACE}.`;
  writeFileSync(
    path,
    text.replace(PACKAGES, (found) => `${found}  - 'plugins/*'\n`),
  );
  return undefined;
}

/** Makes the app depend on the plugin of the workspace. */
function inApp(root: string, app: string, name: string): string | undefined {
  const path = join(root, app, 'package.json');
  try {
    const manifest: Record<string, unknown> = JSON.parse(readFileSync(path, 'utf8'));
    const dependencies: Record<string, string> = { ...Object(manifest['dependencies']), [name]: 'workspace:*' };
    manifest['dependencies'] = Object.fromEntries(
      Object.entries(dependencies).toSorted(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    return undefined;
  } catch {
    return `Add "${name}": "workspace:*" to the dependencies of ${app}/package.json.`;
  }
}

function inConfig(root: string, name: string): string | undefined {
  const path = join(root, CONFIG_FILE);
  try {
    const text = readFileSync(path, 'utf8');
    if (!pluginNames(text).includes(name)) writeFileSync(path, addPlugin(text, name));
    return undefined;
  } catch {
    return `Add '${name}' to plugins in ${CONFIG_FILE}.`;
  }
}

/** Wires the plugin of `dir` into the project of `root`, and answers what is left to do by hand. */
export function wirePlugin(root: string, plugin: { readonly name: string; readonly dir: string }): string[] {
  const apps = existsSync(join(root, ADMIN_APP, 'package.json')) ? ['apps/server', ADMIN_APP] : ['apps/server'];
  return [
    FOLDER.test(plugin.dir) ? inWorkspace(root) : `Add '${plugin.dir}' to the packages of ${WORKSPACE}.`,
    ...apps.map((app) => inApp(root, app, plugin.name)),
    inConfig(root, plugin.name),
  ].filter((left) => left !== undefined);
}
