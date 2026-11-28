<!--
  BieberKit

  @file        packages/tokens/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/tokens.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm changeset version (license header normalized)
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

# @bieberkit/tokens

## 0.4.1

No changes in this release.

## 0.4.0

### Minor Changes

- f651cd1: The admin has an identity and a new frame (UI-23, UI-24): a grouped menu whose chosen entry joins the page, a breadcrumb, a box that goes to a page (Ctrl or Cmd and K), a menu of the account, a new sign in and folder tabs, with Be Vietnam Pro bundled (ADR 0039). A project can set its name, logo and sentence, and the order of its menu, with the new `admin` key of `bieberkit.config.ts` (UI-33).

  The default theme changed. The theme has two new colors, `frame` and `accent`, and the default radius is 10. A theme that sets `colors.primary` and no `colors.frame` gets a frame that is a dark tone of it. A project that built its own adapter and makes a `Theme` or a `ThemeColors` by hand has to give the two new colors.

## 0.3.0

### Minor Changes

- ce6f7c3: The default brand colors are darker, so that white text on them and they on a white background read at level AA, and the dark palette has light tones of the same hues with dark text on a filled button. The compiler gives Ant Design a placeholder and a description that read, and `contrastRatio` and `mixColors` are exported. The admin has no violation of WCAG 2.2 AA in the screens that the browser tests open. A brand color that the config sets is still the brand color of both palettes.

- 42f5218: Brand tokens (UI-06, TOK-01 to TOK-03). `bieberkit.config.ts` takes a `theme` key (colors, dark palette, radius, spacing, fonts, dark mode), validated with every problem reported together. `@bieberkit/tokens` gives the defaults and the font stack for Latin, Vietnamese and Chinese, `parseTheme`, `compileAntdTheme`, `cssVariables` and `tailwindTheme`. The web role writes the theme into the admin page as data and CSS variables, and `@bieberkit/admin-antd` draws with it, following the system setting for `darkMode: 'auto'`.

## 0.2.0

No changes in this release.
