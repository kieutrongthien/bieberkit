/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/build.ts
 * @description The command bieberkit build: it regenerates everything from scratch, checks the types, and emits the standalone validators and serializers that the web role loads (section 5.2, GEN-02, SCH-06).
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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeStandalone } from '@bieberkit/data/build';
import { loadApp } from '../app.ts';
import type { Command } from '../command.ts';
import { CliError } from '../errors.ts';
import { generateFiles, writeFiles } from '../generate/files.ts';
import { realSpawn, supervise } from '../processes.ts';
import type { Spawn } from '../processes.ts';

export interface BuildDeps {
  readonly spawn?: Spawn;
}

/** Where the build leaves what the web role loads at start (SCH-06). */
export const STANDALONE_DIR = 'apps/server/dist/standalone';

export function buildCommand(deps: BuildDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  return {
    name: 'build',
    summary: 'Regenerate everything, check the types, and emit the standalone validators and serializers.',
    flags: [
      {
        name: 'typecheck',
        type: 'boolean',
        description: 'Check the types with tsc (default). --no-typecheck skips it.',
      },
    ],
    async run(context) {
      const app = await loadApp(context.cwd);
      const root = app.project.root;
      const steps: string[] = [];
      // From scratch, so that a build never depends on what a developer left on the disk (GEN-02).
      writeFiles(root, generateFiles(app));
      steps.push('generate');
      if (context.args.flags['typecheck'] !== false && existsSync(join(root, 'tsconfig.json'))) {
        context.log('tsc --noEmit');
        const code = await supervise(spawn('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: root }));
        if (code !== 0) {
          throw new CliError(`The type check failed (tsc exited with ${String(code)}).`, {
            code: 'BK_BUILD_TYPECHECK',
            fix: 'Fix the errors above. bieberkit generate refreshes .bieberkit/types if an entity changed.',
          });
        }
        steps.push('typecheck');
      }
      const standalone = await writeStandalone(app.entities, join(root, STANDALONE_DIR));
      steps.push('standalone');
      return {
        data: { steps, standalone: standalone.manifest },
        text: `Built: ${steps.join(', ')}.\n${String(standalone.manifest.entities.length)} entities have a validator and a serializer in ${STANDALONE_DIR}.`,
      };
    },
  };
}
