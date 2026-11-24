---
'@bieberkit/core': patch
'@bieberkit/server': minor
'bieberkit': minor
'create-bieberkit': patch
'@bieberkit/plugin-audit-log': patch
'@bieberkit/plugin-media': patch
'@bieberkit/plugin-notifications': patch
'@bieberkit/plugin-roles': patch
'@bieberkit/plugin-settings': patch
'@bieberkit/plugin-users': patch
---

<!--
  BieberKit

  @file        .changeset/plugin-manifests.md
  @description Changeset for static plugin manifests, read-only verification and the generated bundled scaffolder index.
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

Generate static plugin manifests during plugin builds and verify them without writing through `bieberkit build --check`. Bundle the first-party index from the same package metadata and keep plugin definitions aligned with their package version. Add the lightweight `@bieberkit/server/plugins` entry for metadata tools. Manifest checks accept reordered key lists while still rejecting changed or duplicate values. Application builds retain their existing behavior.
