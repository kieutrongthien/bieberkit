/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/define-plugin.ts
 * @description definePlugin and parsePluginOptions: a module packaged for reuse, with the manifest fields of spec 11.1 (MOD-01, PLG-07).
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

import { defineEnv } from '../config/env.ts';
import type { EnvKeyBuilder, EnvSchema } from '../config/env.ts';
import { DIALECTS } from '../config/dialects.ts';
import type { Dialect } from '../config/dialects.ts';
import { runParser } from '../config/parser.ts';
import type { Parser } from '../config/parser.ts';
import type { ServiceRegistry } from '../container/container.ts';
import { defineModule, MODULE_NAME } from '../module/define-module.ts';
import type { ModuleContributions, ModuleDef, ServiceDefs } from '../module/define-module.ts';
import { PluginError } from './errors.ts';
import type { PluginProblem } from './errors.ts';
import { envPrefixOf, isPluginName, permissionPrefixOf, shortNameOf } from './names.ts';
import { rangeProblem, versionProblem } from './range.ts';

export type SeedFn = (services: ServiceRegistry) => void | Promise<void>;

export interface PluginInput<O = undefined> extends ModuleContributions {
  /** The npm name, for example `@bieberkit/plugin-seo`. The module name is its short name, `seo`. */
  readonly name: string;
  readonly version: string;
  /** The range of `@bieberkit/core` this plugin supports. */
  readonly core: string;
  readonly dialects: readonly Dialect[];
  readonly requires?: Readonly<Record<string, string>>;
  readonly conflicts?: readonly string[];
  /** Env keys of the plugin. Each starts with the short name in upper case, for example `SEO_`. */
  readonly env?: Readonly<Record<string, EnvKeyBuilder<unknown>>>;
  /** Permission strings. Each starts with the short name and a dot, for example `seo.read`. */
  readonly permissions?: readonly string[];
  /** Validates the options given in `bieberkit.config.ts`. */
  readonly options?: Parser<O>;
  readonly services?: ServiceDefs;
  readonly seed?: SeedFn;
}

export interface PluginDef<O = undefined> {
  readonly kind: 'plugin';
  readonly name: string;
  readonly shortName: string;
  readonly version: string;
  readonly core: string;
  readonly dialects: readonly Dialect[];
  readonly requires: Readonly<Record<string, string>>;
  readonly conflicts: readonly string[];
  readonly permissions: readonly string[];
  readonly options: Parser<O>;
  readonly seed?: SeedFn;
  readonly module: ModuleDef;
  readonly envSchema: EnvSchema<Record<string, unknown>>;
}

const KNOWN = new Set([
  'name',
  'version',
  'core',
  'dialects',
  'requires',
  'conflicts',
  'env',
  'permissions',
  'options',
  'services',
  'seed',
]);

/** The parser of a plugin that declares no options: it accepts nothing, so an entry with options is an error, not ignored. */
const noOptions: Parser<undefined> = {
  parse(input) {
    if (input !== undefined) throw new Error('this plugin takes no options');
    return undefined;
  },
};

function problemsOf(input: PluginInput<unknown>): PluginProblem[] {
  const problems: PluginProblem[] = [];
  const add = (problem: PluginProblem | undefined): void => {
    if (problem !== undefined) problems.push(problem);
  };
  if (!isPluginName(input.name) || !MODULE_NAME.test(shortNameOf(input.name))) {
    problems.push({
      code: 'PLG_NAME',
      message: `"${input.name}" is not a plugin name.`,
      fix: 'Use an npm package name such as @bieberkit/plugin-seo. The part after plugin- is lower case letters, digits and dashes.',
    });
  }
  add(versionProblem(input.version));
  add(rangeProblem(input.core));
  for (const range of Object.values(input.requires ?? {})) add(rangeProblem(range));
  if (input.dialects.length === 0 || input.dialects.some((dialect) => !DIALECTS.includes(dialect))) {
    problems.push({
      code: 'PLG_DIALECT',
      message: `${input.name}: dialects must be a non-empty list of ${DIALECTS.join(', ')}.`,
      fix: `List the dialects the plugin supports, from ${DIALECTS.join(', ')}.`,
    });
  }
  const envPrefix = envPrefixOf(input.name);
  for (const key of Object.keys(input.env ?? {})) {
    if (!key.startsWith(envPrefix)) {
      problems.push({
        code: 'PLG_PREFIX_ENV',
        message: `${input.name}: env key ${key} must start with ${envPrefix}`,
        fix: `Rename the key to ${envPrefix}${key}.`,
      });
    }
  }
  const permissionPrefix = permissionPrefixOf(input.name);
  for (const permission of input.permissions ?? []) {
    if (!permission.startsWith(permissionPrefix)) {
      problems.push({
        code: 'PLG_PREFIX_PERMISSION',
        message: `${input.name}: permission ${permission} must start with ${permissionPrefix}`,
        fix: `Rename the permission to ${permissionPrefix}${permission}.`,
      });
    }
  }
  const settingPrefix = `${shortNameOf(input.name)}.`;
  const seen = new Set<string>();
  for (const setting of input.settings ?? []) {
    if (!setting.key.startsWith(settingPrefix)) {
      problems.push({
        code: 'PLG_PREFIX_SETTING',
        message: `${input.name}: setting ${setting.key} must start with ${settingPrefix}`,
        fix: `Rename the setting to ${settingPrefix}${setting.key}.`,
      });
    }
    if (seen.has(setting.key)) {
      problems.push({
        code: 'PLG_SETTING_DUPLICATE',
        message: `${input.name}: setting ${setting.key} is declared twice.`,
        fix: 'Declare each setting once.',
      });
    }
    seen.add(setting.key);
  }
  if (input.requires !== undefined && input.name in input.requires) {
    problems.push({
      code: 'PLG_CYCLE',
      message: `${input.name} requires itself.`,
      fix: 'Remove the plugin from its own requires.',
    });
  }
  if (input.conflicts?.includes(input.name) === true) {
    problems.push({
      code: 'PLG_CONFLICT',
      message: `${input.name} conflicts with itself.`,
      fix: 'Remove the plugin from its own conflicts.',
    });
  }
  return problems;
}

export function definePlugin(input: PluginInput): PluginDef;
export function definePlugin<O>(input: PluginInput<O> & { readonly options: Parser<O> }): PluginDef<O>;
/**
 * Collects what a plugin declares and refuses, at once, what the resolver would refuse later: a bad version or range,
 * a missing prefix, an unsupported dialect. Plugin authors then see the problem when they build.
 */
export function definePlugin(input: PluginInput<unknown>): PluginDef<unknown> {
  const problems = problemsOf(input);
  if (problems.length > 0) throw new PluginError(problems);

  const contributions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) if (!KNOWN.has(key)) contributions[key] = value;
  const shortName = shortNameOf(input.name);
  const module = defineModule({
    ...contributions,
    name: shortName,
    ...(input.services === undefined ? {} : { services: input.services }),
  });

  return Object.freeze({
    kind: 'plugin',
    name: input.name,
    shortName,
    version: input.version,
    core: input.core,
    dialects: Object.freeze([...input.dialects]),
    requires: Object.freeze({ ...input.requires }),
    conflicts: Object.freeze([...(input.conflicts ?? [])]),
    permissions: Object.freeze([...(input.permissions ?? [])]),
    options: input.options ?? noOptions,
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    module,
    envSchema: defineEnv({ ...input.env }),
  });
}

/** Validates the options of one `plugins` entry of `bieberkit.config.ts`. `path` is where the entry is, for error messages. */
export function parsePluginOptions<O>(def: PluginDef<O>, options: unknown, path = 'options'): O {
  return runParser(def.options, options, path);
}
