---
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-detail.md
  @description Changeset for the tabs of a detail screen: child tables, the fields that the server fills, the moves of the row, and the history (UI-03, UI-11).
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

A row that is opened has tabs: its form with the fields that the server fills and its moves, a child table for each entity that points at it (with a button for a new row that starts pointing at it), and its history from the audit log. `relatedOf`, `relatedFilter`, `prefillOf`, `readOnlyOf`, `historyOf` and `client.history` are in `@bieberkit/admin-core`.
