/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/run.ts
 * @description Writes the project, installs its packages and makes the first commit (section 6, steps 6 to 12).
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

import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { Choices } from './choices.ts';
import type { Planned } from './plan.ts';

const run = promisify(execFile);

/** Runs a program in a folder. A test gives its own, so that nothing is installed and nothing is committed by accident. */
export type Exec = (file: string, args: readonly string[], cwd: string) => Promise<void>;

export const realExec: Exec = async (file, args, cwd) => {
  await run(file, [...args], { cwd });
};

export interface Scaffolded {
  readonly root: string;
  readonly files: number;
  readonly installed: boolean;
  readonly git: 'committed' | 'initialized' | 'skipped' | 'failed';
  readonly problems: readonly string[];
}

/** Writes every file, or none: a write that fails removes what this run made. */
function write(planned: Planned): void {
  const made: string[] = [];
  try {
    for (const file of planned.files) {
      const path = join(planned.target, file.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.content);
      made.push(path);
    }
  } catch (error) {
    for (const path of made) rmSync(path, { force: true });
    throw error;
  }
}

/**
 * Steps 6 to 11 of section 6: write the files, install, and make the first commit. The install and the git steps report what went
 * wrong and do not undo the files, because the project is made and the person can run the step by hand.
 */
export async function scaffold(choices: Choices, planned: Planned, exec: Exec = realExec): Promise<Scaffolded> {
  write(planned);
  const problems: string[] = [];
  let installed = false;
  if (choices.install) {
    try {
      await exec('pnpm', ['install'], planned.target);
      installed = true;
    } catch (error) {
      problems.push(
        `pnpm install failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}. Run it in the folder of the project.`,
      );
    }
  }
  let git: Scaffolded['git'] = 'skipped';
  if (choices.git) {
    const name = choices.author.replace(/\s*<[^>]*>\s*$/, '');
    const email = /<([^>]*)>/.exec(choices.author)?.[1] ?? '';
    try {
      await exec('git', ['init', '-b', 'main'], planned.target);
      git = 'initialized';
      await exec('git', ['add', '-A'], planned.target);
      // The author of the project signs the first commit, so that it works on a machine with no git identity.
      await exec(
        'git',
        [
          '-c',
          `user.name=${name}`,
          '-c',
          `user.email=${email}`,
          'commit',
          '-q',
          '-m',
          'chore: initial commit from create-bieberkit',
        ],
        planned.target,
      );
      git = 'committed';
    } catch (error) {
      git = git === 'initialized' ? 'initialized' : 'failed';
      problems.push(`git: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }
  return { root: planned.target, files: planned.files.length, installed, git, problems };
}
