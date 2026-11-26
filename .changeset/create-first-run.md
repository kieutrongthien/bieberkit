---
'create-bieberkit': patch
'@bieberkit/server': patch
---

<!--
  BieberKit

  @file        .changeset/create-first-run.md
  @description Changeset for the fixes that make a project from create-bieberkit start with pnpm dev.
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

A new project starts with `pnpm dev`. The root of the project declares `@bieberkit/core`, which `bieberkit.config.ts` imports, and `@types/node`, with `types: ["node"]` in its tsconfig. The plugins are resolved from `apps/server`, where they are installed. An error of Node.js, such as a missing package, is now shown with its message instead of crashing the CLI.
