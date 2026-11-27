---
'@bieberkit/core': minor
'@bieberkit/data': minor
'@bieberkit/server': minor
'bieberkit': minor
---

<!--
  BieberKit

  @file        .changeset/m2-1-deploy-guard.md
  @description Changeset for slice H5 of M2.1: a deploy named by DEPLOY_ID, so that a retry cannot finish a contract step that the first try refused.
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

Expand then contract (DATA-08): a deploy is now named. The new env key `DEPLOY_ID` and the flag `bieberkit migrate --deploy-id` give every run of one release the same id, so a retry, or a second migrate role that waited for the lock, can no longer finish a contract step that the first run refused. Without it each run still gets a random id. `BK_MIGRATE_REFUSED` lists the steps that wait behind a refused one, `@bieberkit/data` exports `CONTRACT_SAME_DEPLOY`, and `bieberkit check plugin-steps` warns about a contract step with no `after` (`BK_STEP_CONTRACT_NO_AFTER`).
