/**
 * BieberKit
 *
 * @file        packages/create/src/kit/command.ts
 * @description The shape of a command: what it takes, and what it answers for the human and for the machine.
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

import type { EnvSource } from '@bieberkit/core';
import type { ExitCode } from './errors.ts';
import type { FlagDef, ParsedArgs, Positional } from './args.ts';

/** Asks `question`, with the choices to pick from when there are some, and answers the choice, or `fallback` for an empty answer. */
export type Ask = (question: string, choices?: readonly string[], fallback?: string) => Promise<string>;

/** What a command is given. */
export interface CommandContext {
  readonly cwd: string;
  /** Set by a test. Without it, a command reads the real environment through core. */
  readonly env?: EnvSource;
  readonly args: ParsedArgs;
  readonly json: boolean;
  /** Asks the person a question and answers what they chose. Set only when a person is at the terminal and `--yes` was not given. */
  readonly ask?: Ask;
  /** A line of progress. It goes to stderr, so that stdout stays the answer (section 5.3). */
  log(line: string): void;
}

/** What a command answers. `data` is the document of `--json`, and `text` is what a person reads. */
export interface Outcome {
  readonly data: unknown;
  readonly text: string;
  /** `3` when a check found violations. Defaults to `0`. A command that fails throws. */
  readonly exit?: ExitCode;
}

export interface Command {
  readonly name: string;
  readonly summary: string;
  readonly flags?: readonly FlagDef[];
  readonly positionals?: readonly Positional[];
  run(context: CommandContext): Promise<Outcome>;
}
