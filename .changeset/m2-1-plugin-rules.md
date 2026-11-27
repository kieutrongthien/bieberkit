---
'bieberkit': minor
---

<!--
  BieberKit

  @file        .changeset/m2-1-plugin-rules.md
  @description Changeset for slice H4 of M2.1: the check rules for plugin imports and for the tables of another plugin.
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

`bieberkit check boundaries` (PLG-01) now refuses a relative path, or a path through `node_modules`, into the files of another plugin package that are not its entry, understands `exports` patterns, knows a plugin by its keyword or its static manifest, and lets a plugin import its own files. The new rule `bieberkit check plugin-tables` (PLG-02) refuses a plugin that queries a table of another plugin (`BK_PLUGIN_TABLE_QUERY`) or gives an entity of another plugin to the entity manager (`BK_PLUGIN_ENTITY_QUERY`). It is a static check that reads the plugins from their `package.json`, and it says what it cannot see.
