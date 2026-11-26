---
'@bieberkit/core': minor
'@bieberkit/plugin-settings': minor
'@bieberkit/server': patch
'@bieberkit/testing': patch
'bieberkit': patch
---

<!--
  BieberKit

  @file        .changeset/base-plugins-settings.md
  @description Changeset for slice S2 of the base plugins: declared settings with defineSetting, and the settings service and routes.
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

Settings are declared (ADR 0030). `@bieberkit/core` exports `defineSetting` and `SettingDef`, and a plugin or module contributes `settings: [...]`; `definePlugin` checks the key prefix. The settings plugin serves the `settings` service (`get(def)` typed by the declaration, cached and flushed after commit, `set`, `reset`) and the routes `GET /api/v1/settings/settings`, `GET/PUT/DELETE .../:key` and `GET /api/v1/settings/public`. Secrets are encrypted with `APP_KEY` and never returned. Tenant values fall back to the global value, then to the default.

Breaking for clients of the thin slice: the generated entity routes of `settings.Setting` are gone, and an undeclared key is `SETTINGS_UNKNOWN_KEY`. The `bk_settings` table gains `scope` and `secret_value`, and its key is unique for each scope, which a project picks up with `migrate:make`. Server and seed now give the database the key ring of `APP_KEY`, and the test client gains `put`.
