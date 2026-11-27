---
'@bieberkit/data': minor
'@bieberkit/http': minor
'@bieberkit/server': minor
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-plugins.md
  @description Changeset for the pages, widgets, controls and screens that plugins add to the admin (UI-04, ADR 0037).
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

A plugin can add to the admin with the `admin` key of `definePlugin`: pages (with a menu entry), widgets for the dashboard and for the detail of an entity, controls for the fields that name them with `admin.widget`, and screens that replace the list or the form of an entity. Each is a `.js` file in the folder `admin` of the package, which the web role serves under the admin; the admin gives it React, Ant Design and its client. A contribution that is not valid, or a file that is missing, stops the boot with all the problems. `_meta` carries `extensions` and fills `menu`.
