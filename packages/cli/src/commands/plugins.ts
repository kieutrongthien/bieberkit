/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/plugins.ts
 * @description bieberkit plugins: the installed plugins in boot order, with their versions and what they require (section 5.2).
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

import type { Command } from '../command.ts';
import { loadProject } from '../project.ts';

export const pluginsCommand: Command = {
  name: 'plugins',
  summary: 'List the installed plugins, their versions and what they require.',
  async run(context) {
    const project = await loadProject(context.cwd);
    const plugins = project.plugins.map(({ def }) => ({
      name: def.name,
      version: def.version,
      core: def.core,
      dialects: def.dialects,
      requires: def.requires,
      conflicts: def.conflicts,
      permissions: def.permissions,
    }));
    const lines = plugins.map((plugin) => {
      const requires = Object.keys(plugin.requires);
      return `${plugin.name}@${plugin.version}${requires.length === 0 ? '' : `  requires ${requires.join(', ')}`}`;
    });
    return {
      data: { order: plugins.map((plugin) => plugin.name), plugins },
      text:
        plugins.length === 0
          ? 'No plugins are installed.'
          : `Boot order:\n${lines.map((line) => `  ${line}`).join('\n')}`,
    };
  },
};
