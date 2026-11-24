#!/usr/bin/env node
/**
 * BieberKit
 *
 * @file        packages/create/src/bin.ts
 * @description The create-bieberkit executable: makes a project from its arguments and ends the process with the exit code.
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

import { createInterface } from 'node:readline/promises';
import { createCommand } from './commands/create.ts';
import { createRunner } from './kit/run.ts';
import type { Ask } from './kit/command.ts';
import { packageName } from './index.ts';

/** Asks on the terminal. A choice is a number or the word, and an empty answer is the default. */
const ask: Ask = async (question, choices, fallback) => {
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const options =
      choices === undefined
        ? ''
        : ` (${choices.map((choice) => (choice === fallback ? `${choice}*` : choice)).join(', ')})`;
    const answer = (await reader.question(`${question}${options} `)).trim();
    return answer === '' ? (fallback ?? '') : (choices?.[Number(answer) - 1] ?? answer);
  } finally {
    reader.close();
  }
};

const run = createRunner({ name: packageName, version: '0.0.0', commands: [createCommand()], single: 'create' });

process.exitCode = await run(process.argv.slice(2), {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
  cwd: process.cwd(),
  ...(process.stdin.isTTY ? { ask } : {}),
});
