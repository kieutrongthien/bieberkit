---
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
'@bieberkit/server': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-reports.md
  @description Changeset for the errors and the Core Web Vitals that the admin sends to the server (UI-21).
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

The admin sends the errors that nothing caught, and the Core Web Vitals of a sample of the visits, to the new public route `POST /api/v1/_client-reports`. The server hands an error to the error reporter as a warning of the source `client` and counts a vital in the metrics. The report has no email, no long number and no id of a record.
