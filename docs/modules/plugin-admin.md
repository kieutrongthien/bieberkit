<!--
  BieberKit

  @file        docs/modules/plugin-admin.md
  @description Module spec of the admin part of a plugin: the slots, the rules that keep the admin one application, how a project builds it, what a plugin author gets, and how the screens move into their plugins (UI-34 to UI-38).
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

# The admin part of a plugin

- Packages: `@bieberkit/admin-core`, `@bieberkit/admin-antd`, `bieberkit`, `create-bieberkit`, `@bieberkit/server`, the plugins
- Layer: product and tools
- Spec sections: UI-34 to UI-38, UI-04, UI-10, UI-12, UI-14, UI-25, section 11, 16.6, DEP-06. ADR 0040
- Status: **Draft.** The maintainer chose the direction and the control of the shell on 2026-11-28. Not built. The names of the API are proposals, and the public API of `definePlugin` is the maintainer's to approve.

## Purpose

A plugin is one piece with two sides. A person adds it to `plugins` and gets its tables and routes, and its pages, forms and buttons inside the BieberKit admin. Its author writes those screens. The shell decides where they appear and under which rules.

Not in this work: a switch that turns a plugin off while the application runs, plugins that change the layout of the shell, and screens for a second UI adapter.

## Approaches

Composing at the build of the project, composing at run time and keeping the screens in the shared packages are compared in [ADR 0040](../adr/0040-plugin-owned-admin.md). The first was chosen.

## What goes where

| Package                 | Holds                                                                                                                                              | Never holds                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `@bieberkit/admin-core` | The client of the API (transport, errors, metadata, entities), the logic of the generic screens, the contract of an admin part, with no UI library | A route or a rule of one plugin                                             |
| `@bieberkit/admin-antd` | The shell, the generic list, form and detail, the theme, shared components (such as the layout of a page before sign in), the slots                | A screen of one plugin                                                      |
| A plugin                | `src/` (backend, as today) and `src/admin/` (screens, its texts, its calls of the API; the logic without a UI library)                             | An import of the files of another plugin (PLG-01) or of server code (FE-01) |

```
plugins/users/
├── src/index.ts          definePlugin: routes, permissions, seed
└── src/admin/index.ts    the admin part, exported as "./admin"
```

## Slots (UI-35)

The list is closed. A new slot is a change of this spec and of the API.

| No. | Slot                                                      | The shell gives                                                                   | First user                     |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Menu entry                                                | Group, order (`admin.menu`, UI-24), icon, permission, the box that goes to a page | every plugin with a page       |
| 2   | Page after sign in                                        | Address, breadcrumb, lazy chunk, permission                                       | users, roles                   |
| 3   | Button in the header                                      | Its place beside the language                                                     | notifications (the bell)       |
| 4   | Notice over the frame                                     | Its place and one way to close it                                                 | users (days of grace)          |
| 5   | Tab of the detail of a record                             | The record and the entity                                                         | audit-log (history)            |
| 6   | Control of a field in a form                              | Value, change, label, the checks of the form                                      | media (file and image)         |
| 7   | Block of the home page                                    | Its place in the grid                                                             | any                            |
| 8   | Entry in the menu of the account, and tab of "My account" | The page of the account                                                           | users                          |
| 9   | Page without a session                                    | The two-sided layout of the sign in, and the sign in itself                       | users                          |
| 10  | Screen that stands in place of the admin                  | When it applies, and a way to sign out                                            | users (second factor required) |

The replacement of a generic list or form (UI-04) stays, as a declaration of the same kind.

The shell has no sign in of its own, so the admin needs the `users` plugin. Without it the build stops and says so.

## Rules (UI-36)

1. **Declared, not patched.** An admin part says what it has and in which slot. It cannot change the shell, replace the layout or write a global style.
2. **The shell owns what is common.** Routes (a plugin cannot take an address of another or of the shell), menu, permissions (what a person may not use is not drawn; the server stays the authority), lazy chunks, and an error boundary around each contribution, so one that fails to draw leaves the rest.
3. **One look.** A screen uses the shared components and the tokens, so `theme` changes it too. It keeps UI-07 and UI-16.
4. **Every language.** An admin part brings its texts for each language of the project. A key of a plugin starts with its short name. A missing or an extra key is a problem.
5. **Mistakes are loud.** A repeated address, an unknown slot or a missing text stops the build with all the problems and a stable code.
6. **One door.** A first-party plugin uses nothing that a plugin of a person cannot use.

## Public API (proposal)

```ts
// plugins/notes/src/admin/index.ts
import { defineAdminPlugin } from '@bieberkit/admin-core';

export default defineAdminPlugin({
  name: 'bieberkit-plugin-notes',
  menu: [{ page: '/notes', group: 'content', permission: 'notes.read' }],
  pages: [{ path: '/notes', load: () => import('./NotesPage.tsx') }],
  messages: { en: () => import('./messages/en.ts'), vi: () => import('./messages/vi.ts') },
});
```

The other slots are keys of the same object (`headerActions`, `notices`, `recordTabs`, `fields`, `homeBlocks`, `account`, `publicPages`, `gates`, `screens`). What a screen is given (the client, the signed-in person, the language, navigation) comes from hooks of `@bieberkit/admin-antd`, with types. The exact types are written with the tests of this work and approved before the code.

## How a project builds its admin (UI-37)

- `apps/admin` is the application of the project (spec 16.6). Its list of admin parts is **generated** from `plugins` of the config. Its own pages, widgets and texts go in `apps/admin/src`.
- `bieberkit dev` runs the admin with hot reload; `bieberkit build` writes `apps/admin/dist`, which the web role serves with the policy of UI-14 (DEP-06). `theme`, `admin.brand`, `admin.menu` and `ADMIN_URL` stay settings of a restart.
- One copy of React and of Ant Design: they are peer dependencies of an admin part.
- The budget of section 18.1 is checked on the built project.

## For the author of a plugin (UI-38)

```
pnpm create bieberkit my-proj && cd my-proj
pnpm bieberkit make:plugin bieberkit-plugin-notes   # backend and admin, wired into the project
pnpm dev                                            # an edit of .ts or .tsx shows with no manual build
pnpm build
```

A plugin in the project is compiled from its source. The same package, published, ships built JavaScript and types for both exports; another project installs it and names it in `plugins`.

Seen in the code on 2026-11-28 and not run, each to be fixed here: the workspace of a new project does not list `plugins/*`; the made plugin calls `tsdown`, which nothing declares; the server resolves a plugin to its `dist`; the made plugin has no admin part.

## Order of work

1. The spike of ADR 0040. Then the maintainer accepts the record and the API.
2. The contract and the slots, with `@bieberkit/admin-antd` as a library.
3. The build of the project, then the path of the author, then the test with packed tarballs.
4. The screens move: `users` first (the account screens of UI-26, with the account calls of `admin-core`), then `media` (the control of a file) and `audit-log` (the history tab). The behavior and the browser tests of [admin-account.md](admin-account.md) stay and must keep passing.
5. The loader of ADR 0037 is removed when its slots are served by the new contract, and its fixture plugin is rewritten.
6. Only then the screens of UI-27 to UI-32, each in its plugin.

## Errors

Codes for a wrong admin part, each a `BkError` with a fix (AI-02), are named with the tests. They take the place of `BK_ADMIN_CONTRIBUTION_INVALID`.

## Configuration

No new environment variable. No new config key is planned.

## Tests

| Requirement  | What proves it                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-34        | A check that the shared packages name no first-party plugin; a project without a plugin has none of its screens in the build                       |
| UI-35, UI-36 | Unit tests of the contract; browser tests of each slot, of a permission, of a screen that fails, and of each mistake that stops the build          |
| UI-37        | A built project: one React, the policy with no violation, the size budget                                                                          |
| UI-38        | Packed tarballs, a new project outside the repository, `make:plugin`, `dev` and an edit, `build`, and a browser that sees the screen of the plugin |

## Open questions

- Whether `create --no-admin` projects keep any admin build file.
- Whether a plugin may declare an admin part for a language that the project does not have (today: it is ignored).
