---
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-lists.md
  @description Changeset for the filters, saved views, bulk delete and CSV export of the generic list (UI-03).
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

The generic list filters by the fields that the metadata marks `filterable`, with the operators that the API takes for each kind, and checks a filter before it sends it. Filters and sort live in the address, so a link opens the same list. A person keeps named views in the browser (per user and entity, at most 20). Rows can be selected and deleted in one bulk call (`client.bulk`, with the outcome of each row), and the list exports to CSV with formula escaping (IO-04), up to 10,000 rows.
