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

/** One choice of a select or a multiselect: its value, what the person reads, and a hint beside it. */
export interface PromptOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

export interface TextOptions {
  readonly initial?: string;
  readonly placeholder?: string;
  /** Answers the problem to show, or undefined when the value is good. */
  readonly validate?: (value: string) => string | undefined;
}

/**
 * How a command talks to a person at the terminal (ADR 0029). A cancel (Ctrl+C or Esc) throws `BK_CANCELLED`. Everything is written to
 * stderr, so that stdout stays the answer of the command.
 */
export interface Prompts {
  intro(title: string): void;
  note(text: string, title: string): void;
  outro(text: string): void;
  select<T extends string>(message: string, options: readonly PromptOption<T>[], initial: T): Promise<T>;
  multiselect<T extends string>(
    message: string,
    options: readonly PromptOption<T>[],
    initial: readonly T[],
  ): Promise<T[]>;
  confirm(message: string, initial: boolean): Promise<boolean>;
  text(message: string, options?: TextOptions): Promise<string>;
  password(message: string): Promise<string>;
  /** Runs `work` under a spinner: `title` while it runs, `done` or the first line of its error when it ends. An error is thrown again. */
  task<T>(title: string, done: string, work: () => Promise<T>): Promise<T>;
}

/** What a command is given. */
export interface CommandContext {
  readonly cwd: string;
  /** Set by a test. Without it, a command reads the real environment through core. */
  readonly env?: EnvSource;
  readonly args: ParsedArgs;
  readonly json: boolean;
  /** Asks the person. Set only when a person is at the terminal and neither `--yes` nor `--json` was given. */
  readonly prompts?: Prompts;
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
