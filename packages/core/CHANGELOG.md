<!--
  BieberKit

  @file        packages/core/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/core.
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

# @bieberkit/core

## 0.3.0

### Minor Changes

- 88a425e: The audit log is complete on the API side (AUD-01 to AUD-06). The entries list filters by time, action (exact or `prefix*`), entity, record, actor and request. Reads stay inside the tenant of the request. `GET .../entries/:id` returns one entry, and every entry carries its `actor`. `GET .../export?format=csv|ndjson` streams up to `AUDIT_LOG_EXPORT_MAX_ROWS` entries, escapes formula cells, sets `X-Export-Truncated` when it cuts, and is audited itself (new permission `audit-log.export`). `GET .../actions` lists the distinct actions.

  Retention: `bieberkit audit:prune --before <date>` counts first and, with `--yes`, deletes on `MIGRATE_DATABASE_URL` and writes `audit.pruned`. It runs `pruneAuditLog` from `@bieberkit/data/orm` through `pruneAudit` from `@bieberkit/server`.

  Fix: a project loaded a plugin whose short name has a dash (`audit-log`) with the env prefix `AUDIT-LOG_`, while `definePlugin` checks `AUDIT_LOG_`, so such a plugin with env keys could not boot. `@bieberkit/server` now uses `envPrefixOf`, which `@bieberkit/core` exports.

  Breaking for clients of the thin slice: the entries list takes `pageSize` in place of `limit` and answers `meta.nextCursor` in place of `nextCursor`. In a tenant it now shows that tenant's entries only.

- 20908d4: Security policies (POL-01 to POL-05). `@bieberkit/auth` declares the `security.*` settings and reads them on every request through a `PolicyReader` port that `@bieberkit/server` fills from the settings service (ADR 0031). The authenticator enforces an idle and an absolute session limit (`AUTH_SESSION_EXPIRED`), a second factor for everyone with a grace period (`AUTH_MFA_ENROL_REQUIRED`, `mfaEnrolBy` in `GET /users/me`) and a network allowlist for roles flagged `ipRestricted` (`AUTH_NETWORK_DENIED`, audited, fail closed). Sign in revokes the oldest sessions beyond `security.session.max-concurrent` and mails a notice for a new device.

  Auth migration 0.7.0 adds `bk_auth_roles.ip_restricted` and the table `bk_auth_known_devices`. The roles routes take and return `ipRestricted`. `defineSetting` accepts a `guard`, and the settings service refuses a change that locks the person out with `SETTINGS_SELF_LOCKOUT`. `Principal` gains `mfaEnrolBy`.

  Setting keys are kebab-case, so `security.session.idle-minutes` and not `idleMinutes`.

  Managed identities and delegated administration (IDN-02, IDN-03, ROL-09). A user whose `source` is not `local` cannot be renamed, re-mailed, disabled or enabled through the users routes (`USERS_MANAGED_EXTERNALLY`) without the new permission `users.override-external`. The user service gives provider plugins `upsertExternalUser` and `setExternalDisabled`. A role can be assigned for one group only (`groupId`), users have groups (`PUT /users/:id/groups`), and a manager whose roles are limited to groups reaches the users of those groups only (`USERS_OUT_OF_SCOPE`). The users detail has `groups`. Auth migration 0.7.0 also adds `bk_auth_user_roles.scope_group` and `bk_auth_user_groups`.

- 288b6b4: Settings are declared (ADR 0030). `@bieberkit/core` exports `defineSetting` and `SettingDef`, and a plugin or module contributes `settings: [...]`; `definePlugin` checks the key prefix. The settings plugin serves the `settings` service (`get(def)` typed by the declaration, cached and flushed after commit, `set`, `reset`) and the routes `GET /api/v1/settings/settings`, `GET/PUT/DELETE .../:key` and `GET /api/v1/settings/public`. Secrets are encrypted with `APP_KEY` and never returned. Tenant values fall back to the global value, then to the default.

  Breaking for clients of the thin slice: the generated entity routes of `settings.Setting` are gone, and an undeclared key is `SETTINGS_UNKNOWN_KEY`. The `bk_settings` table gains `scope` and `secret_value`, and its key is unique for each scope, which a project picks up with `migrate:make`. Server and seed now give the database the key ring of `APP_KEY`, and the test client gains `put`.

- bf916e3: Expand then contract (DATA-08): a deploy is now named. The new env key `DEPLOY_ID` and the flag `bieberkit migrate --deploy-id` give every run of one release the same id, so a retry, or a second migrate role that waited for the lock, can no longer finish a contract step that the first run refused. Without it each run still gets a random id. `BK_MIGRATE_REFUSED` lists the steps that wait behind a refused one, `@bieberkit/data` exports `CONTRACT_SAME_DEPLOY`, and `bieberkit check plugin-steps` warns about a contract step with no `after` (`BK_STEP_CONTRACT_NO_AFTER`).

- 16b7239: Entity extensions (PLG-06). A module or plugin adds fields to an entity of another module with `extends: { 'crm.Account': defineExtension({ table, fields, permissions? }) }`. The fields live in a table of the extending plugin (one row for each row of the target, deleted with it), never in the table of the target, and they appear in the create, update, list and detail routes, the field masks, `_meta`, OpenAPI and the generated types of the target. A change of only extension fields moves the `version` of the record. A filter or a sort by an extension field is not supported yet. `@bieberkit/data` exports `defineExtension`, `resolveExtensions`, `extensionsOfSchema` and the read and write helpers, `@bieberkit/server` exports `entitiesOf` and `extensionRefsOf`, `compileEntities` takes `extensions`, and the manifest `tables` of a plugin lists its extension tables, so `bieberkit remove` lists and drops them. Boot errors: `DATA_EXTENSION_TARGET_UNKNOWN`, `DATA_EXTENSION_FIELD_CLASH`, `DATA_EXTENSION_TABLE_CLASH`, `DATA_EXTENSION_INVALID`.

- 7c9da65: The web role keeps the hashed files of the previous release of the admin for 24 hours after a deploy, in `ADMIN_ASSETS_DIR` (`data/admin-assets` by default), and serves a hashed file that its build lacks from there, so a tab that was open at a rolling deploy still finds its chunks. `serveStatic` takes a `retained` folder.

## 0.2.0

No changes in this release.
