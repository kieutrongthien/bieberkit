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

import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { importsOf } from '../imports.ts';
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

const isPlugin = (name: string): boolean =>
  name.startsWith('@bieberkit/plugin-') || name.startsWith('bieberkit-plugin-');

/** The package of a specifier, and the part after it. `@scope/name/sub` is `@scope/name` and `sub`. */
function split(specifier: string): { name: string; sub: string } {
  const parts = specifier.split('/');
  const length = specifier.startsWith('@') ? 2 : 1;
  return { name: parts.slice(0, length).join('/'), sub: parts.slice(length).join('/') };
}

/** The subpaths that a package exports, when it is installed. `undefined` when it is not, or has no `exports`. */
function exportedSubpaths(root: string, name: string): ReadonlySet<string> | undefined {
  const path = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(path)) return undefined;
  const found: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const exported: unknown = typeof found === 'object' && found !== null ? Reflect.get(found, 'exports') : undefined;
  if (typeof exported !== 'object' || exported === null) return undefined;
  return new Set(Object.keys(exported).map((key) => key.replace(/^\.\/?/, '')));
}

export const boundariesRule: Rule = {
  name: 'boundaries',
  summary: 'Modules and plugins are reached through their public entry, and tools and drivers are not imported.',
  run: ({ files, root }) => {
    const found: Violation[] = [];
    for (const file of files.filter(isCode)) {
      const mine = MODULES.exec(file.path);
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
        } else if (isPlugin(name) && sub !== '') {
          const exported = exportedSubpaths(root, name);
          const open = exported === undefined ? !/^(?:src|dist|lib|internal)(?:\/|$)/.test(sub) : exported.has(sub);
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
