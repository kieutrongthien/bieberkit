<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-27-base-plugins-s5-audit-log.md
  @description Implementation plan for slice S5 of the complete base plugins: audit-log filters, one entry with its actor, export, actions, tenant reads and the audit:prune command.
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

# M1.11 slice S5: audit-log and audit:prune (AUD-01..06)

## Context

S1 to S4 are in local `main` (1ba8b1a). S5 has no gate. Today `plugins/audit-log` is one route, `GET /api/v1/audit-log/entries`, with four exact filters, `limit` and a bare `nextCursor`, and no tenant filter. Nothing deletes audit rows: the application role has INSERT and SELECT only on PostgreSQL and MySQL, and triggers refuse UPDATE and DELETE on SQLite (DATA-25). The design is `docs/modules/base-plugins-complete.md`, section `audit-log`.

## Decisions (builder's, per "Left to the builder")

- **Page shape (BPL-06)**: the list takes `pageSize` (clamped to 100, DATA-06), `cursor` and `withTotal`, and answers `{ data, meta: { pageSize, nextCursor, total? } }`, like the other base plugins. `limit` and the top-level `nextCursor` go: no client reads them yet.
- **AUD-01**: `from` and `to` compare `at` (the index is `tenant_id, at`); `action` is exact, or a prefix when it ends in `*` (LIKE with the `!` escape, as the users list); `entity`, `recordId`, `actorId`, `requestId` are exact. Newest first by the UUIDv7 id.
- **AUD-02**: `GET /entries/:id`; `actor` is `{ id, name, email }` from `bk_auth_users`, read in one query for a page, or `null` for the system. An unknown id, or one of another tenant, is `AUDIT_NOT_FOUND` (404).
- **AUD-03**: `GET /export?format=csv|ndjson` streams pages of 500 by keyset. Before the first byte it looks for a row after `AUDIT_LOG_EXPORT_MAX_ROWS` (default 100 000); when there is one, the answer carries `X-Export-Truncated: true` and stops at the limit. CSV cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'` (IO-04). The export writes `audit-log.entries.exported` (format, filters) in its own transaction before it streams. Permission `audit-log.export`.
- **AUD-04**: `GET /actions` returns the distinct actions in order, through `cache.remember` for 60 s, keyed by the tenant (or `all`).
- **AUD-05**: in a tenant, every read filters `tenant_id`; without a tenant or in the nil tenant, a reader sees every tenant (as SET-04 and the users list).
- **AUD-06**: `pruneAuditLog(db, { before, apply })` in `@bieberkit/data/orm` counts the rows with `at < before`; with `apply` it deletes them and writes `audit.pruned` (`before`, `count`) in one transaction, lifting the SQLite delete trigger inside that transaction. `@bieberkit/server` opens the database on `MIGRATE_DATABASE_URL` for it, and `bieberkit audit:prune --before <date>` prints the count and deletes only with `--yes`. Legal holds are S6 (AUD-09).
- Indexes for the other filters at 100 000 rows are OPS-05, in S6.

## Tasks

1. Tests first: the plugin cases under `describeDialects`, `pruneAuditLog` on three dialects, and the CLI command on SQLite.
2. Data: `pruneAuditLog`. Server: `pruneAudit`. CLI: `audit:prune`.
3. Plugin: routes, CSV, env key `AUDIT_LOG_EXPORT_MAX_ROWS`, permission `audit-log.export`, scaffolder index.
4. Docs: spec section 12.6, module spec, `docs/modules/plugins.md`, CLI section 5.2, changeset, roadmap. Then the full battery.
