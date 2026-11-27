/**
 * BieberKit
 *
 * @file        packages/cli/src/check/plugin-tables.repo.test.ts
 * @description The first-party plugins of this repository pass the rule that a plugin does not query the tables or the entities of another plugin (PLG-02).
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

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readProject } from './files.ts';
import { pluginOf, readJson } from './plugin-info.ts';
import type { PluginInfo } from './plugin-info.ts';
import { isCode } from './rule.ts';
import { tableFindings } from './rules/plugin-tables.ts';

const PLUGINS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'plugins');

const folders = readdirSync(PLUGINS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

const infos: PluginInfo[] = folders.flatMap((folder) => {
  const json = readJson(join(PLUGINS, folder, 'package.json'));
  const info = json === undefined ? undefined : pluginOf(json, `plugins/${folder}`);
  return info === undefined ? [] : [info];
});

describe('PLG-02 the first-party plugins', () => {
  it('PLG-02 every first-party plugin has a manifest, so the rule knows its tables', () => {
    expect(infos.map((info) => info.name)).toEqual(folders.map((folder) => `@bieberkit/plugin-${folder}`));
  });

  it.each(folders)('PLG-02 %s queries no table and no entity of another first-party plugin', (folder) => {
    const own = `@bieberkit/plugin-${folder}`;
    const others = infos.filter((info) => info.name !== own);
    const files = readProject(join(PLUGINS, folder)).filter(isCode);
    const found = files.flatMap((file) =>
      tableFindings(file, others).map((finding) => `${file.path}:${finding.line} ${finding.message}`),
    );
    expect(found).toEqual([]);
  });
});
