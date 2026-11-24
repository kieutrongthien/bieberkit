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
import { _ as failureOf, a as FlagDef, c as Positional, d as CliError, f as CliErrorOptions, g as docsLink, h as Failure, i as Outcome, l as parseArgs, m as ExitCode, n as Command, o as GLOBAL_FLAGS, p as DOCS_BASE, r as CommandContext, s as ParsedArgs, t as Ask, u as splitCommand, v as usageError } from "./command-DlY-Q08B.js";
interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly cwd: string;
  readonly env?: EnvSource;
  readonly ask?: Ask;
}
interface RunnerOptions {
  readonly name: string;
  readonly version: string;
  readonly commands: readonly Command[];
  readonly single?: string;
}
export declare function createRunner(options: RunnerOptions): (argv: readonly string[], io: Io) => Promise<ExitCode>;
export { type Ask, CliError, type CliErrorOptions, type Command, type CommandContext, DOCS_BASE, type ExitCode, type Failure, type FlagDef, GLOBAL_FLAGS, type Io, type Outcome, type ParsedArgs, type Positional, type RunnerOptions, docsLink, failureOf, parseArgs, splitCommand, usageError };
```
