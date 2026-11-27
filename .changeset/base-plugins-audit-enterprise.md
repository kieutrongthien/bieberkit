---
'@bieberkit/plugin-audit-log': minor
'@bieberkit/data': minor
'@bieberkit/server': minor
'@bieberkit/testing': minor
'bieberkit': minor
'create-bieberkit': patch
---

<!--
  BieberKit

  @file        .changeset/base-plugins-audit-enterprise.md
  @description Changeset for the audit part of slice S6 of the base plugins: the audit mirror, the resume cursor for a SIEM and legal holds.
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

Audit for an enterprise (AUD-07 to AUD-09). `AUDIT_LOG_MIRROR=true` copies every audit entry to the log after commit as one line with `audit: true`, through the outbox and a worker job. The entries list and the export take `after=<id>` to read oldest first, each entry once, with `meta.nextAfter` to resume. Legal holds (`POST`, `GET` and `DELETE /api/v1/audit-log/holds`, new permission `audit-log.hold`) keep entries from `bieberkit audit:prune`, which now says how many it kept. Data migration step 0.5.0 adds the table `bk_audit_holds` (ADR 0032). `pruneAuditLog` returns `kept`, and `createDatabase` takes `auditMirror`.
