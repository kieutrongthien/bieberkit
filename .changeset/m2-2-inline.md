---
'@bieberkit/data': minor
'@bieberkit/http': minor
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-inline.md
  @description Changeset for the inline collections of a record: the API, the metadata and the table in the form (MOD-09, UI-11).
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

`f.hasMany(() => Line).inline()` is now part of the record in the API: the body of a create and an update takes `lines: [{ id?, ... }]`, the answer gives them, they are saved in the transaction of the record with the permissions of the line entity, and a change of them moves the version of the record. `_meta` describes the collection and the admin edits it as a table inside the form. A save of a row now drops the cached row, which showed old values when the row was opened again.
