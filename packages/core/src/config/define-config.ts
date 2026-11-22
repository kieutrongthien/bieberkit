/**
 * BieberKit
 *
 * @file        packages/core/src/config/define-config.ts
 * @description defineConfig, config sections and validateConfig for bieberkit.config.ts (CFG-08, CFG-09, spec 8.3).
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

import { ConfigValidationError } from '../errors/errors.ts';
import type { ConfigProblem } from '../errors/errors.ts';
import { DIALECTS } from './dialects.ts';
import type { Dialect } from './dialects.ts';
import { problemsOfFailure } from './parser.ts';
import type { Parser } from './parser.ts';

/** Sections of the config that other packages own, such as `admin`, `site` and `theme`. They add their keys by declaration merging. */
// oxlint-disable-next-line typescript/no-empty-interface
export interface ConfigSections {}

export type PluginEntry = string | readonly [name: string, options: Readonly<Record<string, unknown>>];

export interface ProjectConfigInput extends ConfigSections {
  name: string;
  author: string;
  license: string;
  database: { dialect: Dialect };
  tenancy: { mode: 'single' | 'shared-schema' };
  locales: { default: string; supported: readonly string[] };
  plugins: readonly PluginEntry[];
}

export interface ConfigSection<K extends keyof ConfigSections> {
  readonly key: K;
  readonly parser: Parser<ConfigSections[K]>;
}

export interface ValidateConfigOptions {
  /** The sections of the installed packages. A top-level key that no section owns is an error. */
  readonly sections?: readonly ConfigSection<keyof ConfigSections>[];
}

const TENANCY_MODES = ['single', 'shared-schema'] as const;
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const CORE_KEYS = new Set(['name', 'author', 'license', 'database', 'tenancy', 'locales', 'plugins']);

/** Words that mark a key as a secret. A key counts only when one of its words is in the list, so `tokenizer` is not `token`. */
const SECRET_WORDS = new Set(['password', 'passwd', 'secret', 'token', 'authorization']);
const SECRET_PAIRS = new Set(['apikey', 'privatekey']);

/** Marks the shape of the config for the compiler. It checks nothing at run time: `validateConfig` does, with the sections. */
export function defineConfig(input: ProjectConfigInput): ProjectConfigInput {
  return input;
}

export function defineConfigSection<K extends keyof ConfigSections>(
  key: K,
  parser: Parser<ConfigSections[K]>,
): ConfigSection<K> {
  return { key, parser };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wordsOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

function looksSecret(key: string): boolean {
  const words = wordsOf(key);
  if (words.some((word) => SECRET_WORDS.has(word))) return true;
  return (
    words.some((word, index) => index > 0 && SECRET_PAIRS.has(`${words[index - 1]}${word}`)) ||
    SECRET_PAIRS.has(words.join(''))
  );
}

function scanSecrets(value: unknown, path: string, found: ConfigProblem[], depth = 0): void {
  if (depth > 12) return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) scanSecrets(item, `${path}[${index}]`, found, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (looksSecret(key)) {
      found.push({
        key: at,
        code: 'CFG_CONFIG_SECRET',
        message: `${at} looks like a secret. The config file never holds secrets.`,
        fix: 'Read the value from an environment variable, and declare the key in the env schema of the project or the plugin (CFG-08).',
      });
    } else scanSecrets(item, at, found, depth + 1);
  }
}

const invalid = (key: string, message: string, fix: string): ConfigProblem => ({
  key,
  code: 'CFG_CONFIG_INVALID',
  message,
  fix,
});

function text(source: Record<string, unknown>, key: string, problems: ConfigProblem[]): string {
  const value = source[key];
  if (typeof value === 'string' && value.trim() !== '') return value;
  problems.push(
    invalid(
      key,
      value === undefined ? `${key} is required.` : `${key} must be a non-empty string.`,
      `Set ${key} to a text value.`,
    ),
  );
  return '';
}

function section(
  source: Record<string, unknown>,
  key: string,
  problems: ConfigProblem[],
): Record<string, unknown> | undefined {
  const value = source[key];
  if (isRecord(value)) return value;
  problems.push(
    invalid(
      key,
      value === undefined ? `${key} is required.` : `${key} must be an object.`,
      `Set ${key} to an object, as in the example of the spec (section 8.3).`,
    ),
  );
  return undefined;
}

function oneOf<T extends string>(
  source: Record<string, unknown> | undefined,
  key: string,
  path: string,
  allowed: readonly T[],
  problems: ConfigProblem[],
): T | undefined {
  if (source === undefined) return undefined;
  const value = source[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined)
    problems.push(
      invalid(path, `${path} must be one of ${allowed.join(', ')}.`, `Set ${path} to one of ${allowed.join(', ')}.`),
    );
  return match;
}

function checkLocales(
  source: Record<string, unknown>,
  problems: ConfigProblem[],
): { default: string; supported: string[] } {
  const locales = section(source, 'locales', problems);
  const result = { default: '', supported: [] as string[] };
  if (locales === undefined) return result;
  const given = locales['default'];
  if (typeof given === 'string' && LANGUAGE_TAG.test(given)) result.default = given;
  else
    problems.push(
      invalid(
        'locales.default',
        'locales.default must be a language tag such as vi or pt-BR.',
        'Set locales.default to a language tag.',
      ),
    );
  const supported = locales['supported'];
  if (!Array.isArray(supported) || supported.length === 0) {
    problems.push(
      invalid(
        'locales.supported',
        'locales.supported must be a non-empty list of language tags.',
        'List every locale the project serves.',
      ),
    );
    return result;
  }
  for (const [index, tag] of supported.entries()) {
    if (typeof tag === 'string' && LANGUAGE_TAG.test(tag)) result.supported.push(tag);
    else
      problems.push(invalid(`locales.supported[${index}]`, 'Not a language tag.', 'Use tags such as vi, en or pt-BR.'));
  }
  if (result.default !== '' && !supported.includes(result.default)) {
    problems.push(
      invalid(
        'locales.default',
        `locales.default "${result.default}" is not in locales.supported.`,
        'Add the default locale to locales.supported, or change the default.',
      ),
    );
  }
  return result;
}

function checkPlugins(source: Record<string, unknown>, problems: ConfigProblem[]): PluginEntry[] {
  const list = source['plugins'];
  if (!Array.isArray(list)) {
    problems.push(
      invalid(
        'plugins',
        list === undefined ? 'plugins is required.' : 'plugins must be a list.',
        'Set plugins to a list of names or [name, options] pairs. It may be empty.',
      ),
    );
    return [];
  }
  const entries: PluginEntry[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of list.entries()) {
    const path = `plugins[${index}]`;
    let name: string | undefined;
    if (typeof entry === 'string' && entry !== '') {
      name = entry;
      entries.push(entry);
    } else if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && entry[0] !== '') {
      if (isRecord(entry[1])) {
        name = entry[0];
        entries.push([entry[0], entry[1]]);
      } else
        problems.push(
          invalid(
            `${path}[1]`,
            'The options of a plugin must be an object.',
            'Write the entry as [name, { ...options }].',
          ),
        );
    } else
      problems.push(
        invalid(
          path,
          'A plugin entry is a package name or a [name, options] pair.',
          'Write the entry as "name" or ["name", { ...options }].',
        ),
      );
    if (name !== undefined) {
      if (seen.has(name)) problems.push(invalid(path, `${name} is listed twice.`, 'List each plugin once.'));
      seen.add(name);
    }
  }
  return entries;
}

/**
 * Checks the config at build and at boot (CFG-09). Every problem is reported together, in the shape of an env error.
 * `sections` are the parsers of the packages that own the optional keys (`admin`, `site`, `theme`).
 */
export function validateConfig(input: unknown, options: ValidateConfigOptions = {}): ProjectConfigInput {
  if (!isRecord(input)) {
    throw new ConfigValidationError([
      invalid(
        '(root)',
        'The config must be an object.',
        'Export the result of defineConfig({ ... }) from bieberkit.config.ts.',
      ),
    ]);
  }
  const problems: ConfigProblem[] = [];
  const name = text(input, 'name', problems);
  const author = text(input, 'author', problems);
  const license = text(input, 'license', problems);
  const database = section(input, 'database', problems);
  const dialect = oneOf(database, 'dialect', 'database.dialect', DIALECTS, problems);
  const tenancy = section(input, 'tenancy', problems);
  const mode = oneOf(tenancy, 'mode', 'tenancy.mode', TENANCY_MODES, problems);
  const locales = checkLocales(input, problems);
  const plugins = checkPlugins(input, problems);

  const sections = options.sections ?? [];
  const owned = new Set<string>(sections.map((owner) => owner.key));
  for (const key of Object.keys(input)) {
    if (!CORE_KEYS.has(key) && !owned.has(key)) {
      problems.push({
        key,
        code: 'CFG_CONFIG_UNKNOWN',
        message: `${key} is not a known config key.`,
        fix: `Check the spelling of ${key}, or install the package that adds this section.`,
      });
    }
  }
  const parsed: Record<string, unknown> = {};
  for (const owner of sections) {
    const value = input[owner.key];
    if (value === undefined) continue;
    try {
      parsed[owner.key] = owner.parser.parse(value);
    } catch (error) {
      problems.push(...problemsOfFailure(error, owner.key));
    }
  }
  scanSecrets(input, '', problems);

  if (problems.length > 0 || dialect === undefined || mode === undefined) throw new ConfigValidationError(problems);
  return {
    ...parsed,
    name,
    author,
    license,
    database: { dialect },
    tenancy: { mode },
    locales,
    plugins,
  };
}

export type { Dialect };
