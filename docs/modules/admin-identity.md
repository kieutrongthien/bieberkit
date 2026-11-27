<!--
  BieberKit

  @file        docs/modules/admin-identity.md
  @description Module spec of the identity and the frame of the admin: its colors, type, shell, states, menu and the brand of a project (UI-23, UI-24, UI-33).
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

# The identity and the frame of the admin

- Packages: `@bieberkit/tokens`, `@bieberkit/admin-core`, `@bieberkit/admin-antd`, `@bieberkit/server`
- Layer: product
- Spec sections: UI-23, UI-24, UI-33, UI-05 to UI-07, UI-14, UI-16, TOK-01 to TOK-03. ADR 0039
- Status: Draft, approved from the mockups on 2026-11-27

## Purpose

The admin looks like BieberKit and not like the defaults of its UI library, it fits a project of any trade, and a project can give it its own colors, name and logo. This covers the look and the frame. It does not cover the screens of the base plugins (UI-26 to UI-32).

## Approaches

Six directions were drawn as mockups of the same screen: a filing cabinet (A), a dense workbench (B), a color for each module (C), a neutral frame (D), two levels of navigation at the top (E) and a layout for touch (F). The maintainer chose A, found that something was missing, and approved **A+**: the idea of the cabinet carried into the page (folder tabs), a fuller frame, and later the trail of a record, in the colors and the logo of BieberKit.

## The identity (UI-23)

**The one thing to remember: the frame and the page are one piece of paper.** The chosen entry of the menu has the color of the page and joins it with two concave corners. The same shape comes back as the tabs of a record (folder tabs) and as the stack beside the sign in.

### Colors

Two colors join the theme: `frame` (the navigation and the side of the sign in) and `accent` (decoration only: it never carries text and never is the only sign of a state).

| Token                          | Light                           | Dark                            |
| ------------------------------ | ------------------------------- | ------------------------------- |
| `primary`, `info`              | `#4F46E5`                       | `#8B93FF`                       |
| `success`, `warning`, `danger` | `#237804`, `#AD4E00`, `#CF1322` | `#73D13D`, `#FFC53D`, `#FF7875` |
| `background`                   | `#FFFFFF`                       | `#151A2E`                       |
| `surface`                      | `#F4F5FB`                       | `#0E1222`                       |
| `text`                         | `#0B1020`                       | `#ECEEF9`                       |
| `border`                       | `#D8DBEE`                       | `#363D63`                       |
| `frame`                        | `#0B1020`                       | `#070A16`                       |
| `accent`                       | `#22D3EE`                       | `#22D3EE`                       |

The default radius is 10 px.

**Derived colors** (`chromeOf(colors)`), written as CSS variables `--bk-chrome-*` beside those of the theme:

- `frameStrong`: white or black, the one that reads better on `frame`.
- `frameText`: 82% of `frameStrong` and the rest `frame`. `frameMuted`: 68%, and `frameStrong` when that does not reach 4.5:1.
- `frameRaised`: 12% of `frameStrong` (a hover, a divider).
- `tint`: 12% of `primary` and the rest `background`. `ink`: 75% of `primary` and the rest `text`, and `text` when that does not reach 4.5:1 on `tint`.

**A theme that sets `colors.primary` and no `colors.frame`** gets `frame` = 30% `primary` and the rest black, and 18% for the dark palette unless `dark.colors.frame` says otherwise. So one color makes a whole identity.

### Type and shapes

Be Vietnam Pro (400, 500, 600, 700), bundled (ADR 0039). The page title is 28 px and bold. Tabs of a record are folder tabs. Icons are drawn as strokes by the adapter: there is no icon dependency.

### Sign in, and the states

- **Sign in:** two sides. The frame side has the logo, the sentence and a stack of three folder edges, the top one with the accent block of the logo. The form is on the surface side. Under 768 px the frame side is a band with the logo and the sentence.
- **Sentence** by default: en "One tidy kit. Every change on record.", vi "Gọn một bộ. Rõ từng dấu vết.", zh "一套齐备，处处留痕。".
- **Empty:** a drawing of an empty folder with the sentence of the screen. **Loading** the application: the folder with a status for a screen reader, and no motion for a person who asked for less. **Errors** keep their text, their fix and their retry (UI-19).

## The frame (UI-24)

From top to bottom on the frame side: the brand, the groups of the menu, and the account (initials, email, a menu with "Sign out"). On the page side: the breadcrumb (group and entry), the box that goes to a page, the language, then the screen. Under 768 px the frame side is a drawer behind a button, as before.

**The menu** is made by `menuOf(meta, order)` of `@bieberkit/admin-core`, from the entities that the person may list and the pages of plugins that `_meta` carries, so permissions stay those of the server (META-03).

- `order` is a list of `{ id, label?, items }`. An item names an entity (`notifications.Notification`), a module (`media`, all of its entities) or a path of a page (`/ext/reports/sales`). The first group that names an entry takes it, in the order of `items`.
- The default order is `app` (empty list: what nothing else names), `people` (`users`, `roles`), `content` (`media`, `notifications`), `system` (`settings`, `audit-log`).
- What no group names goes to the group `app`, where the order has it, or to an `app` group at the end.
- An empty group is not drawn. The ids `app`, `people`, `content` and `system` have a translated name; another id takes its `label`.
- The icon is `admin.icon` of the entity when the adapter draws that name, or that of the module, or a plain one.

**Go to a page.** `searchMenu(groups, text)` keeps the entries whose label holds the text, without case and without accents (`nguoi dung` finds `Người dùng`; `đ` is `d`). Ctrl or Cmd and K opens the box. Up, down and Enter choose. It searches pages only, and never records.

## The brand of a project (UI-33)

```ts
admin: {
  brand: { name: 'Acme', logo: 'data:image/svg+xml;base64,…', tagline: { en: '…', vi: '…' } },
  menu: [{ id: 'sales', label: { en: 'Sales' }, items: ['crm.Deal', 'crm'] }],
}
```

| Set     | The frame and the sign in show                                   |
| ------- | ---------------------------------------------------------------- |
| nothing | the logo of BieberKit                                            |
| `name`  | a square with the first letter and the name                      |
| `logo`  | the logo, with `name` or "Admin" as its text for a screen reader |

`name` is also the title of the page. A logo shows on the frame, so it should read on a dark color. It is a `data:` URI because the config is TypeScript (it can read a file) and the policy allows `data:` images. An SVG in an `img` runs no script.

## Public API

```ts
// @bieberkit/tokens
interface ThemeColors { /* as before */ frame: string; accent: string }
interface Chrome { frameStrong; frameText; frameMuted; frameRaised; tint; ink: string }
function chromeOf(colors: ThemeColors): Chrome

// @bieberkit/admin-core
interface AdminSettings { brand?: BrandSettings; menu?: readonly MenuGroupSettings[] }
function parseAdminSettings(input: unknown): AdminSettings          // throws with every problem
function readAdminSettings(text: string | null | undefined): AdminSettings  // never throws
const adminSection: { key: 'admin'; parser: { parse(input: unknown): AdminSettings | undefined } }
const DEFAULT_MENU: readonly MenuGroupSettings[]
function menuOf(meta: Meta, order?: readonly MenuGroupSettings[]): MenuGroup[]
function searchMenu(groups, text: string, labelOfEntry): MenuEntry[]
function currentEntry(groups, path: string): { group: MenuGroup; entry: MenuEntry } | undefined
```

`pageAt` and `registerAdmin` of `@bieberkit/server` take the settings and write them in `<meta name="bk-admin">`, escaped, as they do the theme.

## Errors

The boot fails with the problems of `admin` together, each with its key (`admin.brand.logo: …`), as the theme does (CFG-09). No new error code.

## Configuration

`admin` and `theme` of `bieberkit.config.ts`. No new environment variable.

## Tests

| Requirement                                                                       | Where                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| UI-23 colors, derived colors, contrast, the frame that follows `primary`          | `tokens/src/theme.test.ts`, `tokens/src/chrome.test.ts`       |
| UI-24 groups, order, what is not named, search without accents, the current entry | `admin-core/src/menu.test.ts`                                 |
| UI-33 the settings, every problem together, a page that was changed on its way    | `admin-core/src/settings.test.ts`, `server/src/admin.test.ts` |
| UI-23, UI-24 in the browser, with axe at both widths and both palettes            | `e2e/*.spec.ts`                                               |

Measured on the build of this change, on 2026-11-27:

- The initial JavaScript of the admin is 323.3 kB compressed, of 400 kB (`pnpm check:admin-size`).
- The font adds 12 `.woff2` files (189,656 bytes in all) and 12 `.woff` files (131,088 bytes) to the package. A browser reads the files of the scripts and weights that the page shows: for the weight 400, 21 kB for Latin, 13 kB for Latin extended and 12 kB for Vietnamese.
- `pnpm test:e2e`: 47 tests pass. In one earlier run of the day, axe reported a contrast problem on an option of the open relation picker (`.ant-select-item-option-content`). The test passed alone and in the runs after it, so the cause is not known.
- Not in a browser test: `admin.menu` and `admin.brand.logo` (unit tests only), and the picture of the empty and the opening state.

## Not in this change

The trail of a record (it comes with the users screens, UI-27, and needs `audit-log.read`), the status tabs of the users list, the notifications button (UI-30), and the screens of UI-26 to UI-32. A switch of light and dark by the person: `darkMode` of the theme and the system setting decide, as before.

## Open questions

- ADR 0039: the license of the font.
- Whether `create` should write `admin.menu` for a template that has its own order. `blank` uses the default, so nothing is written today.
