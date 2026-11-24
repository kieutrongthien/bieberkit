/**
 * BieberKit
 *
 * @file        tools/lib/plugin-manifests.ts
 * @description Generates and verifies first-party plugin package manifests and the bundled scaffolder index (PLG-07).
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

import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { format } from 'oxfmt';
import { CliError } from '../../packages/cli/src/errors.ts';
import { inspectPluginPackage, syncPluginManifest } from '../../packages/cli/src/plugin-manifest.ts';
import type { PluginPackage } from '../../packages/cli/src/plugin-manifest.ts';

const INDEX_PATH = 'packages/create/src/scaffold/plugin-index.ts';
const HEADER =
  '/**\n * BieberKit\n *\n * @file        packages/create/src/scaffold/plugin-index.ts\n * @description Bundled first-party plugin manifests and environment descriptions generated from plugin packages (PLG-07).\n * @author      Bieber Kieu <kieutrongthien@gmail.com>\n * @generated   pnpm manifests:write\n * @copyright   Copyright (c) 2026 Bieber Kieu\n * @license     Apache-2.0\n *\n * Licensed under the Apache License, Version 2.0 (the "License");\n * you may not use this file except in compliance with the License.\n * You may obtain a copy of the License at\n *\n *     http://www.apache.org/licenses/LICENSE-2.0\n *\n * Unless required by applicable law or agreed to in writing, software\n * distributed under the License is distributed on an "AS IS" BASIS,\n * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n * See the License for the specific language governing permissions and\n * limitations under the License.\n *\n * SPDX-License-Identifier: Apache-2.0\n */\n\n';

export async function syncFirstPartyManifests(root: string, write: boolean): Promise<number> {
  const folder = join(root, 'plugins');
  const plugins: PluginPackage[] = [];
  const names = new Set<string>();
  for (const entry of readdirSync(folder, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !existsSync(join(folder, entry.name, 'package.json'))) continue;
    const plugin = await inspectPluginPackage(join(folder, entry.name));
    if (plugin === undefined)
      throw new CliError(`Invalid first-party plugin in ${entry.name}.`, {
        code: 'BK_PLUGIN_PACKAGE',
        fix: 'Use a plugin package name or the bieberkit-plugin keyword.',
      });
    if (names.has(plugin.pkg.name))
      throw new CliError(`Duplicate plugin ${plugin.pkg.name}.`, {
        code: 'BK_PLUGIN_DUPLICATE',
        fix: 'Give each first-party plugin a unique package name.',
      });
    names.add(plugin.pkg.name);
    plugins.push(plugin);
  }
  // Validate every definition and identity before any generation writes a package.
  for (const plugin of plugins) syncPluginManifest(plugin, !write);
  const index = Object.fromEntries(
    plugins
      .toSorted((a, b) => a.pkg.name.localeCompare(b.pkg.name))
      .map((plugin) => [
        plugin.pkg.name,
        {
          version: plugin.pkg.version,
          manifest: plugin.manifest,
          ...(plugin.envRows.length === 0 ? {} : { envRows: plugin.envRows }),
        },
      ]),
  );
  const target = join(root, INDEX_PATH);
  const source =
    HEADER +
    "import type { PluginIndex } from './templates.ts';\n\n" +
    `export const BUILTIN_PLUGIN_INDEX: PluginIndex = ${JSON.stringify(index, null, 2)};\n`;
  const formatted = await format(INDEX_PATH, source, { singleQuote: true, printWidth: 120 });
  if (formatted.errors.length !== 0)
    throw new CliError('Could not format the generated plugin index.', {
      code: 'BK_PLUGIN_INDEX_FORMAT',
      fix: 'Check the generated metadata and the formatter diagnostics.',
    });
  const current = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
  if (current !== formatted.code) {
    if (!write)
      throw new CliError(`${INDEX_PATH} is missing or stale.`, {
        code: 'BK_PLUGIN_INDEX_STALE',
        fix: 'Run pnpm manifests:write and review the generated index.',
      });
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, formatted.code);
  }
  return plugins.length;
}
