---
'@bieberkit/cache': minor
'@bieberkit/mail': minor
'@bieberkit/queue': minor
'@bieberkit/server': minor
'@bieberkit/testing': minor
---

<!--
  BieberKit

  @file        .changeset/platform-services.md
  @description Release note for typed platform services, authentication mail and test-app mailbox/outbox helpers.
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

Register typed `mail`, `queue` and `cache` services for every process role and seeders, with authentication reset and verification messages sent through the queue. Web processes can dispatch jobs with the database queue without running a worker.

Give `createTestApp` the same services backed by memory and a sync queue, a readable `mailbox`, and `runOutbox()` to deliver one committed batch explicitly.

Let modules contribute `subscriptions` that map outbox events to their registered jobs. `applySubscriptions` installs the mappings in process boot, seeders and the test app. Every queue driver rejects a duplicate event mapping with `QUEUE_SUBSCRIPTION_DUPLICATE` instead of silently replacing it.

Authentication mail inside a transaction uses the built-in `mail.send` outbox mapping so rollback sends nothing and the database queue cannot deadlock the HTTP request. Reject unregistered subscription jobs at registration with `QUEUE_JOB_UNKNOWN`, and release acquired platform, metrics and database resources when boot, seed or test-app initialization fails.
