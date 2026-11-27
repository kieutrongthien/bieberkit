---
'@bieberkit/core': minor
'@bieberkit/http': minor
'@bieberkit/server': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-assets.md
  @description Changeset for the hashed files of the release before that the web role keeps for a day (UI-22).
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

The web role keeps the hashed files of the previous release of the admin for 24 hours after a deploy, in `ADMIN_ASSETS_DIR` (`data/admin-assets` by default), and serves a hashed file that its build lacks from there, so a tab that was open at a rolling deploy still finds its chunks. `serveStatic` takes a `retained` folder.
