<!--
  BieberKit

  @file        packages/create/CHANGELOG.md
  @description Release history generated from changesets for create-bieberkit.
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

# create-bieberkit

## 0.3.0

### Minor Changes

- 93599a4: `pnpm create bieberkit` asks with arrow keys, as create-vite does: the name, the database, the template and extra plugins when there is a choice, the admin, the license, the install and git, then a summary to confirm. Writing, installing and git run under spinners. Flags, `--yes` and `--json` are unchanged. The kit's `Ask` function is replaced by a `Prompts` port, with `terminalPrompts()` and `scriptedPrompts()` for tests; `bieberkit remove` and `bieberkit backup:verify` ask through it. `@clack/prompts` is bundled into `dist`, so the install gains no package.

### Patch Changes

- b7300dc: Audit for an enterprise (AUD-07 to AUD-09). `AUDIT_LOG_MIRROR=true` copies every audit entry to the log after commit as one line with `audit: true`, through the outbox and a worker job. The entries list and the export take `after=<id>` to read oldest first, each entry once, with `meta.nextAfter` to resume. Legal holds (`POST`, `GET` and `DELETE /api/v1/audit-log/holds`, new permission `audit-log.hold`) keep entries from `bieberkit audit:prune`, which now says how many it kept. Data migration step 0.5.0 adds the table `bk_audit_holds` (ADR 0032). `pruneAuditLog` returns `kept`, and `createDatabase` takes `auditMirror`.

- 88a425e: The audit log is complete on the API side (AUD-01 to AUD-06). The entries list filters by time, action (exact or `prefix*`), entity, record, actor and request. Reads stay inside the tenant of the request. `GET .../entries/:id` returns one entry, and every entry carries its `actor`. `GET .../export?format=csv|ndjson` streams up to `AUDIT_LOG_EXPORT_MAX_ROWS` entries, escapes formula cells, sets `X-Export-Truncated` when it cuts, and is audited itself (new permission `audit-log.export`). `GET .../actions` lists the distinct actions.

  Retention: `bieberkit audit:prune --before <date>` counts first and, with `--yes`, deletes on `MIGRATE_DATABASE_URL` and writes `audit.pruned`. It runs `pruneAuditLog` from `@bieberkit/data/orm` through `pruneAudit` from `@bieberkit/server`.

  Fix: a project loaded a plugin whose short name has a dash (`audit-log`) with the env prefix `AUDIT-LOG_`, while `definePlugin` checks `AUDIT_LOG_`, so such a plugin with env keys could not boot. `@bieberkit/server` now uses `envPrefixOf`, which `@bieberkit/core` exports.

  Breaking for clients of the thin slice: the entries list takes `pageSize` in place of `limit` and answers `meta.nextCursor` in place of `nextCursor`. In a tenant it now shows that tenant's entries only.

- 1ba8b1a: Media is complete on the API side (MED-01 to MED-08). Files belong to a tenant and live at `<visibility>/<tenant>/media/<id>/<filename>`. The visibility is fixed when the record is made. `GET .../:id/url` gives a public URL, a signed URL, or on a disk that cannot sign the new `GET .../:id/content` stream. Deleting a record removes its object after commit through the outbox, and a scheduled job removes files left `pending` after `MEDIA_PENDING_TTL_HOURS`. Confirm stores a SHA-256 checksum, keeps refused uploads as `rejected` and emits `media.file.confirmed`. Files have `alt`, `description`, folders (`/api/v1/media/folders`, at most 8 deep) and tags. The list filters by name prefix, kind, folder, status, visibility, size and creation, and the size, type and tenant quota limits are checked before a signed URL is given.

  `createTestApp` takes `disk`, the options of its memory disk.

  Breaking for clients of the thin slice: the generated entity routes of `media.Media` are replaced by the plugin's own routes. Their paths stay, the body of create takes only the fields above, and `PATCH` changes metadata only. `pathOf` now takes the tenant. A refused upload is `rejected`, not `pending`.

- 31f9423: A new project starts with `pnpm dev`. The root of the project declares `@bieberkit/core`, which `bieberkit.config.ts` imports, and `@types/node`, with `types: ["node"]` in its tsconfig. The plugins are resolved from `apps/server`, where they are installed. An error of Node.js, such as a missing package, is now shown with its message instead of crashing the CLI.

- Updated dependencies [88a425e]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [7c9da65]
  - @bieberkit/core@0.3.0

## 0.2.0

### Patch Changes

- @bieberkit/core@0.2.0
