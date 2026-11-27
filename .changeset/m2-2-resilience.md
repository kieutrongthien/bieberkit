---
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-resilience.md
  @description Changeset for the resilience slice of M2.2: retries, offline banner, error boundaries, lazy screens, drafts, the unsaved guard and the 412 view.
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

The admin keeps working when things go wrong. `@bieberkit/admin-core` exports the retry policy and backoff, the offline state, the detection of a missing chunk, dirty tracking, local drafts, the three-way merge of a conflict, the keyboard shortcuts and the builders of error and web-vital reports; `AdminApiError` carries the `current` row of a 412. `@bieberkit/admin-antd` loads each screen as its own chunk, has an error boundary for each route, an offline banner, an unsaved-change guard, a local draft of each form, Ctrl/Cmd+S, and a conflict view that shows who changed the row and which fields differ. `pnpm check:admin-size` measures the initial JavaScript against 400 kB.
