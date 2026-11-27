<!--
  BieberKit

  @file        plugins/audit-log/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/plugin-audit-log.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm changeset version (license header normalized)
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

# @bieberkit/plugin-audit-log

## 0.3.0

### Minor Changes

- b7300dc: Audit for an enterprise (AUD-07 to AUD-09). `AUDIT_LOG_MIRROR=true` copies every audit entry to the log after commit as one line with `audit: true`, through the outbox and a worker job. The entries list and the export take `after=<id>` to read oldest first, each entry once, with `meta.nextAfter` to resume. Legal holds (`POST`, `GET` and `DELETE /api/v1/audit-log/holds`, new permission `audit-log.hold`) keep entries from `bieberkit audit:prune`, which now says how many it kept. Data migration step 0.5.0 adds the table `bk_audit_holds` (ADR 0032). `pruneAuditLog` returns `kept`, and `createDatabase` takes `auditMirror`.

- 88a425e: The audit log is complete on the API side (AUD-01 to AUD-06). The entries list filters by time, action (exact or `prefix*`), entity, record, actor and request. Reads stay inside the tenant of the request. `GET .../entries/:id` returns one entry, and every entry carries its `actor`. `GET .../export?format=csv|ndjson` streams up to `AUDIT_LOG_EXPORT_MAX_ROWS` entries, escapes formula cells, sets `X-Export-Truncated` when it cuts, and is audited itself (new permission `audit-log.export`). `GET .../actions` lists the distinct actions.

  Retention: `bieberkit audit:prune --before <date>` counts first and, with `--yes`, deletes on `MIGRATE_DATABASE_URL` and writes `audit.pruned`. It runs `pruneAuditLog` from `@bieberkit/data/orm` through `pruneAudit` from `@bieberkit/server`.

  Fix: a project loaded a plugin whose short name has a dash (`audit-log`) with the env prefix `AUDIT-LOG_`, while `definePlugin` checks `AUDIT_LOG_`, so such a plugin with env keys could not boot. `@bieberkit/server` now uses `envPrefixOf`, which `@bieberkit/core` exports.

  Breaking for clients of the thin slice: the entries list takes `pageSize` in place of `limit` and answers `meta.nextCursor` in place of `nextCursor`. In a tenant it now shows that tenant's entries only.

- 34f5f66: Operations for an enterprise (OPS-01 to OPS-06). The mail and delete routes of the base plugins honor `Idempotency-Key`; a `DELETE` route may now be `idempotent`, and a 204 is replayed. Invitations and the audit export are limited per person (`limitActor`, `AUTH_ACTION_LIMITED`). `GET /api/v1/settings/export` and `POST /api/v1/settings/import?dryRun=true` carry settings between environments, with secrets left out. `MEDIA_AUDIT_DOWNLOADS=true` audits the reading of private files. New indexes keep the lists of users and of the audit log off full scans (data step 0.5.0, auth migration 0.7.0), and `@bieberkit/testing` exports `planOf`, `fullScans` and `analyze` for tests of a query plan. The lists of users, media and the audit log are tested at 100 000 rows on the three dialects.

### Patch Changes

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
- Updated dependencies [c90bf7e]
- Updated dependencies [34f5f66]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [210b082]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [7c9da65]
- Updated dependencies [301f5ab]
- Updated dependencies [28782a9]
- Updated dependencies [3bdd7f9]
- Updated dependencies [a0c784c]
- Updated dependencies [1aa0d82]
- Updated dependencies [0089e52]
  - @bieberkit/data@0.3.0
  - @bieberkit/core@0.3.0
  - @bieberkit/queue@0.3.0
  - @bieberkit/http@0.3.0
  - @bieberkit/auth@0.3.0
  - @bieberkit/cache@0.3.0

## 0.2.0

### Patch Changes

- @bieberkit/http@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
