---
'@bieberkit/data': minor
'@bieberkit/http': minor
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-conditions.md
  @description Changeset for the conditions that show or require a field (UI-11).
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

A field may say when it is shown and when it is required: `f.string(...).optional().admin({ visibleWhen: { field: 'active', eq: false }, requiredWhen: { field: 'active', eq: false } })`. A condition is data (`eq`, `ne`, `in`, `set`, `all`, `any`, `not`). The routes of an entity drop a hidden field and refuse a required one at the field, on create, update and bulk update. `_meta` carries the conditions and the form follows them as the person types. `defineEntity` refuses a condition that names an unknown field.
