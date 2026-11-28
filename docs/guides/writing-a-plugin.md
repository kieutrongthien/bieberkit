<!--
  BieberKit

  @file        docs/guides/writing-a-plugin.md
  @description How the author of a project writes a plugin with a backend and screens in the admin, from make:plugin to a published package (UI-34 to UI-38).
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

# Writing a plugin

A plugin is one package with two sides. The backend adds tables, routes and permissions. The admin part adds screens inside the BieberKit admin. A project turns both on by listing the plugin in `plugins` of `bieberkit.config.ts`.

## Start

```sh
pnpm create bieberkit my-proj
cd my-proj
pnpm bieberkit make:plugin bieberkit-plugin-notes
pnpm bieberkit migrate:make
pnpm bieberkit migrate
pnpm dev
```

`make:plugin` writes `plugins/notes`, adds it to the workspace, to `apps/server` and `apps/admin`, and to the config, then runs `pnpm install`. When it cannot do one of these, it lists what is left for you to do.

Sign in to the admin. The menu has a new entry, which opens the page of the plugin.

## The files

```
plugins/notes/
├── package.json              exports "." and "./admin" as source; publishConfig turns them to dist
├── tsconfig.json             the backend
└── src/
    ├── index.ts              definePlugin: entities, permissions, routes
    ├── entity.ts
    └── admin/
        ├── index.ts          defineAdminPlugin: what the admin gets
        ├── NotesPage.tsx
        ├── messages/{en,vi,zh}.ts
        └── tsconfig.json     the screens: DOM and JSX
```

While the plugin is in your project, its source is what runs. An edit of a screen shows in `pnpm dev` without a reload. `pnpm build` checks the types of the backend and of the screens and builds one admin.

React, Ant Design and the shell are **optional** peer dependencies. A server installs the plugin without them. Keep the versions of the development dependencies equal to those of `apps/admin`: the build stops when it finds two copies of React.

## The admin part

`src/admin/index.ts` says what the plugin adds. The build reads it in Node.js, so it imports no screen and no style at the top: each screen is loaded with `import()` when it is drawn.

```ts
import { defineAdminPlugin } from '@bieberkit/admin-core';
import type { AdminPart, AdminView } from '@bieberkit/admin-core';

const part: AdminPart<AdminView> = defineAdminPlugin({
  name: 'bieberkit-plugin-notes', // the name of the package
  menu: [{ page: '/notes', group: 'content' }],
  pages: [{ path: '/notes', title: 'notes.title', permission: 'notes.read', load: () => import('./NotesPage.tsx') }],
  messages: { en: () => import('./messages/en.ts'), vi: () => import('./messages/vi.ts') },
});

export default part;
```

`load` answers a module whose default export is a React component.

### The slots

The list is closed. A plugin cannot change the frame, replace the layout or add a global style.

| Key             | What it adds                                          | The component gets                              |
| --------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `menu`          | An entry of the menu for a page of this plugin        | (no component)                                  |
| `pages`         | A page after sign in, at one segment such as `/notes` | nothing                                         |
| `headerActions` | A button in the header                                | nothing                                         |
| `notices`       | A notice over the frame                               | `NoticeProps`: `close`                          |
| `recordTabs`    | A tab of the detail of an entity, or of all with `*`  | `RecordTabProps`: `entity`, `id`, `row`         |
| `fields`        | The control of every field with a given widget        | `FieldProps`: `field`, `value`, `onChange`, ... |
| `homeBlocks`    | A block of the home page                              | nothing                                         |
| `accountTabs`   | A tab of "My account"                                 | nothing                                         |
| `publicPages`   | A page that opens without a session                   | nothing                                         |
| `signIn`        | The sign in. The `users` plugin gives it              | `SignInProps`: `onSignedIn`                     |
| `gates`         | A screen in place of the admin while `needed` says so | `GateProps`: `onDone`, `onSignOut`              |
| `screens`       | A replacement of a generic list or form               | `ScreenProps`: `entity`, `row`                  |

A field uses your control when the entity names its widget: `f.int().admin({ widget: 'rating' })` and `fields: [{ id: 'rating', widget: 'rating', load }]`.

### What a screen can use

All from `@bieberkit/admin-antd`:

- `useAdminClient()`: the client of the API, with the session. `client.request(method, path, { body })` calls your own routes. A refusal is an `AdminApiError` with a stable `code`.
- `useMeta()`, `useSession()`, `useCan(permission)`, `useLanguage()`.
- `useText()`: the texts of your plugin, as `text('notes.title', { count })`.
- `useAdminNavigate()`, `useAdminAddress()`, `<AdminLink to="/notes">`.
- `useNotice()`: one sentence for the sign in that follows.
- `<AuthShell>`, `<AuthLinks>`, `<CodeInput>`, `<GateShell>`, `<FolderArt>`, `<Icon>`, and the prop types of the slots.

Draw with Ant Design, so that the `theme` of the project changes your screens too. For styles of your own, use a CSS module (`*.module.css`) and the variables of the theme, such as `var(--bk-color-border)`. For data, use `@tanstack/react-query`: the admin has one cache.

### Rules

- **Permissions** hide what a person may not use. A page behind a permission says that it is not open, and its code is not loaded. The server stays the authority: every route checks its own permission.
- **Texts.** Each key begins with the short name of the plugin and a dot (`notes.`). English is the reference. Every language of the project that the admin has (`en`, `vi`, `zh`) needs the same keys.
- **Width and access.** A screen works at 360 px and meets WCAG 2.2 AA.
- **Failures.** A screen that throws shows a message in its own place, is reported, and leaves the rest of the admin.
- **Boundaries.** Reach another plugin through what its package exports, never through its files or its tables.

## When the build stops

`pnpm build` and `pnpm dev` stop on a wrong admin part and name the plugin. They list all problems at once.

| Code                    | Meaning                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `BK_ADMIN_PART_INVALID` | A part cannot be read, or has a mistake: see the list below                 |
| `BK_ADMIN_TWO_COPIES`   | The build found two copies of a shared package. Match the versions          |
| `BK_ADMIN_NOT_BUILT`    | The web role started with an `apps/admin` that was not built. Run the build |

The mistakes of a part are: a key that is no slot; an address that is not one segment, is of the shell (`/account`, `/ext`) or is taken; an id used twice; two plugins with texts and one short name; two controls for one widget or two replacements of one screen; a menu entry with no page; no sign in, or two; a text that is missing, extra or has the wrong prefix; a name that is not the one of the package; and a plugin that `apps/admin` does not depend on.

Your own screens that belong to no plugin go in `apps/admin/src/part.ts`, an admin part with the name `app`.

## Publish

```sh
cd plugins/notes
pnpm build   # backend, screens and the static manifest
pnpm publish
```

`publishConfig` makes the published package export the built JavaScript and types. Another project runs `pnpm bieberkit add bieberkit-plugin-notes`.
