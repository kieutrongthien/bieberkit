/**
 * BieberKit
 *
 * @file        tools/plugin-manifests.ts
 * @description Runs deterministic first-party plugin manifest generation or read-only verification (PLG-07).
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

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BkError } from '../packages/core/src/index.ts';
import { CliError } from '../packages/cli/src/errors.ts';
import { inspectPluginPackage, syncPluginManifest } from '../packages/cli/src/plugin-manifest.ts';
import { syncFirstPartyManifests } from './lib/plugin-manifests.ts';

const args = process.argv.slice(2);
try {
  const write = args.includes('--write');
  const pluginFlag = args.indexOf('--plugin');
  if (pluginFlag >= 0) {
    const path = args[pluginFlag + 1];
    if (path === undefined || path.startsWith('--'))
      throw new CliError('--plugin needs a package directory.', {
        code: 'BK_PLUGIN_PACKAGE',
        fix: 'Pass --plugin <directory>.',
      });
    const plugin = await inspectPluginPackage(resolve(path));
    if (plugin === undefined)
      throw new CliError(`${path} is not a plugin package.`, {
        code: 'BK_PLUGIN_PACKAGE',
        fix: 'Use the plugin package name or the bieberkit-plugin keyword.',
      });
    syncPluginManifest(plugin, !write);
    console.log(`${write ? 'Generated' : 'Checked'} ${plugin.pkg.name}.`);
  } else {
    const rootFlag = args.indexOf('--root');
    const rootArg = rootFlag < 0 ? undefined : args[rootFlag + 1];
    if (rootFlag >= 0 && (rootArg === undefined || rootArg.startsWith('--')))
      throw new CliError('--root needs a directory.', {
        code: 'BK_PLUGIN_PACKAGE',
        fix: 'Pass --root <repository directory>.',
      });
    const root = rootArg === undefined ? fileURLToPath(new URL('..', import.meta.url)) : resolve(rootArg);
    const count = await syncFirstPartyManifests(root, write);
    console.log(`${write ? 'Generated' : 'Checked'} ${String(count)} plugin manifests and the bundled index.`);
  }
} catch (error) {
  console.error(error instanceof BkError ? `${error.code}: ${error.message} ${error.fix}` : error);
  process.exitCode = 1;
}
