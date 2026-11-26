---
'@bieberkit/plugin-notifications': minor
'@bieberkit/queue': minor
'@bieberkit/mail': minor
'@bieberkit/server': patch
'@bieberkit/testing': patch
---

<!--
  BieberKit

  @file        .changeset/base-plugins-notifications.md
  @description Changeset for slice S3 of the base plugins: the notifier, the routes of the signed-in person, preferences, retention and module schedules.
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

Notifications are complete on the API side (NTF-01 to NTF-07). The `notifier` service sends to a user, a list or a role inside the caller's transaction, with levels, categories, links, data, dedupe keys, expiry, preferences per category and channel, mail through the outbox, and a `notifications.created` event. The signed-in person lists, counts, reads, reads all, deletes and sets preferences under `/api/v1/notifications/me`. A daily job prunes old and expired notifications (`NOTIFICATIONS_RETENTION_DAYS`).

Platform: `@bieberkit/queue` types the `schedules` contribution and gives `schedulesOf`, which the scheduler role now runs. The sync driver runs a job from the outbox after the dispatcher's transaction, and `queue.settle()` waits for such jobs. `Mail` gains `prepare(message)` for an outbox intent.

Breaking for clients of the thin slice: the entity routes of notifications keep only list, get and delete. Creating is `POST /api/v1/notifications/send` with the new permission `notifications.send`. A caller of the sync queue that read a job's effect right after `publish` now awaits `queue.settle()`.
