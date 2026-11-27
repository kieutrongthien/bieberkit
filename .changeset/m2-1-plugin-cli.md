---
'bieberkit': minor
---

<!--
  BieberKit

  @file        .changeset/m2-1-plugin-cli.md
  @description Changeset for slice H3 of M2.1: the plugin graph, make:plugin and a safer remove.
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

`bieberkit plugins` shows the dependency graph: each plugin with what it requires (and the range), what requires it, and the tables and routes that it owns, and `--json` adds the edges. The new `bieberkit make:plugin <name>` makes a plugin package with an entity, its permissions, a test and its static manifest, which passes `bieberkit build --check` as it is. `bieberkit remove` reads what the plugin owns from its manifest, and a failing pnpm or a cancelled question now leaves the config, the example and the migrations as they were.
