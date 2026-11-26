<!--
  BieberKit

  @file        packages/create/api/command.api.md
  @description API report of create-bieberkit: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: create-bieberkit

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { BkError, EnvSource } from "@bieberkit/core";
type ExitCode = 0 | 1 | 2 | 3;
declare const DOCS_BASE = "https://bieberkit.dev/docs/errors";
declare const docsLink: (code: string) => string;
interface CliErrorOptions {
  readonly code: string;
  readonly fix: string;
  readonly exit?: ExitCode;
  readonly cause?: unknown;
}
declare class CliError extends BkError {
  readonly exit: ExitCode;
  constructor(message: string, options: CliErrorOptions);
}
declare function usageError(code: string, message: string, fix: string): CliError;
interface Failure {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
  readonly docs: string;
  readonly exit: ExitCode;
  readonly problems?: readonly Readonly<Record<string, unknown>>[];
}
declare function failureOf(error: unknown): Failure;
interface FlagDef {
  readonly name: string;
  readonly type: "boolean" | "string";
  readonly description: string;
  readonly short?: string;
}
interface Positional {
  readonly name: string;
  readonly required?: boolean;
}
declare const GLOBAL_FLAGS: readonly FlagDef[];
interface ParsedArgs {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}
declare function splitCommand(argv: readonly string[], known: (flag: string) => FlagDef | undefined): string | undefined;
declare function parseArgs(argv: readonly string[], flags: readonly FlagDef[], positionals?: readonly Positional[]): ParsedArgs;
interface PromptOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}
interface TextOptions {
  readonly initial?: string;
  readonly placeholder?: string;
  readonly validate?: (value: string) => string | undefined;
}
interface Prompts {
  intro(title: string): void;
  note(text: string, title: string): void;
  outro(text: string): void;
  select<T extends string>(message: string, options: readonly PromptOption<T>[], initial: T): Promise<T>;
  multiselect<T extends string>(message: string, options: readonly PromptOption<T>[], initial: readonly T[]): Promise<T[]>;
  confirm(message: string, initial: boolean): Promise<boolean>;
  text(message: string, options?: TextOptions): Promise<string>;
  password(message: string): Promise<string>;
  task<T>(title: string, done: string, work: () => Promise<T>): Promise<T>;
}
interface CommandContext {
  readonly cwd: string;
  readonly env?: EnvSource;
  readonly args: ParsedArgs;
  readonly json: boolean;
  readonly prompts?: Prompts;
  log(line: string): void;
}
interface Outcome {
  readonly data: unknown;
  readonly text: string;
  readonly exit?: ExitCode;
}
interface Command {
  readonly name: string;
  readonly summary: string;
  readonly flags?: readonly FlagDef[];
  readonly positionals?: readonly Positional[];
  run(context: CommandContext): Promise<Outcome>;
}
export { Failure as _, Prompts as a, usageError as b, GLOBAL_FLAGS as c, parseArgs as d, splitCommand as f, ExitCode as g, DOCS_BASE as h, PromptOption as i, ParsedArgs as l, CliErrorOptions as m, CommandContext as n, TextOptions as o, CliError as p, Outcome as r, FlagDef as s, Command as t, Positional as u, docsLink as v, failureOf as y };
```
