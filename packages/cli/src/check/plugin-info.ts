/**
 * BieberKit
 *
 * @file        packages/cli/src/check/plugin-info.ts
 * @description What the check rules know of a plugin without importing it: its package, its static manifest (PLG-07), its public entries and its tables.
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
import { dirname, join, posix } from 'node:path';

/** A plugin package, read from its `package.json` and nothing else (PLG-07): the check never imports a plugin. */
export interface PluginInfo {
  readonly name: string;
  /** The folder of the package, relative to the project root, with `/`. Empty when it is the root. */
  readonly dir: string;
  /** The tables that its manifest says it owns. */
  readonly tables: readonly string[];
  /** The keys of its `exports`. */
  readonly exportKeys: readonly string[];
  /** The files that its `.` export, `main` and `module` name, relative to the root, without the extension. */
  readonly entries: ReadonlySet<string>;
}

type Json = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): Json | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;

const strings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  const record = asRecord(value);
  return record === undefined ? [] : Object.values(record).flatMap(strings);
};

/** The names that a plugin has by convention (PLG-05). */
export const hasPluginName = (name: string): boolean =>
  name.startsWith('@bieberkit/plugin-') || name.includes('bieberkit-plugin-');

const withoutExtension = (path: string): string => path.replace(/\.[cm]?[jt]sx?$/, '');

/** Whether a `package.json` is the one of a plugin: it has the name, the keyword or the static manifest. */
export function isPluginPackage(json: Json): boolean {
  const name = typeof json['name'] === 'string' ? json['name'] : '';
  const keywords = Array.isArray(json['keywords']) ? json['keywords'] : [];
  return hasPluginName(name) || keywords.includes('bieberkit-plugin') || asRecord(json['bieberkit']) !== undefined;
}

export function readJson(path: string): Json | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return asRecord(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return undefined;
  }
}

/** The plugin that a `package.json` describes, or `undefined` when it is not one. `dir` is relative to the project root. */
export function pluginOf(json: Json, dir: string): PluginInfo | undefined {
  if (!isPluginPackage(json) || typeof json['name'] !== 'string') return undefined;
  const manifest = asRecord(json['bieberkit']);
  const exported = asRecord(json['exports']);
  const entry = exported === undefined ? [] : strings(exported['.']);
  const main = [json['main'], json['module']].filter((value): value is string => typeof value === 'string');
  return {
    name: json['name'],
    dir,
    tables: Array.isArray(manifest?.['tables']) ? manifest['tables'].map(String) : [],
    exportKeys: exported === undefined ? [] : Object.keys(exported),
    entries: new Set([...entry, ...main].map((file) => withoutExtension(posix.normalize(posix.join(dir, file))))),
  };
}

/** Whether a subpath such as `public/card` is one of the `exports` keys, which may be a pattern with `*`. */
export function exportsSubpath(keys: readonly string[], sub: string): boolean {
  return keys.some((key) => {
    const pattern = key.replace(/^\.\/?/, '');
    if (!pattern.includes('*')) return pattern === sub;
    const [head = '', tail = ''] = pattern.split('*');
    return sub.length >= head.length + tail.length && sub.startsWith(head) && sub.endsWith(tail);
  });
}

/** The plugins that are installed: the packages of `node_modules` that are one, by name, keyword or manifest. */
export function installedPlugins(root: string): PluginInfo[] {
  const base = join(root, 'node_modules');
  if (!existsSync(base)) return [];
  const found: PluginInfo[] = [];
  const read = (folder: string): void => {
    const json = readJson(join(base, folder, 'package.json'));
    const plugin = json === undefined ? undefined : pluginOf(json, `node_modules/${folder}`);
    if (plugin !== undefined) found.push(plugin);
  };
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name.startsWith('@')) {
      for (const inner of readdirSync(join(base, entry.name), { withFileTypes: true }))
        read(`${entry.name}/${inner.name}`);
    } else read(entry.name);
  }
  return found;
}

/** The nearest `package.json` above a file of the project, up to the root: the package that the file belongs to. */
export function packageOf(root: string, path: string): { readonly dir: string; readonly json: Json } | undefined {
  let dir = posix.dirname(path);
  for (;;) {
    const json = readJson(join(root, dir === '.' ? '' : dir, 'package.json'));
    if (json !== undefined) return { dir: dir === '.' ? '' : dir, json };
    if (dir === '.' || dir === '' || dir === dirname(dir)) return undefined;
    dir = posix.dirname(dir);
  }
}

/** The package that a path inside `node_modules/<package>/` belongs to, or `undefined` when it is not inside one. */
export function installedPackageOfPath(path: string): { readonly name: string } | undefined {
  const name = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)(?:\/|$)/.exec(path)?.[1];
  return name === undefined ? undefined : { name };
}
