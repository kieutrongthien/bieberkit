/**
 * BieberKit
 *
 * @file        packages/cli/src/testing/project.ts
 * @description Makes a throwaway project on disk for the tests of the commands: a config, plugins in node_modules and an env file (section 5.2).
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

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FixturePlugin {
  readonly name: string;
  readonly version?: string;
  readonly requires?: Readonly<Record<string, string>>;
  /** The keys of its env schema, each with its description. Each must start with the short name in upper case. */
  readonly env?: Readonly<Record<string, string>>;
  /** Left out, the package has no default export. */
  readonly noDefault?: boolean;
  /** The text of the options parser. Defaults to the one that takes none. */
  readonly options?: string;
}

export interface FixtureOptions {
  readonly plugins?: readonly FixturePlugin[];
  /** The plugin entries of the config, as source text. Defaults to the names of `plugins`. */
  readonly entries?: readonly string[];
  /** The whole config file, instead of the one that the fixture writes. */
  readonly config?: string;
  readonly dotenv?: string;
  readonly dialect?: 'sqlite' | 'postgres' | 'mysql';
}

export interface Fixture {
  readonly root: string;
  cleanup(): void;
}

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'core');

function pluginSource(plugin: FixturePlugin): string {
  const keys = Object.entries(plugin.env ?? {})
    .map(([key, description]) => `${key}: env.string().describe(${JSON.stringify(description)})`)
    .join(', ');
  return [
    "import { definePlugin, env } from '@bieberkit/core';",
    plugin.noDefault === true ? 'export const plugin = ' : 'export default ',
    `definePlugin({ name: ${JSON.stringify(plugin.name)}, version: ${JSON.stringify(plugin.version ?? '1.0.0')}, core: '*', dialects: ['sqlite', 'postgres', 'mysql'], requires: ${JSON.stringify(plugin.requires ?? {})}, env: { ${keys} }${plugin.options === undefined ? '' : `, options: ${plugin.options}`} });`,
  ].join('\n');
}

/** A project in a new directory. `node_modules/@bieberkit/core` is the one of this repository, so the plugins import the real core. */
export function makeProject(options: FixtureOptions = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'bk-cli-'));
  const modules = join(root, 'node_modules');
  mkdirSync(join(modules, '@bieberkit'), { recursive: true });
  symlinkSync(CORE, join(modules, '@bieberkit', 'core'), 'dir');
  for (const plugin of options.plugins ?? []) {
    const folder = join(modules, plugin.name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'package.json'),
      JSON.stringify({
        name: plugin.name,
        version: plugin.version ?? '1.0.0',
        type: 'module',
        exports: { '.': './index.mjs', './package.json': './package.json' },
      }),
    );
    writeFileSync(join(folder, 'index.mjs'), pluginSource(plugin));
  }
  const entries = options.entries ?? (options.plugins ?? []).map((plugin) => JSON.stringify(plugin.name));
  writeFileSync(
    join(root, 'bieberkit.config.ts'),
    options.config ??
      `import { defineConfig } from '@bieberkit/core';
export default defineConfig({
  name: 'demo',
  author: 'Test <test@example.com>',
  license: 'UNLICENSED',
  database: { dialect: ${JSON.stringify(options.dialect ?? 'sqlite')} },
  tenancy: { mode: 'single' },
  locales: { default: 'en', supported: ['en'] },
  plugins: [${entries.join(', ')}],
});
`,
  );
  if (options.dotenv !== undefined) writeFileSync(join(root, '.env'), options.dotenv);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
