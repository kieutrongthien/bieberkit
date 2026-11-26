<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-26-base-plugins-s3-notifications.md
  @description Implementation plan for slice S3 of the complete base plugins: the notifier service, the routes of the signed-in person, preferences, retention and module schedules.
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

# M1.11 slice S3: notifications (NTF-01..07)

## Context

S1 and S2 are in local `main` (288b6b4). The next roadmap item is S3, which has no gate. Today `plugins/notifications` is one entity with generated CRUD routes and two scoped permissions. The design is `docs/modules/base-plugins-complete.md`, section `notifications`.

## Decisions (builder's, per "Left to the builder")

- **`notifier` service** (BPL-03): `send({ to, title, body?, level?, category?, link?, data?, channels?, dedupeKey?, expiresAt?, tenantId? })`. `to` is a user id, a list of ids (at most 100), or `{ role }`. It writes in the caller's transaction when one is open, otherwise in its own.
  - A role with more than 100 holders writes the outbox event `notifications.expand`. A subscription (BPL-04) maps that event to the job `notifications.expand`, which sends in batches of 100.
  - Each created row emits `notifications.created` (NTF-06).
  - The mail channel writes a `mail.send` outbox intent (M-01), only when the user's preference allows it.
  - One audit entry per send: `notifications.notification.sent` (BPL-05).
- **Columns** (NTF-02): `level`, `category` (default `general`), `link`, `data` (JSON text), `dedupeKey` (unique together with `userId`), `expiresAt`. A second send with the same `dedupeKey` is a no-op for that user.
- **Routes of the signed-in person** (NTF-03), under `/api/v1/notifications/me`:
  - list (`unread`, `category`, keyset by id, newest first, page at most 100, `withTotal`)
  - `unread-count`
  - `:id/read`, `read-all`
  - `DELETE :id`
  - Permissions: `notifications.read-own`, `.update-own` and the new `.delete-own`.
  - Another person's notification is `NOTIFICATIONS_NOT_FOUND` (404).
  - Each change is audited: `notifications.notification.read`, `.read-all`, `.deleted`.
- **Preferences** (NTF-04): a new entity `notifications.Preference` (`bk_notification_preferences`: userId, category, channel, enabled, unique on all three). `GET` and `PUT /me/preferences`. Missing means on. The preference decides both channels.
- **Retention** (NTF-05): job `notifications.prune` on the schedule `17 3 * * *`, run by the scheduler role. It deletes read notifications older than `NOTIFICATIONS_RETENTION_DAYS` (default 90) and every expired one.
- **Schedules (platform)**: `@bieberkit/queue` types the `schedules` contribution (`{ job, cron, input? }`) and gives `schedulesOf(modules)`. Boot hands the result to `createScheduler`; today it passes `[]`.
- **Jobs reach their services** through the notifier: the service factory binds the database for the plugin's jobs. A job that runs before the container boots fails with `NOTIFICATIONS_NOT_READY`.
- **Entity routes** (NTF-07): only `list`, `get`, `delete` remain, for `notifications.manage`. Creating is `POST /api/v1/notifications/send` over the notifier, under its own permission `notifications.send`. At the level of a route, a scoped permission of the same entity action (`delete-own`) covers `notifications.manage`, and no condition applies there.
- **Zod**: the plugin's job input schemas use `zod/mini` 4.6.7, which is already a framework dependency (ADR 0015).

- **Sync queue (found while building)**: the sync driver ran a job from the outbox inside the dispatcher's transaction, so a job that writes to the database waited for that transaction for ever on SQLite. It now runs such a job after that transaction. `queue.settle()` waits for these jobs, and the test app's `runOutbox()` calls it.
- **Mail**: `Mail.prepare(message)` fills the sender for a `mail.send` outbox intent.

## Tasks

1. Tests first, under `describeDialects` with `createTestApp`: NTF-01 to NTF-07, BPL-05, BPL-06, AUTHZ-01, and `schedulesOf`.
2. Platform: the `schedules` contribution and its wiring in boot.
3. Plugin: entities, notifier, jobs and subscription, routes, env key.
4. Docs, spec section 12.4, manifests, changeset, roadmap. Then the full battery.
