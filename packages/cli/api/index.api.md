<!--
  BieberKit

  @file        packages/cli/api/index.api.md
  @description API report of bieberkit: its public surface, checked in CI and reviewed in pull requests.
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

# API report: bieberkit

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { BkError, EnvOwner, EnvSource, PluginDef, ProjectConfigInput } from "@bieberkit/core";
type ExitCode = 0 | 1 | 2 | 3;
export declare const DOCS_BASE = "https://bieberkit.dev/docs/errors";
export declare const docsLink: (code: string) => string;
interface CliErrorOptions {
  readonly code: string;
  readonly fix: string;
  readonly exit?: ExitCode;
  readonly cause?: unknown;
}
export declare class CliError extends BkError {
  readonly exit: ExitCode;
  constructor(message: string, options: CliErrorOptions);
}
export declare function usageError(code: string, message: string, fix: string): CliError;
interface Failure {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
  readonly docs: string;
  readonly exit: ExitCode;
  readonly problems?: readonly Readonly<Record<string, unknown>>[];
}
export declare function failureOf(error: unknown): Failure;
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
export declare const GLOBAL_FLAGS: readonly FlagDef[];
interface ParsedArgs {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}
export declare function parseArgs(argv: readonly string[], flags: readonly FlagDef[], positionals?: readonly Positional[]): ParsedArgs;
interface CommandContext {
  readonly cwd: string;
  readonly env?: EnvSource;
  readonly args: ParsedArgs;
  readonly json: boolean;
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
interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly cwd: string;
  readonly env?: EnvSource;
}
export declare const COMMANDS: readonly Command[];
export declare function runCli(argv: readonly string[], io: Io): Promise<ExitCode>;
export declare const CONFIG_FILE = "bieberkit.config.ts";
interface LoadedPlugin {
  readonly def: PluginDef<unknown>;
  readonly options: unknown;
}
interface Project {
  readonly root: string;
  readonly configPath: string;
  readonly config: ProjectConfigInput;
  readonly plugins: readonly LoadedPlugin[];
  readonly coreVersion: string;
}
export declare function findProjectRoot(from: string): string | undefined;
export declare function envOwnersOf(project: Pick<Project, "plugins">): EnvOwner[];
export declare function loadProject(cwd: string): Promise<Project>;
export declare const packageName = "bieberkit";
export type { CliErrorOptions, Command, CommandContext, ExitCode, Failure, FlagDef, Io, LoadedPlugin, Outcome, ParsedArgs, Positional, Project };
```
