<!--
  BieberKit

  @file        packages/create/api/index.api.md
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
import { Dialect, EnvDescription, Manifest } from "@bieberkit/core";
import { n as Command, s as ParsedArgs, t as Ask } from "./command-DqM9OTzA.js";
interface ProjectName {
  readonly name: string;
  readonly folder: string;
}
export declare function checkProjectName(value: string): ProjectName;
export declare const BUILTIN_PLUGIN_INDEX: PluginIndex;
interface Template {
  readonly name: string;
  readonly description: string;
  readonly plugins: readonly string[];
  readonly site?: boolean;
  readonly tenancy?: "single" | "shared-schema";
  readonly locales?: {
    readonly default: string;
    readonly supported: readonly string[];
  };
  readonly seeds?: string;
}
interface PluginIndexEntry {
  readonly version: string;
  readonly manifest: Manifest;
  readonly envRows?: readonly EnvDescription[];
}
type PluginIndex = Readonly<Record<string, PluginIndexEntry>>;
export declare const BUILTIN_TEMPLATES: Readonly<Record<string, Template>>;
interface Choices {
  readonly project: ProjectName;
  readonly dialect: Dialect;
  readonly template: Template;
  readonly extraPlugins: readonly string[];
  readonly admin: boolean;
  readonly site: boolean;
  readonly author: string;
  readonly license: string;
  readonly install: boolean;
  readonly git: boolean;
}
interface ChoiceDeps {
  readonly templates: Readonly<Record<string, Template>>;
  readonly ask: Ask | undefined;
  readonly gitUser: () => {
    readonly name?: string;
    readonly email?: string;
  };
}
export declare function resolveChoices(args: ParsedArgs, deps: ChoiceDeps): Promise<Choices>;
interface ProjectFile {
  readonly path: string;
  readonly content: string;
}
interface Plan {
  readonly plugins: readonly {
    readonly name: string;
    readonly version: string;
    readonly env: readonly string[];
    readonly envRows?: readonly EnvDescription[];
  }[];
  readonly year: number;
  readonly framework: string;
  readonly random: () => string;
}
export declare function renderProject(choices: Choices, plan: Plan): ProjectFile[];
interface PlanDeps {
  readonly index: PluginIndex;
  readonly framework: string;
  readonly year: number;
  readonly random: () => string;
}
interface Planned {
  readonly target: string;
  readonly plan: Plan;
  readonly files: readonly ProjectFile[];
  readonly notes: readonly string[];
}
export declare function planProject(choices: Choices, cwd: string, deps: PlanDeps): Planned;
type Exec = (file: string, args: readonly string[], cwd: string) => Promise<void>;
interface Scaffolded {
  readonly root: string;
  readonly files: number;
  readonly installed: boolean;
  readonly git: "committed" | "initialized" | "skipped" | "failed";
  readonly problems: readonly string[];
}
export declare function scaffold(choices: Choices, planned: Planned, exec?: Exec): Promise<Scaffolded>;
interface CreateDeps {
  readonly templates?: Readonly<Record<string, Template>>;
  readonly index?: PluginIndex;
  readonly exec?: Exec;
  readonly gitUser?: ChoiceDeps["gitUser"];
  readonly random?: () => string;
  readonly now?: () => Date;
  readonly framework?: string;
}
export declare function createCommand(deps?: CreateDeps): Command;
export declare function renderEnvExample(rows: readonly EnvDescription[]): string;
export declare const packageName = "create-bieberkit";
export type { Choices, CreateDeps, Exec, Plan, PlanDeps, Planned, PluginIndex, PluginIndexEntry, ProjectFile, Scaffolded, Template };
```
