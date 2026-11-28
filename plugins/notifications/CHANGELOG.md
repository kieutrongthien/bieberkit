<!--
  BieberKit

  @file        plugins/notifications/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/plugin-notifications.
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

# @bieberkit/plugin-notifications

## 0.4.1

### Patch Changes

- 4b6de6f: Every file of a module and of a plugin is now in the folder of its kind (`entities/`, `services/`, `routes/`, `jobs/`, `events/`, and in `admin/` the folders `pages/`, `tabs/`, `fields/`, `components/`, `lib/`, `messages/`). The base plugins and the shell of the admin were reorganized with no change of their public API.

  - `bieberkit check layout` warns about a file of a module or a plugin that is out of place. It does not fail the check.
  - `make:plugin` writes the new layout, and the `AGENTS.md` of a new project says it.

- @bieberkit/auth@0.4.1
  - @bieberkit/core@0.4.1
  - @bieberkit/data@0.4.1
  - @bieberkit/http@0.4.1
  - @bieberkit/mail@0.4.1
  - @bieberkit/queue@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [a62b594]
- Updated dependencies [e9e15e8]
- Updated dependencies [3d9182a]
  - @bieberkit/auth@0.4.0
  - @bieberkit/http@0.4.0
  - @bieberkit/core@0.4.0
  - @bieberkit/data@0.4.0
  - @bieberkit/mail@0.4.0
  - @bieberkit/queue@0.4.0

## 0.3.0

### Minor Changes

- c90bf7e: Notifications are complete on the API side (NTF-01 to NTF-07). The `notifier` service sends to a user, a list or a role inside the caller's transaction, with levels, categories, links, data, dedupe keys, expiry, preferences per category and channel, mail through the outbox, and a `notifications.created` event. The signed-in person lists, counts, reads, reads all, deletes and sets preferences under `/api/v1/notifications/me`. A daily job prunes old and expired notifications (`NOTIFICATIONS_RETENTION_DAYS`).

  Platform: `@bieberkit/queue` types the `schedules` contribution and gives `schedulesOf`, which the scheduler role now runs. The sync driver runs a job from the outbox after the dispatcher's transaction, and `queue.settle()` waits for such jobs. `Mail` gains `prepare(message)` for an outbox intent.

  Breaking for clients of the thin slice: the entity routes of notifications keep only list, get and delete. Creating is `POST /api/v1/notifications/send` with the new permission `notifications.send`. A caller of the sync queue that read a job's effect right after `publish` now awaits `queue.settle()`.

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
  - @bieberkit/mail@0.3.0
  - @bieberkit/http@0.3.0
  - @bieberkit/auth@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [7e00afe]
  - @bieberkit/auth@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
