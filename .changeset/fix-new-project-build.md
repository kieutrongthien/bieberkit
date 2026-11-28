---
'create-bieberkit': patch
'bieberkit': patch
---

<!--
  BieberKit

  @file        .changeset/fix-new-project-build.md
  @description Changeset for the fixes that let a new project run its migrations and pass its type check.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
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

A new project builds and migrates again:

- `bieberkit.config.ts` of a new project, and the module of `make:module`, declare the type of their default export, which `isolatedDeclarations` asks for (`TS9037`).
- The generated client no longer names `RequestCredentials`, a type of the DOM that a project of a server does not load.
- The root of a new project declares `@bieberkit/data`, which its migrations import. Without it `bieberkit migrate` failed with `Cannot find package '@bieberkit/data'`.

A project that exists adds `@bieberkit/data` to the `devDependencies` of its root, and in `bieberkit.config.ts` writes `const config: ProjectConfigInput = defineConfig({ ... }); export default config;`.
