<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-27-admin-identity.md
  @description Implementation plan of the identity and the frame of the admin (UI-23, UI-24, UI-33).
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

# Admin identity and frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The admin has the approved A+ identity and frame, and a project can set its colors, name, logo and menu.

**Architecture:** Rules are pure functions (`tokens` for color, `admin-core` for settings and menu). The server writes the settings in the page as it writes the theme. The adapter only draws.

**Tech Stack:** TypeScript, Ant Design 6, TanStack Router, `@fontsource/be-vietnam-pro` 5.3.0.

**Spec:** `docs/modules/admin-identity.md`, ADR 0039.

## Global Constraints

- No font or file from another origin (UI-14). No new dependency besides the font.
- Initial JavaScript under 400 kB compressed (`pnpm check:admin-size`).
- Texts in en, vi and zh with the same keys (UI-05). WCAG 2.2 AA (UI-07). 360 px (UI-16).
- UI-23 and UI-24 are not maintainer-only areas. No commit: the checkout holds uncommitted M2.3 work.

## Review Focus

1. A pale `primary` in the theme (yellow): the frame and its texts still read (Task 1).
2. A project entity whose module has the name of a base module, or a menu that names nothing real: no entry is lost or shown twice (Task 2).
3. A logo that is not a `data:` image (a remote URL, `javascript:`): refused at boot (Task 2).
4. A page of the admin that was changed on its way (broken `bk-admin` JSON): the admin still opens (Task 2).
5. Vietnamese typed without accents in the go to page box, with `đ` (Task 2).

---

### Task 1: Colors of the theme

**Files:** modify `packages/tokens/src/{theme,compile,index}.ts`; create `chrome.ts`, `chrome.test.ts`.

**Produces:** `ThemeColors.frame`, `ThemeColors.accent`, `Chrome`, `chromeOf(colors: ThemeColors): Chrome`; `--bk-chrome-*` in `cssVariables`.

- [ ] Write `chrome.test.ts`: default values of the spec table; `frameText` and `frameMuted` at 4.5:1 on the frames of the defaults, of `#ffee00` and of a light frame `#fafafa`; `ink` on `tint` at 4.5:1; frame follows a configured `primary`; a configured `frame` wins; the variables are written for both palettes.
- [ ] Run `pnpm test packages/tokens` and see it fail.
- [ ] Implement, with the values of the spec table, radius 10, and `"Be Vietnam Pro"` first in `FONT_STACK.sans`.
- [ ] Run the tests and see them pass.

### Task 2: Settings and menu

**Files:** create `packages/admin-core/src/{settings,menu}.ts` and their tests; modify `index.ts` and `messages/{en,vi,zh}.ts`.

**Produces:** the functions of the "Public API" section of the spec.

- [ ] Write `settings.test.ts` and `menu.test.ts` from UI-33 and UI-24, with the five Review Focus cases that belong here.
- [ ] See them fail, implement, see them pass.

### Task 3: The server

**Files:** modify `packages/server/src/{project,boot,admin}.ts`, `package.json`; test `admin.test.ts`.

**Produces:** `pageAt(prefix, theme, settings?)`, `registerAdmin(..., folders, settings?)`.

- [ ] Test: the meta is written escaped, the title is the name of the brand and cannot break out of the element. See it fail, implement, see it pass.

### Task 4: The adapter

**Files:** modify `packages/admin-antd/src/app/{App,Gate,Login,Welcome,FormScreen}.tsx`, `app.css`, `main.tsx`; create `Brand.tsx`, `icons.tsx`, `GoTo.tsx`, `assets/logo-dark.svg`; update `NOTICE`.

- [ ] Fonts, theme tokens, frame, account menu, breadcrumb, go to page, sign in, empty and loading states, welcome, folder tabs.
- [ ] Update `e2e/` for the account menu, add cases for the groups, the go to page box and the brand.

### Task 5: Finish

- [ ] API reports, changeset, `docs/modules/admin.md`.
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm check:admin-size`, `pnpm test:e2e`.
- [ ] Screenshots of the real admin: sign in, welcome, list, record; light, dark, 360 px. Compare with the mockups.
- [ ] Tick the roadmap only for items whose evidence exists.
