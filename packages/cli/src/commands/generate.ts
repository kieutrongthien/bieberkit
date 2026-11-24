/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/generate.ts
 * @description bieberkit generate and client:generate: write the generated files of the project, or check that the committed ones are current (section 5.4, GEN-01 to GEN-03).
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

import { loadApp } from '../app.ts';
import type { Command } from '../command.ts';
import { clientFiles, generateFiles, staleFiles, writeFiles } from '../generate/files.ts';
import type { GeneratedFile } from '../generate/files.ts';

function generator(name: string, summary: string, pick: (files: GeneratedFile[]) => GeneratedFile[]): Command {
  return {
    name,
    summary,
    flags: [
      {
        name: 'check',
        type: 'boolean',
        description: 'Write nothing, and exit with 3 when a file is missing or stale.',
      },
    ],
    async run(context) {
      const app = await loadApp(context.cwd);
      const files = pick(generateFiles(app));
      const root = app.project.root;
      if (context.args.flags['check'] === true) {
        const stale = staleFiles(root, files);
        return {
          data: { stale, files: files.length },
          text:
            stale.length === 0
              ? `${files.length} generated files are up to date.`
              : `Stale:\n${stale.map((path) => `  ${path}`).join('\n')}\nRun: bieberkit ${name}`,
          exit: stale.length === 0 ? 0 : 3,
        };
      }
      const result = writeFiles(root, files);
      return {
        data: result,
        text: `Wrote ${result.written.length} files, ${result.unchanged.length} were already current.${result.written.map((path) => `\n  ${path}`).join('')}`,
      };
    },
  };
}

export const generateCommand: Command = generator(
  'generate',
  'Write everything that is generated: .bieberkit/ and packages/client.',
  (files) => files,
);
export const clientGenerateCommand: Command = generator(
  'client:generate',
  'Write the typed client in packages/client.',
  clientFiles,
);
