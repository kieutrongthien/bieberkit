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
import { CliError, CliErrorOptions, Command, Command as Command$1, CommandContext, DOCS_BASE, ExitCode, Failure, FlagDef, GLOBAL_FLAGS, Io, Outcome, ParsedArgs, Positional, createRunner, docsLink, failureOf, parseArgs, usageError } from "create-bieberkit/kit";
import { EnvOwner, PluginDef, ProjectConfigInput } from "@bieberkit/core";
export declare const COMMANDS: readonly Command$1[];
export declare const runCli: ReturnType<typeof createRunner>;
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
export { CliError, type CliErrorOptions, type Command, type CommandContext, DOCS_BASE, type ExitCode, type Failure, type FlagDef, GLOBAL_FLAGS, type Io, type LoadedPlugin, type Outcome, type ParsedArgs, type Positional, type Project, docsLink, failureOf, parseArgs, usageError };
```
