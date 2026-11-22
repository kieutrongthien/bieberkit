/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/resolver.ts
 * @description The plugin resolver: one pure function shared by the scaffolder, bieberkit add and the kernel (spec 11.2, ADR 0011).
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

import type { Dialect } from '../config/dialects.ts';
import { PluginError } from './errors.ts';
import type { PluginProblem } from './errors.ts';
import type { Manifest } from './manifest.ts';
import { envPrefixOf, permissionPrefixOf } from './names.ts';
import { rangeProblem, satisfies, versionProblem } from './range.ts';

export interface Installed {
  readonly name: string;
  readonly version: string;
  readonly manifest: Manifest;
}

export interface ResolveContext {
  /** The version of `@bieberkit/core` in use. */
  readonly core: string;
  readonly dialect: Dialect;
}

export interface Resolution {
  /** Boot order. Shutdown is the reverse. */
  readonly order: readonly string[];
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const COLLISIONS = [
  { code: 'PLG_COLLISION_TABLE', label: 'table', pick: (m: Manifest) => m.tables },
  { code: 'PLG_COLLISION_ROUTE', label: 'route', pick: (m: Manifest) => m.routes },
  { code: 'PLG_COLLISION_PERMISSION', label: 'permission', pick: (m: Manifest) => m.permissions },
  { code: 'PLG_COLLISION_ENV', label: 'env key', pick: (m: Manifest) => m.env },
  { code: 'PLG_COLLISION_ADMIN', label: 'admin path', pick: (m: Manifest) => m.admin },
] as const;

/** The first cycle among the plugins that Kahn's algorithm could not place, as `a -> b -> a`. */
function findCycle(left: ReadonlySet<string>, edges: ReadonlyMap<string, readonly string[]>): string[] {
  const start = [...left].toSorted(byText)[0];
  const path: string[] = [];
  let current = start;
  while (current !== undefined && !path.includes(current)) {
    path.push(current);
    current = (edges.get(current) ?? []).find((dep) => left.has(dep));
  }
  return current === undefined ? path : [...path.slice(path.indexOf(current)), current];
}

/**
 * Checks `core` ranges, dialects, `requires`, `conflicts`, prefixes and collisions, then orders the plugins so each comes after
 * what it requires. Every problem is reported together, in an order that does not depend on the input order.
 */
export function resolvePlugins(installed: readonly Installed[], context: ResolveContext): Resolution {
  const plugins = installed.toSorted((a, b) => byText(a.name, b.name));
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const problems: PluginProblem[] = [];
  const add = (code: string, message: string, fix: string): void => void problems.push({ code, message, fix });

  const contextProblem = versionProblem(context.core);
  if (contextProblem !== undefined) problems.push(contextProblem);

  for (const plugin of plugins) {
    const { name, version, manifest } = plugin;
    const own = versionProblem(version);
    if (own !== undefined) add(own.code, `${name}: ${own.message}`, own.fix);

    const coreBad = rangeProblem(manifest.core);
    if (coreBad !== undefined) add(coreBad.code, `${name}: ${coreBad.message}`, coreBad.fix);
    else if (contextProblem === undefined && !satisfies(context.core, manifest.core)) {
      add(
        'PLG_CORE_RANGE',
        `${name} needs core ${manifest.core}, found ${context.core}`,
        `Upgrade @bieberkit/core to a version inside ${manifest.core}, or use another version of ${name}.`,
      );
    }
    if (!manifest.dialects.includes(context.dialect)) {
      add(
        'PLG_DIALECT',
        `${name} supports ${manifest.dialects.join(', ')}, the project uses ${context.dialect}`,
        `Choose a database that ${name} supports, or remove the plugin.`,
      );
    }

    for (const [dep, range] of Object.entries(manifest.requires).toSorted(([a], [b]) => byText(a, b))) {
      const bad = rangeProblem(range);
      if (bad !== undefined) {
        add(bad.code, `${name}: requires ${dep} ${range}, but ${bad.message}`, bad.fix);
        continue;
      }
      const found = byName.get(dep);
      if (found === undefined)
        add('PLG_MISSING_REQUIRE', `${name} requires ${dep}`, `Install ${dep} ${range}, or remove ${name}.`);
      else if (versionProblem(found.version) === undefined && !satisfies(found.version, range)) {
        add(
          'PLG_REQUIRE_RANGE',
          `${name} requires ${dep} ${range}, found ${found.version}`,
          `Install a version of ${dep} inside ${range}, or use another version of ${name}.`,
        );
      }
    }

    for (const other of [...manifest.conflicts].toSorted(byText)) {
      if (byName.has(other))
        add('PLG_CONFLICT', `${name} conflicts with ${other}`, `Remove one of ${name} and ${other}.`);
    }
    const envPrefix = envPrefixOf(name);
    for (const key of manifest.env) {
      if (!key.startsWith(envPrefix))
        add(
          'PLG_PREFIX_ENV',
          `${name}: env key ${key} must start with ${envPrefix}`,
          `Rename the key to ${envPrefix}${key}.`,
        );
    }
    const permissionPrefix = permissionPrefixOf(name);
    for (const permission of manifest.permissions) {
      if (!permission.startsWith(permissionPrefix)) {
        add(
          'PLG_PREFIX_PERMISSION',
          `${name}: permission ${permission} must start with ${permissionPrefix}`,
          `Rename the permission to ${permissionPrefix}${permission}.`,
        );
      }
    }
  }

  for (const { code, label, pick } of COLLISIONS) {
    const owners = new Map<string, Set<string>>();
    for (const plugin of plugins) {
      for (const key of pick(plugin.manifest)) owners.set(key, (owners.get(key) ?? new Set()).add(plugin.name));
    }
    for (const [key, names] of [...owners].toSorted(([a], [b]) => byText(a, b))) {
      if (names.size > 1)
        add(
          code,
          `${label} "${key}" is claimed by ${[...names].toSorted(byText).join(' and ')}`,
          `Give each plugin its own ${label}, or remove one of the plugins.`,
        );
    }
  }

  // Kahn's algorithm. Ties are broken by name, so the order is the same for any input order.
  const edges = new Map(
    plugins.map((plugin) => [
      plugin.name,
      Object.keys(plugin.manifest.requires)
        .filter((dep) => byName.has(dep))
        .toSorted(byText),
    ]),
  );
  const waiting = new Map(plugins.map((plugin) => [plugin.name, edges.get(plugin.name)?.length ?? 0]));
  const dependents = new Map<string, string[]>();
  for (const [name, deps] of edges) for (const dep of deps) dependents.set(dep, [...(dependents.get(dep) ?? []), name]);
  const ready = plugins.filter((plugin) => waiting.get(plugin.name) === 0).map((plugin) => plugin.name);
  const order: string[] = [];
  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) break;
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const remaining = (waiting.get(dependent) ?? 1) - 1;
      waiting.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
    ready.sort(byText);
  }
  if (order.length !== plugins.length) {
    const left = new Set(plugins.map((plugin) => plugin.name).filter((name) => !order.includes(name)));
    add(
      'PLG_CYCLE',
      `plugins require each other in a cycle: ${findCycle(left, edges).join(' -> ')}`,
      'Remove one of the requires in the cycle.',
    );
  }

  if (problems.length > 0) throw new PluginError(problems);
  return { order };
}
