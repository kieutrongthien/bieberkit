<!--
  BieberKit

  @file        plugins/roles/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/plugin-roles.
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

# @bieberkit/plugin-roles

## 0.3.0

### Minor Changes

- 34f5f66: Operations for an enterprise (OPS-01 to OPS-06). The mail and delete routes of the base plugins honor `Idempotency-Key`; a `DELETE` route may now be `idempotent`, and a 204 is replayed. Invitations and the audit export are limited per person (`limitActor`, `AUTH_ACTION_LIMITED`). `GET /api/v1/settings/export` and `POST /api/v1/settings/import?dryRun=true` carry settings between environments, with secrets left out. `MEDIA_AUDIT_DOWNLOADS=true` audits the reading of private files. New indexes keep the lists of users and of the audit log off full scans (data step 0.5.0, auth migration 0.7.0), and `@bieberkit/testing` exports `planOf`, `fullScans` and `analyze` for tests of a query plan. The lists of users, media and the audit log are tested at 100 000 rows on the three dialects.

- 20908d4: Security policies (POL-01 to POL-05). `@bieberkit/auth` declares the `security.*` settings and reads them on every request through a `PolicyReader` port that `@bieberkit/server` fills from the settings service (ADR 0031). The authenticator enforces an idle and an absolute session limit (`AUTH_SESSION_EXPIRED`), a second factor for everyone with a grace period (`AUTH_MFA_ENROL_REQUIRED`, `mfaEnrolBy` in `GET /users/me`) and a network allowlist for roles flagged `ipRestricted` (`AUTH_NETWORK_DENIED`, audited, fail closed). Sign in revokes the oldest sessions beyond `security.session.max-concurrent` and mails a notice for a new device.

  Auth migration 0.7.0 adds `bk_auth_roles.ip_restricted` and the table `bk_auth_known_devices`. The roles routes take and return `ipRestricted`. `defineSetting` accepts a `guard`, and the settings service refuses a change that locks the person out with `SETTINGS_SELF_LOCKOUT`. `Principal` gains `mfaEnrolBy`.

  Setting keys are kebab-case, so `security.session.idle-minutes` and not `idleMinutes`.

  Managed identities and delegated administration (IDN-02, IDN-03, ROL-09). A user whose `source` is not `local` cannot be renamed, re-mailed, disabled or enabled through the users routes (`USERS_MANAGED_EXTERNALLY`) without the new permission `users.override-external`. The user service gives provider plugins `upsertExternalUser` and `setExternalDisabled`. A role can be assigned for one group only (`groupId`), users have groups (`PUT /users/:id/groups`), and a manager whose roles are limited to groups reaches the users of those groups only (`USERS_OUT_OF_SCOPE`). The users detail has `groups`. Auth migration 0.7.0 also adds `bk_auth_user_roles.scope_group` and `bk_auth_user_groups`.

- 210b082: Users and roles are complete on the API side (USR-01 to USR-12, ROL-01 to ROL-08). `@bieberkit/auth` gains `createUserService` (list with filters and cursors, detail, create with roles or by invitation, change, disable, delete by anonymizing, sessions, reset and MFA-reset mail) and a role service with batches, duplicate, delete with `reassignTo`, member pages, effective permissions, an MFA warning and an escalation guard. Nobody acts on themselves, and the last active administrator keeps the role. Auth migration 0.6.0 adds `last_sign_in_at`, `deleted_at` and an index on `lower(name)`. `createAuth({ mail })` takes `sendInvite` and `sendMfaReset`.

  Breaking for clients of the thin slice: the users list answers `{ data, meta }` and takes `pageSize` instead of `limit`; `POST /api/v1/roles/roles/:id/assign` and `.../revoke` take `userIds` and answer `results`; `GET /api/v1/roles/permissions` answers objects; deleting a role with members needs `reassignTo`. A role can only be created, changed or given by someone who holds its permissions.

### Patch Changes

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
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
  - @bieberkit/http@0.3.0
  - @bieberkit/auth@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [7e00afe]
  - @bieberkit/auth@0.2.0
  - @bieberkit/http@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
