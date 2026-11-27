---
'@bieberkit/tokens': minor
'@bieberkit/server': minor
'@bieberkit/admin-antd': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-tokens.md
  @description Changeset for the tokens slice of M2.2: the theme of the config and its compilers for the admin and the site.
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

Brand tokens (UI-06, TOK-01 to TOK-03). `bieberkit.config.ts` takes a `theme` key (colors, dark palette, radius, spacing, fonts, dark mode), validated with every problem reported together. `@bieberkit/tokens` gives the defaults and the font stack for Latin, Vietnamese and Chinese, `parseTheme`, `compileAntdTheme`, `cssVariables` and `tailwindTheme`. The web role writes the theme into the admin page as data and CSS variables, and `@bieberkit/admin-antd` draws with it, following the system setting for `darkMode: 'auto'`.
