/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/boundaries.ts
 * @description Rule boundaries: a module reaches another module and a plugin only through its public entry, and project code never imports a tool or a driver library (MOD-01, PLG-01, PKG-03, section 4.3).
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

import { join, posix } from 'node:path';
import { importsOf } from '../imports.ts';
import {
  exportsSubpath,
  hasPluginName,
  installedPackageOfPath,
  packageOf,
  pluginOf,
  readJson,
} from '../plugin-info.ts';
import type { PluginInfo } from '../plugin-info.ts';
import type { Rule, Violation } from '../rule.ts';
import { isCode, violation } from '../rule.ts';

/** Libraries that only a driver adapter of a BieberKit package imports (PKG-03). Project code uses them through the package. */
const DRIVERS = new Set([
  'bullmq',
  'bentocache',
  'flydrive',
  'ioredis',
  'pg',
  'iovalkey',
  'nodemailer',
  'meilisearch',
  'typesense',
  '@sentry/node',
]);
const TOOLS = new Set(['bieberkit', 'create-bieberkit', '@bieberkit/mcp']);
const MODULES = /^(.*?\/modules\/)([^/]+)\//;

/** The package of a specifier, and the part after it. `@scope/name/sub` is `@scope/name` and `sub`. */
function split(specifier: string): { name: string; sub: string } {
  const parts = specifier.split('/');
  const length = specifier.startsWith('@') ? 2 : 1;
  return { name: parts.slice(0, length).join('/'), sub: parts.slice(length).join('/') };
}

/** The plugin that an installed package is, by name, keyword or manifest, with its `exports`. `undefined` when it is not one or not installed. */
function installedPlugin(root: string, name: string): PluginInfo | undefined {
  const json = readJson(join(root, 'node_modules', name, 'package.json'));
  return json === undefined ? undefined : pluginOf(json, `node_modules/${name}`);
}

/** Whether a path inside a plugin's package is one of the files that its package exports as its entry. */
const isEntry = (plugin: PluginInfo, path: string): boolean => {
  const bare = path.replace(/\.[cm]?[jt]sx?$/, '');
  return plugin.entries.has(bare) || plugin.entries.has(bare.replace(/\/index$/, ''));
};

export const boundariesRule: Rule = {
  name: 'boundaries',
  summary: 'Modules and plugins are reached through their public entry, and tools and drivers are not imported.',
  run: ({ files, root }) => {
    const found: Violation[] = [];
    for (const file of files.filter(isCode)) {
      const mine = MODULES.exec(file.path);
      const own = packageOf(root, file.path);
      const ownPlugin = own === undefined ? undefined : pluginOf(own.json, own.dir);
      for (const { specifier, line } of importsOf(file.text)) {
        const add = (code: string, message: string, fix: string): void => {
          found.push(violation('boundaries', code, file.path, line, message, fix));
        };
        if (specifier.startsWith('.')) {
          const target = posix.normalize(posix.join(posix.dirname(file.path), specifier));
          const theirs = MODULES.exec(`${target}/`);
          const rest = theirs === null ? '' : target.slice((theirs[1]?.length ?? 0) + (theirs[2]?.length ?? 0) + 1);
          // Another module is reached through its `module.ts` or its `index`, which say what it publishes (MOD-01, section 7.4).
          if (
            mine !== null &&
            theirs !== null &&
            mine[2] !== theirs[2] &&
            rest !== '' &&
            !/^\/?(?:(?:index|module)(?:\.[cm]?[jt]s)?)?$/.test(rest)
          ) {
            add(
              'BK_BOUNDARY_MODULE',
              `${file.path} imports inside the module ${theirs[2]}.`,
              `Import ${theirs[2]} through its index, or call its published service.`,
            );
          }
          // A path into the files of another plugin package, local or in `node_modules`, is not its entry (PLG-01).
          const installed = installedPackageOfPath(target);
          const where = installed === undefined ? packageOf(root, target) : undefined;
          const theirPlugin =
            installed !== undefined
              ? installedPlugin(root, installed.name)
              : where === undefined
                ? undefined
                : pluginOf(where.json, where.dir);
          if (theirPlugin !== undefined && theirPlugin.dir !== ownPlugin?.dir && !isEntry(theirPlugin, target)) {
            add(
              'BK_BOUNDARY_PLUGIN',
              `${specifier} reaches into the files of ${theirPlugin.name}.`,
              `Import from ${theirPlugin.name}, or from a subpath that its package.json exports (PLG-01).`,
            );
          }
          continue;
        }
        const { name, sub } = split(specifier);
        if (TOOLS.has(name)) {
          add(
            'BK_BOUNDARY_TOOLS',
            `${name} acts on the project and is never imported by it.`,
            'Use the package that the tool is built on, or run the command from a script.',
          );
        } else if (DRIVERS.has(name)) {
          add(
            'BK_BOUNDARY_DRIVER',
            `${name} is a driver library, and only its BieberKit package imports it.`,
            'Use the contract package (queue, cache, storage, mail) and choose the driver in the config (PKG-03).',
          );
        } else if (name !== ownPlugin?.name && sub !== '') {
          const theirs = installedPlugin(root, name);
          // A package that is not installed is a plugin only by its name, and then only the folders of its build are closed.
          if (theirs === undefined && !hasPluginName(name)) continue;
          const open =
            theirs === undefined || theirs.exportKeys.length === 0
              ? !/^(?:src|dist|lib|internal)(?:\/|$)/.test(sub)
              : exportsSubpath(theirs.exportKeys, sub);
          if (!open)
            add(
              'BK_BOUNDARY_PLUGIN',
              `${specifier} is not a public entry of ${name}.`,
              `Import from ${name}, or from a subpath that its package.json exports (PLG-01).`,
            );
        }
      }
    }
    return found;
  },
};
