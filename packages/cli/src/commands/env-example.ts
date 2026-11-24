/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/env-example.ts
 * @description bieberkit env:example: writes .env.example from the merged env schema, the same bytes each time (section 5.2, CFG-06, GEN-03).
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreEnv, describeEnv, mergeEnv } from '@bieberkit/core';
import type { EnvDescription } from '@bieberkit/core';
import { renderEnvExample } from 'create-bieberkit';
import type { Command } from '../command.ts';
import { envOwnersOf, loadProject } from '../project.ts';
import type { Project } from '../project.ts';

/** The rows and the text of `.env.example` for the project as it is now: core first, then the plugins in boot order. */
export function envExampleOf(project: Pick<Project, 'plugins'>): { rows: readonly EnvDescription[]; text: string } {
  const rows = describeEnv(mergeEnv([{ name: 'core', schema: coreEnv }, ...envOwnersOf(project)]));
  return { rows, text: renderEnvExample(rows) };
}

export const envExampleCommand: Command = {
  name: 'env:example',
  summary: 'Print .env.example, or write it with --write, or check that it is up to date with --check.',
  flags: [
    { name: 'write', type: 'boolean', description: 'Write .env.example in the project.' },
    {
      name: 'check',
      type: 'boolean',
      description: 'Exit with 3 when .env.example is not what the schema gives (GEN-01).',
    },
  ],
  async run(context) {
    const project = await loadProject(context.cwd);
    const { rows, text } = envExampleOf(project);
    const path = join(project.root, '.env.example');
    const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (context.args.flags['write'] === true) {
      if (current !== text) writeFileSync(path, text);
      return {
        data: { path, keys: rows.length, changed: current !== text },
        text: `${current === text ? 'Unchanged' : 'Wrote'} ${path}`,
      };
    }
    if (context.args.flags['check'] === true) {
      const stale = current !== text;
      return {
        data: { path, upToDate: !stale },
        text: stale
          ? `${path} is ${current === undefined ? 'missing' : 'out of date'}. Run: bieberkit env:example --write`
          : `${path} is up to date.`,
        exit: stale ? 3 : 0,
      };
    }
    return { data: { keys: rows.length, text }, text: text.trimEnd() };
  },
};
