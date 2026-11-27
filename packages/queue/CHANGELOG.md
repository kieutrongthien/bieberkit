<!--
  BieberKit

  @file        packages/queue/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/queue.
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

# @bieberkit/queue

## 0.3.0

### Minor Changes

- c90bf7e: Notifications are complete on the API side (NTF-01 to NTF-07). The `notifier` service sends to a user, a list or a role inside the caller's transaction, with levels, categories, links, data, dedupe keys, expiry, preferences per category and channel, mail through the outbox, and a `notifications.created` event. The signed-in person lists, counts, reads, reads all, deletes and sets preferences under `/api/v1/notifications/me`. A daily job prunes old and expired notifications (`NOTIFICATIONS_RETENTION_DAYS`).

  Platform: `@bieberkit/queue` types the `schedules` contribution and gives `schedulesOf`, which the scheduler role now runs. The sync driver runs a job from the outbox after the dispatcher's transaction, and `queue.settle()` waits for such jobs. `Mail` gains `prepare(message)` for an outbox intent.

  Breaking for clients of the thin slice: the entity routes of notifications keep only list, get and delete. Creating is `POST /api/v1/notifications/send` with the new permission `notifications.send`. A caller of the sync queue that read a job's effect right after `publish` now awaits `queue.settle()`.

### Patch Changes

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
- Updated dependencies [34f5f66]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [7c9da65]
- Updated dependencies [301f5ab]
- Updated dependencies [28782a9]
- Updated dependencies [3bdd7f9]
- Updated dependencies [1aa0d82]
- Updated dependencies [0089e52]
  - @bieberkit/data@0.3.0
  - @bieberkit/core@0.3.0

## 0.2.0

### Minor Changes

- 480c563: Register typed `mail`, `queue` and `cache` services for every process role and seeders, with authentication reset and verification messages sent through the queue. Web processes can dispatch jobs with the database queue without running a worker.

  Give `createTestApp` the same services backed by memory and a sync queue, a readable `mailbox`, and `runOutbox()` to deliver one committed batch explicitly.

  Let modules contribute `subscriptions` that map outbox events to their registered jobs. `applySubscriptions` installs the mappings in process boot, seeders and the test app. Every queue driver rejects a duplicate event mapping with `QUEUE_SUBSCRIPTION_DUPLICATE` instead of silently replacing it.

  Authentication mail inside a transaction uses the built-in `mail.send` outbox mapping so rollback sends nothing and the database queue cannot deadlock the HTTP request. Reject unregistered subscription jobs at registration with `QUEUE_JOB_UNKNOWN`, and release acquired platform, metrics and database resources when boot, seed or test-app initialization fails.

### Patch Changes

- @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
