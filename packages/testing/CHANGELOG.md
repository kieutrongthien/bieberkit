<!--
  BieberKit

  @file        packages/testing/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/testing.
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

# @bieberkit/testing

## 0.3.0

### Minor Changes

- b7300dc: Audit for an enterprise (AUD-07 to AUD-09). `AUDIT_LOG_MIRROR=true` copies every audit entry to the log after commit as one line with `audit: true`, through the outbox and a worker job. The entries list and the export take `after=<id>` to read oldest first, each entry once, with `meta.nextAfter` to resume. Legal holds (`POST`, `GET` and `DELETE /api/v1/audit-log/holds`, new permission `audit-log.hold`) keep entries from `bieberkit audit:prune`, which now says how many it kept. Data migration step 0.5.0 adds the table `bk_audit_holds` (ADR 0032). `pruneAuditLog` returns `kept`, and `createDatabase` takes `auditMirror`.

- 1ba8b1a: Media is complete on the API side (MED-01 to MED-08). Files belong to a tenant and live at `<visibility>/<tenant>/media/<id>/<filename>`. The visibility is fixed when the record is made. `GET .../:id/url` gives a public URL, a signed URL, or on a disk that cannot sign the new `GET .../:id/content` stream. Deleting a record removes its object after commit through the outbox, and a scheduled job removes files left `pending` after `MEDIA_PENDING_TTL_HOURS`. Confirm stores a SHA-256 checksum, keeps refused uploads as `rejected` and emits `media.file.confirmed`. Files have `alt`, `description`, folders (`/api/v1/media/folders`, at most 8 deep) and tags. The list filters by name prefix, kind, folder, status, visibility, size and creation, and the size, type and tenant quota limits are checked before a signed URL is given.

  `createTestApp` takes `disk`, the options of its memory disk.

  Breaking for clients of the thin slice: the generated entity routes of `media.Media` are replaced by the plugin's own routes. Their paths stay, the body of create takes only the fields above, and `PATCH` changes metadata only. `pathOf` now takes the tenant. A refused upload is `rejected`, not `pending`.

- 34f5f66: Operations for an enterprise (OPS-01 to OPS-06). The mail and delete routes of the base plugins honor `Idempotency-Key`; a `DELETE` route may now be `idempotent`, and a 204 is replayed. Invitations and the audit export are limited per person (`limitActor`, `AUTH_ACTION_LIMITED`). `GET /api/v1/settings/export` and `POST /api/v1/settings/import?dryRun=true` carry settings between environments, with secrets left out. `MEDIA_AUDIT_DOWNLOADS=true` audits the reading of private files. New indexes keep the lists of users and of the audit log off full scans (data step 0.5.0, auth migration 0.7.0), and `@bieberkit/testing` exports `planOf`, `fullScans` and `analyze` for tests of a query plan. The lists of users, media and the audit log are tested at 100 000 rows on the three dialects.

- 16b7239: Entity extensions (PLG-06). A module or plugin adds fields to an entity of another module with `extends: { 'crm.Account': defineExtension({ table, fields, permissions? }) }`. The fields live in a table of the extending plugin (one row for each row of the target, deleted with it), never in the table of the target, and they appear in the create, update, list and detail routes, the field masks, `_meta`, OpenAPI and the generated types of the target. A change of only extension fields moves the `version` of the record. A filter or a sort by an extension field is not supported yet. `@bieberkit/data` exports `defineExtension`, `resolveExtensions`, `extensionsOfSchema` and the read and write helpers, `@bieberkit/server` exports `entitiesOf` and `extensionRefsOf`, `compileEntities` takes `extensions`, and the manifest `tables` of a plugin lists its extension tables, so `bieberkit remove` lists and drops them. Boot errors: `DATA_EXTENSION_TARGET_UNKNOWN`, `DATA_EXTENSION_FIELD_CLASH`, `DATA_EXTENSION_TABLE_CLASH`, `DATA_EXTENSION_INVALID`.

### Patch Changes

- c90bf7e: Notifications are complete on the API side (NTF-01 to NTF-07). The `notifier` service sends to a user, a list or a role inside the caller's transaction, with levels, categories, links, data, dedupe keys, expiry, preferences per category and channel, mail through the outbox, and a `notifications.created` event. The signed-in person lists, counts, reads, reads all, deletes and sets preferences under `/api/v1/notifications/me`. A daily job prunes old and expired notifications (`NOTIFICATIONS_RETENTION_DAYS`).

  Platform: `@bieberkit/queue` types the `schedules` contribution and gives `schedulesOf`, which the scheduler role now runs. The sync driver runs a job from the outbox after the dispatcher's transaction, and `queue.settle()` waits for such jobs. `Mail` gains `prepare(message)` for an outbox intent.

  Breaking for clients of the thin slice: the entity routes of notifications keep only list, get and delete. Creating is `POST /api/v1/notifications/send` with the new permission `notifications.send`. A caller of the sync queue that read a job's effect right after `publish` now awaits `queue.settle()`.

- 288b6b4: Settings are declared (ADR 0030). `@bieberkit/core` exports `defineSetting` and `SettingDef`, and a plugin or module contributes `settings: [...]`; `definePlugin` checks the key prefix. The settings plugin serves the `settings` service (`get(def)` typed by the declaration, cached and flushed after commit, `set`, `reset`) and the routes `GET /api/v1/settings/settings`, `GET/PUT/DELETE .../:key` and `GET /api/v1/settings/public`. Secrets are encrypted with `APP_KEY` and never returned. Tenant values fall back to the global value, then to the default.

  Breaking for clients of the thin slice: the generated entity routes of `settings.Setting` are gone, and an undeclared key is `SETTINGS_UNKNOWN_KEY`. The `bk_settings` table gains `scope` and `secret_value`, and its key is unique for each scope, which a project picks up with `migrate:make`. Server and seed now give the database the key ring of `APP_KEY`, and the test client gains `put`.

- 210b082: Users and roles are complete on the API side (USR-01 to USR-12, ROL-01 to ROL-08). `@bieberkit/auth` gains `createUserService` (list with filters and cursors, detail, create with roles or by invitation, change, disable, delete by anonymizing, sessions, reset and MFA-reset mail) and a role service with batches, duplicate, delete with `reassignTo`, member pages, effective permissions, an MFA warning and an escalation guard. Nobody acts on themselves, and the last active administrator keeps the role. Auth migration 0.6.0 adds `last_sign_in_at`, `deleted_at` and an index on `lower(name)`. `createAuth({ mail })` takes `sendInvite` and `sendMfaReset`.

  Breaking for clients of the thin slice: the users list answers `{ data, meta }` and takes `pageSize` instead of `limit`; `POST /api/v1/roles/roles/:id/assign` and `.../revoke` take `userIds` and answer `results`; `GET /api/v1/roles/permissions` answers objects; deleting a role with members needs `reassignTo`. A role can only be created, changed or given by someone who holds its permissions.

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
  - @bieberkit/mail@0.3.0
  - @bieberkit/http@0.3.0
  - @bieberkit/auth@0.3.0
  - @bieberkit/cache@0.3.0
  - @bieberkit/storage@0.3.0

## 0.2.0

### Minor Changes

- 480c563: Register typed `mail`, `queue` and `cache` services for every process role and seeders, with authentication reset and verification messages sent through the queue. Web processes can dispatch jobs with the database queue without running a worker.

  Give `createTestApp` the same services backed by memory and a sync queue, a readable `mailbox`, and `runOutbox()` to deliver one committed batch explicitly.

  Let modules contribute `subscriptions` that map outbox events to their registered jobs. `applySubscriptions` installs the mappings in process boot, seeders and the test app. Every queue driver rejects a duplicate event mapping with `QUEUE_SUBSCRIPTION_DUPLICATE` instead of silently replacing it.

  Authentication mail inside a transaction uses the built-in `mail.send` outbox mapping so rollback sends nothing and the database queue cannot deadlock the HTTP request. Reject unregistered subscription jobs at registration with `QUEUE_JOB_UNKNOWN`, and release acquired platform, metrics and database resources when boot, seed or test-app initialization fails.

### Patch Changes

- Updated dependencies [7e00afe]
- Updated dependencies [480c563]
  - @bieberkit/auth@0.2.0
  - @bieberkit/cache@0.2.0
  - @bieberkit/mail@0.2.0
  - @bieberkit/queue@0.2.0
  - @bieberkit/http@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
  - @bieberkit/storage@0.2.0
