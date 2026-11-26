---
'@bieberkit/auth': minor
'@bieberkit/plugin-users': minor
'@bieberkit/plugin-roles': minor
'@bieberkit/server': patch
'@bieberkit/testing': patch
---

<!--
  BieberKit

  @file        .changeset/base-plugins-users-roles.md
  @description Changeset for slice S1 of the base plugins: the user service, the complete users and roles routes, and auth migration 0.6.0.
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

Users and roles are complete on the API side (USR-01 to USR-12, ROL-01 to ROL-08). `@bieberkit/auth` gains `createUserService` (list with filters and cursors, detail, create with roles or by invitation, change, disable, delete by anonymizing, sessions, reset and MFA-reset mail) and a role service with batches, duplicate, delete with `reassignTo`, member pages, effective permissions, an MFA warning and an escalation guard. Nobody acts on themselves, and the last active administrator keeps the role. Auth migration 0.6.0 adds `last_sign_in_at`, `deleted_at` and an index on `lower(name)`. `createAuth({ mail })` takes `sendInvite` and `sendMfaReset`.

Breaking for clients of the thin slice: the users list answers `{ data, meta }` and takes `pageSize` instead of `limit`; `POST /api/v1/roles/roles/:id/assign` and `.../revoke` take `userIds` and answer `results`; `GET /api/v1/roles/permissions` answers objects; deleting a role with members needs `reassignTo`. A role can only be created, changed or given by someone who holds its permissions.
