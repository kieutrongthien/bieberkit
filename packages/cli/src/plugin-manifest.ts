/**
 * BieberKit
 *
 * @file        packages/cli/src/plugin-manifest.ts
 * @description Derives, verifies and atomically writes static plugin manifests without starting an application (PLG-07).
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

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { checkManifest, describeEnv, toManifest } from '@bieberkit/core';
import type { EnvDescription, Manifest, PluginDef } from '@bieberkit/core';
import { COLLECTORS, importFile } from '@bieberkit/server/plugins';
import type { Outcome } from './command.ts';
import { CliError } from './errors.ts';

export interface PluginPackage {
  readonly root: string;
  readonly pkg: Readonly<Record<string, unknown>> & { readonly name: string; readonly version: string };
  readonly def: PluginDef<unknown>;
  readonly manifest: Manifest;
  readonly envRows: readonly EnvDescription[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPluginDef(value: unknown): value is PluginDef<unknown> {
  return record(value) && value['kind'] === 'plugin';
}

function pluginName(pkg: Record<string, unknown>): boolean {
  return (
    (typeof pkg['name'] === 'string' && /^(?:@[^/]+\/(?:bieberkit-)?plugin-|bieberkit-plugin-)/.test(pkg['name'])) ||
    (Array.isArray(pkg['keywords']) && pkg['keywords'].includes('bieberkit-plugin'))
  );
}

/** Use the declared source entry when present, otherwise the import/node/default export. */
function entryOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!record(value)) return undefined;
  for (const key of ['@bieberkit/source', 'import', 'node', 'default']) {
    const entry = entryOf(value[key]);
    if (entry !== undefined) return entry;
  }
  return undefined;
}

function packageAt(cwd: string): { root: string; pkg: Record<string, unknown> } | undefined {
  let root = resolve(cwd);
  for (;;) {
    const path = join(root, 'package.json');
    if (existsSync(path)) {
      const pkg: unknown = JSON.parse(readFileSync(path, 'utf8'));
      return record(pkg) && pluginName(pkg) ? { root, pkg } : undefined;
    }
    const parent = dirname(root);
    if (parent === root) return undefined;
    root = parent;
  }
}

export async function inspectPluginPackage(cwd: string): Promise<PluginPackage | undefined> {
  const found = packageAt(cwd);
  if (found === undefined) return undefined;
  const { root, pkg } = found;
  const name = pkg['name'];
  const version = pkg['version'];
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new CliError(`Invalid plugin identity in ${join(root, 'package.json')}.`, {
      code: 'BK_PLUGIN_PACKAGE',
      fix: 'Set name and version to strings in package.json.',
    });
  }
  const exports = pkg['exports'];
  const entry =
    entryOf(record(exports) && '.' in exports ? exports['.'] : exports) ??
    (typeof pkg['main'] === 'string' ? pkg['main'] : undefined);
  const path = entry === undefined ? '' : resolve(root, entry);
  const within = path === '' ? '..' : relative(root, path);
  if (entry === undefined || within === '..' || within.startsWith('../') || isAbsolute(within) || !existsSync(path)) {
    throw new CliError(`The plugin entry of ${name} is missing or outside ${root}.`, {
      code: 'BK_PLUGIN_ENTRY',
      fix: 'Point exports["."] or main at an existing entry inside the plugin package.',
    });
  }
  let loaded: unknown;
  try {
    loaded = await importFile(path);
  } catch (cause) {
    throw new CliError(`Could not import the plugin definition at ${path}.`, {
      code: 'BK_PLUGIN_IMPORT',
      fix: 'Fix the plugin entry and its imports, then run bieberkit build again.',
      cause,
    });
  }
  if (!isPluginDef(loaded)) {
    throw new CliError(`${path} does not default-export a plugin.`, {
      code: 'BK_PLUGIN_NOT_EXPORTED',
      fix: 'Default-export the result of definePlugin from the package entry.',
    });
  }
  // The same kind discriminator is used by the server loader. Plugins are trusted build inputs (PLG-04).
  const def = loaded;
  const manifest = toManifest(def, COLLECTORS);
  const identity = checkManifest({ name, version, bieberkit: manifest }, def, COLLECTORS);
  if (!identity.ok) {
    throw new CliError(identity.message, { code: identity.code, fix: 'Make package.json and definePlugin agree.' });
  }
  return { root, pkg: { ...pkg, name, version }, def, manifest, envRows: describeEnv(def.envSchema) };
}

/** A check never repairs stale files; generation replaces the JSON only after all validation succeeds. */
export function syncPluginManifest(plugin: PluginPackage, check: boolean): void {
  const result = checkManifest(plugin.pkg, plugin.def, COLLECTORS);
  if (check) {
    if (!result.ok)
      throw new CliError(result.message, {
        code: result.code,
        fix: 'Run bieberkit build and review the manifest diff.',
      });
    return;
  }
  const path = join(plugin.root, 'package.json');
  const text = JSON.stringify({ ...plugin.pkg, bieberkit: plugin.manifest }, null, 2) + '\n';
  if (readFileSync(path, 'utf8') === text) return;
  const temporary = join(plugin.root, `.package-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: statSync(path).mode });
    renameSync(temporary, path);
  } catch (cause) {
    throw new CliError(`Could not write the plugin manifest in ${path}.`, {
      code: 'BK_PLUGIN_MANIFEST_WRITE',
      fix: 'Check that the package directory is writable, then retry the build.',
      cause,
    });
  } finally {
    rmSync(temporary, { force: true });
  }
}

export async function buildPluginManifest(cwd: string, check: boolean): Promise<Outcome | undefined> {
  const plugin = await inspectPluginPackage(cwd);
  if (plugin === undefined) return undefined;
  syncPluginManifest(plugin, check);
  return {
    data: { plugin: plugin.pkg.name, version: plugin.pkg.version, manifest: plugin.manifest, checked: check },
    text: `${check ? 'Checked' : 'Generated'} the static manifest of ${plugin.pkg.name}@${plugin.pkg.version}.`,
  };
}
