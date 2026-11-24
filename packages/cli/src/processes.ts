/**
 * BieberKit
 *
 * @file        packages/cli/src/processes.ts
 * @description Runs a program of the project and waits for it, passing the signals of the terminal on to it, so that bieberkit start and bieberkit dev are the process of the server and not a wrapper that hides it (section 5.2).
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

import { spawn } from 'node:child_process';

export interface Child {
  /** The exit code of the program. A program that was killed by a signal is 1. */
  readonly exit: Promise<number>;
  kill(signal: NodeJS.Signals): void;
}

/** Starts a program in a folder. A test gives its own, so that nothing real runs. */
export type Spawn = (
  file: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly quiet?: boolean },
) => Child;

export const realSpawn: Spawn = (file, args, options) => {
  const child = spawn(file, [...args], { cwd: options.cwd, stdio: options.quiet === true ? 'ignore' : 'inherit' });
  const exit = new Promise<number>((resolve) => {
    child.once('error', () => resolve(1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
  return { exit, kill: (signal) => void child.kill(signal) };
};

/** Runs `child` until it ends, and hands SIGINT and SIGTERM that this process gets to it. */
export async function supervise(child: Child): Promise<number> {
  const pass = (signal: NodeJS.Signals) => (): void => child.kill(signal);
  const interrupt = pass('SIGINT');
  const terminate = pass('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    return await child.exit;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}
