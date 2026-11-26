<!--
  BieberKit

  @file        packages/create/api/kit.api.md
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
import { EnvSource } from "@bieberkit/core";
import { _ as Failure, a as Prompts, b as usageError, c as GLOBAL_FLAGS, d as parseArgs, f as splitCommand, g as ExitCode, h as DOCS_BASE, i as PromptOption, l as ParsedArgs, m as CliErrorOptions, n as CommandContext, o as TextOptions, p as CliError, r as Outcome, s as FlagDef, t as Command, u as Positional, v as docsLink, y as failureOf } from "./command-DZJ0Ew2X.js";
export declare const CANCEL: unique symbol;
type ScriptedAnswer = string | boolean | readonly string[] | typeof CANCEL;
interface ScriptedPrompts extends Prompts {
  readonly asked: string[];
  readonly shown: string[];
  readonly notes: Record<string, string>;
}
export declare function scriptedPrompts(answers: readonly ScriptedAnswer[]): ScriptedPrompts;
export declare function terminalPrompts(): Prompts;
interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly cwd: string;
  readonly env?: EnvSource;
  readonly prompts?: Prompts;
}
interface RunnerOptions {
  readonly name: string;
  readonly version: string;
  readonly commands: readonly Command[];
  readonly single?: string;
}
export declare function createRunner(options: RunnerOptions): (argv: readonly string[], io: Io) => Promise<ExitCode>;
export { CliError, type CliErrorOptions, type Command, type CommandContext, DOCS_BASE, type ExitCode, type Failure, type FlagDef, GLOBAL_FLAGS, type Io, type Outcome, type ParsedArgs, type Positional, type PromptOption, type Prompts, type RunnerOptions, type ScriptedAnswer, type ScriptedPrompts, type TextOptions, docsLink, failureOf, parseArgs, splitCommand, usageError };
```
