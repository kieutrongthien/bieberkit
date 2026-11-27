<!--
  BieberKit

  @file        packages/server/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/server.
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

# @bieberkit/server

## 0.3.0

### Minor Changes

- b7300dc: Audit for an enterprise (AUD-07 to AUD-09). `AUDIT_LOG_MIRROR=true` copies every audit entry to the log after commit as one line with `audit: true`, through the outbox and a worker job. The entries list and the export take `after=<id>` to read oldest first, each entry once, with `meta.nextAfter` to resume. Legal holds (`POST`, `GET` and `DELETE /api/v1/audit-log/holds`, new permission `audit-log.hold`) keep entries from `bieberkit audit:prune`, which now says how many it kept. Data migration step 0.5.0 adds the table `bk_audit_holds` (ADR 0032). `pruneAuditLog` returns `kept`, and `createDatabase` takes `auditMirror`.

- 88a425e: The audit log is complete on the API side (AUD-01 to AUD-06). The entries list filters by time, action (exact or `prefix*`), entity, record, actor and request. Reads stay inside the tenant of the request. `GET .../entries/:id` returns one entry, and every entry carries its `actor`. `GET .../export?format=csv|ndjson` streams up to `AUDIT_LOG_EXPORT_MAX_ROWS` entries, escapes formula cells, sets `X-Export-Truncated` when it cuts, and is audited itself (new permission `audit-log.export`). `GET .../actions` lists the distinct actions.

  Retention: `bieberkit audit:prune --before <date>` counts first and, with `--yes`, deletes on `MIGRATE_DATABASE_URL` and writes `audit.pruned`. It runs `pruneAuditLog` from `@bieberkit/data/orm` through `pruneAudit` from `@bieberkit/server`.

  Fix: a project loaded a plugin whose short name has a dash (`audit-log`) with the env prefix `AUDIT-LOG_`, while `definePlugin` checks `AUDIT_LOG_`, so such a plugin with env keys could not boot. `@bieberkit/server` now uses `envPrefixOf`, which `@bieberkit/core` exports.

  Breaking for clients of the thin slice: the entries list takes `pageSize` in place of `limit` and answers `meta.nextCursor` in place of `nextCursor`. In a tenant it now shows that tenant's entries only.

- 20908d4: Security policies (POL-01 to POL-05). `@bieberkit/auth` declares the `security.*` settings and reads them on every request through a `PolicyReader` port that `@bieberkit/server` fills from the settings service (ADR 0031). The authenticator enforces an idle and an absolute session limit (`AUTH_SESSION_EXPIRED`), a second factor for everyone with a grace period (`AUTH_MFA_ENROL_REQUIRED`, `mfaEnrolBy` in `GET /users/me`) and a network allowlist for roles flagged `ipRestricted` (`AUTH_NETWORK_DENIED`, audited, fail closed). Sign in revokes the oldest sessions beyond `security.session.max-concurrent` and mails a notice for a new device.

  Auth migration 0.7.0 adds `bk_auth_roles.ip_restricted` and the table `bk_auth_known_devices`. The roles routes take and return `ipRestricted`. `defineSetting` accepts a `guard`, and the settings service refuses a change that locks the person out with `SETTINGS_SELF_LOCKOUT`. `Principal` gains `mfaEnrolBy`.

  Setting keys are kebab-case, so `security.session.idle-minutes` and not `idleMinutes`.

  Managed identities and delegated administration (IDN-02, IDN-03, ROL-09). A user whose `source` is not `local` cannot be renamed, re-mailed, disabled or enabled through the users routes (`USERS_MANAGED_EXTERNALLY`) without the new permission `users.override-external`. The user service gives provider plugins `upsertExternalUser` and `setExternalDisabled`. A role can be assigned for one group only (`groupId`), users have groups (`PUT /users/:id/groups`), and a manager whose roles are limited to groups reaches the users of those groups only (`USERS_OUT_OF_SCOPE`). The users detail has `groups`. Auth migration 0.7.0 also adds `bk_auth_user_roles.scope_group` and `bk_auth_user_groups`.

- bf916e3: Expand then contract (DATA-08): a deploy is now named. The new env key `DEPLOY_ID` and the flag `bieberkit migrate --deploy-id` give every run of one release the same id, so a retry, or a second migrate role that waited for the lock, can no longer finish a contract step that the first run refused. Without it each run still gets a random id. `BK_MIGRATE_REFUSED` lists the steps that wait behind a refused one, `@bieberkit/data` exports `CONTRACT_SAME_DEPLOY`, and `bieberkit check plugin-steps` warns about a contract step with no `after` (`BK_STEP_CONTRACT_NO_AFTER`).

- 16b7239: Entity extensions (PLG-06). A module or plugin adds fields to an entity of another module with `extends: { 'crm.Account': defineExtension({ table, fields, permissions? }) }`. The fields live in a table of the extending plugin (one row for each row of the target, deleted with it), never in the table of the target, and they appear in the create, update, list and detail routes, the field masks, `_meta`, OpenAPI and the generated types of the target. A change of only extension fields moves the `version` of the record. A filter or a sort by an extension field is not supported yet. `@bieberkit/data` exports `defineExtension`, `resolveExtensions`, `extensionsOfSchema` and the read and write helpers, `@bieberkit/server` exports `entitiesOf` and `extensionRefsOf`, `compileEntities` takes `extensions`, and the manifest `tables` of a plugin lists its extension tables, so `bieberkit remove` lists and drops them. Boot errors: `DATA_EXTENSION_TARGET_UNKNOWN`, `DATA_EXTENSION_FIELD_CLASH`, `DATA_EXTENSION_TABLE_CLASH`, `DATA_EXTENSION_INVALID`.

- 7c9da65: The web role keeps the hashed files of the previous release of the admin for 24 hours after a deploy, in `ADMIN_ASSETS_DIR` (`data/admin-assets` by default), and serves a hashed file that its build lacks from there, so a tab that was open at a rolling deploy still finds its chunks. `serveStatic` takes a `retained` folder.

- 28782a9: `f.file()` and `f.image()` make a field that holds the id of a media record. A write is refused at the field unless the file exists, is uploaded and is of a type that the field takes, `_meta` draws the field as a file, and the admin sends the file to the storage with a signed URL. The policy of the admin names the origin of the bucket in `connect-src` and `img-src` when the disk is S3. A disk that cannot sign (the local one) cannot take files from the browser.

- 1aa0d82: A plugin can add to the admin with the `admin` key of `definePlugin`: pages (with a menu entry), widgets for the dashboard and for the detail of an entity, controls for the fields that name them with `admin.widget`, and screens that replace the list or the form of an entity. Each is a `.js` file in the folder `admin` of the package, which the web role serves under the admin; the admin gives it React, Ant Design and its client. A contribution that is not valid, or a file that is missing, stops the boot with all the problems. `_meta` carries `extensions` and fills `menu`.

- a8b3cf2: The admin sends the errors that nothing caught, and the Core Web Vitals of a sample of the visits, to the new public route `POST /api/v1/_client-reports`. The server hands an error to the error reporter as a warning of the source `client` and counts a vital in the metrics. The report has no email, no long number and no id of a record.

- 42f5218: Brand tokens (UI-06, TOK-01 to TOK-03). `bieberkit.config.ts` takes a `theme` key (colors, dark palette, radius, spacing, fonts, dark mode), validated with every problem reported together. `@bieberkit/tokens` gives the defaults and the font stack for Latin, Vietnamese and Chinese, `parseTheme`, `compileAntdTheme`, `cssVariables` and `tailwindTheme`. The web role writes the theme into the admin page as data and CSS variables, and `@bieberkit/admin-antd` draws with it, following the system setting for `darkMode: 'auto'`.

### Patch Changes

- c90bf7e: Notifications are complete on the API side (NTF-01 to NTF-07). The `notifier` service sends to a user, a list or a role inside the caller's transaction, with levels, categories, links, data, dedupe keys, expiry, preferences per category and channel, mail through the outbox, and a `notifications.created` event. The signed-in person lists, counts, reads, reads all, deletes and sets preferences under `/api/v1/notifications/me`. A daily job prunes old and expired notifications (`NOTIFICATIONS_RETENTION_DAYS`).

  Platform: `@bieberkit/queue` types the `schedules` contribution and gives `schedulesOf`, which the scheduler role now runs. The sync driver runs a job from the outbox after the dispatcher's transaction, and `queue.settle()` waits for such jobs. `Mail` gains `prepare(message)` for an outbox intent.

  Breaking for clients of the thin slice: the entity routes of notifications keep only list, get and delete. Creating is `POST /api/v1/notifications/send` with the new permission `notifications.send`. A caller of the sync queue that read a job's effect right after `publish` now awaits `queue.settle()`.

- 288b6b4: Settings are declared (ADR 0030). `@bieberkit/core` exports `defineSetting` and `SettingDef`, and a plugin or module contributes `settings: [...]`; `definePlugin` checks the key prefix. The settings plugin serves the `settings` service (`get(def)` typed by the declaration, cached and flushed after commit, `set`, `reset`) and the routes `GET /api/v1/settings/settings`, `GET/PUT/DELETE .../:key` and `GET /api/v1/settings/public`. Secrets are encrypted with `APP_KEY` and never returned. Tenant values fall back to the global value, then to the default.

  Breaking for clients of the thin slice: the generated entity routes of `settings.Setting` are gone, and an undeclared key is `SETTINGS_UNKNOWN_KEY`. The `bk_settings` table gains `scope` and `secret_value`, and its key is unique for each scope, which a project picks up with `migrate:make`. Server and seed now give the database the key ring of `APP_KEY`, and the test client gains `put`.

- 210b082: Users and roles are complete on the API side (USR-01 to USR-12, ROL-01 to ROL-08). `@bieberkit/auth` gains `createUserService` (list with filters and cursors, detail, create with roles or by invitation, change, disable, delete by anonymizing, sessions, reset and MFA-reset mail) and a role service with batches, duplicate, delete with `reassignTo`, member pages, effective permissions, an MFA warning and an escalation guard. Nobody acts on themselves, and the last active administrator keeps the role. Auth migration 0.6.0 adds `last_sign_in_at`, `deleted_at` and an index on `lower(name)`. `createAuth({ mail })` takes `sendInvite` and `sendMfaReset`.

  Breaking for clients of the thin slice: the users list answers `{ data, meta }` and takes `pageSize` instead of `limit`; `POST /api/v1/roles/roles/:id/assign` and `.../revoke` take `userIds` and answer `results`; `GET /api/v1/roles/permissions` answers objects; deleting a role with members needs `reassignTo`. A role can only be created, changed or given by someone who holds its permissions.

- 31f9423: A new project starts with `pnpm dev`. The root of the project declares `@bieberkit/core`, which `bieberkit.config.ts` imports, and `@types/node`, with `types: ["node"]` in its tsconfig. The plugins are resolved from `apps/server`, where they are installed. An error of Node.js, such as a missing package, is now shown with its message instead of crashing the CLI.

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
- Updated dependencies [c90bf7e]
- Updated dependencies [34f5f66]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [210b082]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [ce6f7c3]
- Updated dependencies [7c9da65]
- Updated dependencies [301f5ab]
- Updated dependencies [28782a9]
- Updated dependencies [3bdd7f9]
- Updated dependencies [a0c784c]
- Updated dependencies [1aa0d82]
- Updated dependencies [0089e52]
- Updated dependencies [42f5218]
  - @bieberkit/data@0.3.0
  - @bieberkit/core@0.3.0
  - @bieberkit/queue@0.3.0
  - @bieberkit/mail@0.3.0
  - @bieberkit/http@0.3.0
  - @bieberkit/auth@0.3.0
  - @bieberkit/tokens@0.3.0
  - @bieberkit/cache@0.3.0
  - @bieberkit/storage@0.3.0
  - @bieberkit/log@0.3.0

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
  - @bieberkit/log@0.2.0
  - @bieberkit/storage@0.2.0
