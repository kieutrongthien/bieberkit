<!--
  BieberKit

  @file        packages/server/api/project.api.md
  @description API report of @bieberkit/server: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/server

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { EnvOwner, KeyCollector, PluginDef, ProjectConfigInput } from "@bieberkit/core";
import { ThemeInput } from "@bieberkit/tokens";
declare const COLLECTORS: readonly KeyCollector[];
declare const CONFIG_FILE = "bieberkit.config.ts";
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
declare module "@bieberkit/core" {
  interface ConfigSections {
    theme?: ThemeInput;
  }
}
declare function findProjectRoot(from: string): string | undefined;
declare function importFile(path: string): Promise<unknown>;
declare function envOwnersOf(project: Pick<Project, "plugins">): EnvOwner[];
interface ProjectConfig {
  readonly root: string;
  readonly configPath: string;
  readonly config: ProjectConfigInput;
}
declare function loadConfig(cwd: string): Promise<ProjectConfig>;
declare function loadProject(cwd: string): Promise<Project>;
export { envOwnersOf as a, loadConfig as c, ProjectConfig as i, loadProject as l, LoadedPlugin as n, findProjectRoot as o, Project as r, importFile as s, CONFIG_FILE as t, COLLECTORS as u };
```
