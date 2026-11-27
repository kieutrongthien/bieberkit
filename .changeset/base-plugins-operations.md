---
'@bieberkit/plugin-settings': minor
'@bieberkit/plugin-media': minor
'@bieberkit/plugin-users': minor
'@bieberkit/plugin-roles': minor
'@bieberkit/plugin-notifications': minor
'@bieberkit/plugin-audit-log': minor
'@bieberkit/http': minor
'@bieberkit/auth': minor
'@bieberkit/data': minor
'@bieberkit/testing': minor
---

<!--
  BieberKit

  @file        .changeset/base-plugins-operations.md
  @description Changeset for the operations part of slice S6 of the base plugins: idempotent mail and delete routes, per-actor limits, settings export and import, media download audit, indexes and plan tests.
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

Operations for an enterprise (OPS-01 to OPS-06). The mail and delete routes of the base plugins honor `Idempotency-Key`; a `DELETE` route may now be `idempotent`, and a 204 is replayed. Invitations and the audit export are limited per person (`limitActor`, `AUTH_ACTION_LIMITED`). `GET /api/v1/settings/export` and `POST /api/v1/settings/import?dryRun=true` carry settings between environments, with secrets left out. `MEDIA_AUDIT_DOWNLOADS=true` audits the reading of private files. New indexes keep the lists of users and of the audit log off full scans (data step 0.5.0, auth migration 0.7.0), and `@bieberkit/testing` exports `planOf`, `fullScans` and `analyze` for tests of a query plan. The lists of users, media and the audit log are tested at 100 000 rows on the three dialects.
