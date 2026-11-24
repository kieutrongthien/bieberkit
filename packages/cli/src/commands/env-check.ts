/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/env-check.ts
 * @description bieberkit env:check: validates the environment against the merged schema of core and the plugins (section 5.2, CFG-02).
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

import { join } from 'node:path';
import { loadEnv } from '@bieberkit/core';
import type { Command } from '../command.ts';
import { envOwnersOf, loadProject } from '../project.ts';

export const envCheckCommand: Command = {
  name: 'env:check',
  summary: 'Check the environment against the schema of core and the plugins.',
  async run(context) {
    const project = await loadProject(context.cwd);
    // A key that is missing or wrong throws `EnvValidationError`, with every problem together.
    const loaded = loadEnv({
      ...(context.env === undefined ? {} : { source: context.env }),
      envFile: join(project.root, '.env'),
      extra: envOwnersOf(project),
    });
    const keys = Object.keys(loaded.env).length + Object.keys(loaded.extra).length;
    return {
      data: { valid: true, keys, warnings: loaded.warnings },
      text: [
        `The environment is valid (${keys} keys).`,
        ...loaded.warnings.map((warning) => `warning: ${warning}`),
      ].join('\n'),
    };
  },
};
