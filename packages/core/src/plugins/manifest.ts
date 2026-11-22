/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/manifest.ts
 * @description The static manifest in the bieberkit field of package.json, and the CI check that it matches definePlugin (PLG-07, ADR 0011).
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
import type { PluginDef } from './define-plugin.ts';

/** The `bieberkit` field of a plugin's `package.json`. `name` and `version` come from `package.json` itself. */
export interface Manifest {
  core: string;
  dialects: Dialect[];
  requires: Record<string, string>;
  conflicts: string[];
  env: string[];
  tables: string[];
  routes: string[];
  permissions: string[];
  admin: string[];
}

/**
 * Core cannot know entities, routes or admin screens. The package that adds such a contribution supplies a collector
 * that lists the table names, route paths or admin paths in it, so the manifest cannot drift from the code.
 */
export interface KeyCollector {
  readonly field: 'tables' | 'routes' | 'admin';
  collect(contributions: Readonly<Record<string, unknown>>): readonly string[];
}

export type ManifestCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: 'PLG_MANIFEST_NAME' | 'PLG_MANIFEST_VERSION' | 'PLG_MANIFEST_MISSING' | 'PLG_MANIFEST_STALE';
      readonly message: string;
    };

const sortedUnique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].toSorted();

function collected(
  field: KeyCollector['field'],
  def: PluginDef<unknown>,
  collectors: readonly KeyCollector[],
): string[] {
  return sortedUnique(
    collectors
      .filter((collector) => collector.field === field)
      .flatMap((collector) => collector.collect(def.module.contributions)),
  );
}

/** The manifest of a plugin, with every list sorted, so the same plugin always gives the same text. */
export function toManifest(def: PluginDef<unknown>, collectors: readonly KeyCollector[] = []): Manifest {
  return {
    core: def.core,
    dialects: sortedUnique(def.dialects),
    requires: Object.fromEntries(Object.entries(def.requires).toSorted(([a], [b]) => a.localeCompare(b))),
    conflicts: sortedUnique(def.conflicts),
    env: sortedUnique(Object.keys(def.envSchema.keys)),
    tables: collected('tables', def, collectors),
    routes: collected('routes', def, collectors),
    permissions: sortedUnique(def.permissions),
    admin: collected('admin', def, collectors),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/** Text with object keys sorted, so a field written in another key order compares equal when it means the same. */
export function canonicalText(value: unknown): string {
  return JSON.stringify(canonical(value), null, 2);
}

/** The CI check: the field in `package.json` must equal what `definePlugin` produces. */
export function checkManifest(
  pkg: { readonly name: string; readonly version: string; readonly bieberkit?: unknown },
  def: PluginDef<unknown>,
  collectors: readonly KeyCollector[] = [],
): ManifestCheck {
  if (pkg.name !== def.name) {
    return {
      ok: false,
      code: 'PLG_MANIFEST_NAME',
      message: `package.json says ${pkg.name}, definePlugin says ${def.name}. Fix the name in one of them.`,
    };
  }
  if (pkg.version !== def.version) {
    return {
      ok: false,
      code: 'PLG_MANIFEST_VERSION',
      message: `package.json is ${pkg.version}, definePlugin is ${def.version}. Make the versions equal.`,
    };
  }
  if (pkg.bieberkit === undefined) {
    return {
      ok: false,
      code: 'PLG_MANIFEST_MISSING',
      message: 'package.json has no "bieberkit" field. Run bieberkit build to write it.',
    };
  }
  if (canonicalText(pkg.bieberkit) !== canonicalText(toManifest(def, collectors))) {
    return {
      ok: false,
      code: 'PLG_MANIFEST_STALE',
      message: 'The "bieberkit" field of package.json differs from definePlugin. Run bieberkit build to regenerate it.',
    };
  }
  return { ok: true };
}
