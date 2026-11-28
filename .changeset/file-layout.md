---
'bieberkit': patch
'create-bieberkit': patch
'@bieberkit/plugin-users': patch
'@bieberkit/plugin-roles': patch
'@bieberkit/plugin-media': patch
'@bieberkit/plugin-notifications': patch
'@bieberkit/plugin-settings': patch
'@bieberkit/plugin-audit-log': patch
'@bieberkit/admin-antd': patch
---

<!--
  BieberKit

  @file        .changeset/file-layout.md
  @description Changeset for the layout of the files of modules, plugins and the admin shell (MOD-19).
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

Every file of a module and of a plugin is now in the folder of its kind (`entities/`, `services/`, `routes/`, `jobs/`, `events/`, and in `admin/` the folders `pages/`, `tabs/`, `fields/`, `components/`, `lib/`, `messages/`). The base plugins and the shell of the admin were reorganized with no change of their public API.

- `bieberkit check layout` warns about a file of a module or a plugin that is out of place. It does not fail the check.
- `make:plugin` writes the new layout, and the `AGENTS.md` of a new project says it.
