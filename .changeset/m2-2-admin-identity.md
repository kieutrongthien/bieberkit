---
'@bieberkit/tokens': minor
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
'@bieberkit/server': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-admin-identity.md
  @description Changeset for the identity and the frame of the admin and the brand of a project (UI-23, UI-24, UI-33, ADR 0039).
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

The admin has an identity and a new frame (UI-23, UI-24): a grouped menu whose chosen entry joins the page, a breadcrumb, a box that goes to a page (Ctrl or Cmd and K), a menu of the account, a new sign in and folder tabs, with Be Vietnam Pro bundled (ADR 0039). A project can set its name, logo and sentence, and the order of its menu, with the new `admin` key of `bieberkit.config.ts` (UI-33).

The default theme changed. The theme has two new colors, `frame` and `accent`, and the default radius is 10. A theme that sets `colors.primary` and no `colors.frame` gets a frame that is a dark tone of it. A project that built its own adapter and makes a `Theme` or a `ThemeColors` by hand has to give the two new colors.
