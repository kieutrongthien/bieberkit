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
type Ask = (question: string, choices?: readonly string[], fallback?: string) => Promise<string>;
interface CommandContext {
  readonly cwd: string;
  readonly env?: EnvSource;
  readonly args: ParsedArgs;
  readonly json: boolean;
  readonly ask?: Ask;
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
export { failureOf as _, FlagDef as a, Positional as c, CliError as d, CliErrorOptions as f, docsLink as g, Failure as h, Outcome as i, parseArgs as l, ExitCode as m, Command as n, GLOBAL_FLAGS as o, DOCS_BASE as p, CommandContext as r, ParsedArgs as s, Ask as t, splitCommand as u, usageError as v };
```
