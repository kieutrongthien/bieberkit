---
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
'@bieberkit/http': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-moves.md
  @description Changeset for the moves of the state field, the bulk change, the optimistic update, the form check, and the input of a transition in the metadata (UI-03, UI-13).
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

A row of a list shows the moves of its state field as buttons, and a move that asks for something opens a form made from the JSON Schema of its input, which `/api/v1/_meta` now sends for each transition. Selected rows can take one move or one value for a field in a single bulk call. A move shows in the list before the server answers and is taken back when it is refused. A form refuses a value that the schema of its field would refuse. `admin.list` and `admin.title` may name a relation by its field name, and `_meta` gives the key that the API sends (`owner` is `ownerId`).
