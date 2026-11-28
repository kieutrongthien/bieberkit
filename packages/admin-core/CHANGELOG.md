<!--
  BieberKit

  @file        packages/admin-core/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/admin-core.
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

# @bieberkit/admin-core

## 0.4.1

No changes in this release.

## 0.4.0

### Minor Changes

- a62b594: The admin has the account screens: the sign in with a second factor, a forgotten and a reset password, the invitation, setting up a second factor, and one's own profile, password, factor and sessions.

  What changes for a project:

  - A server now turns TOTP on. Nobody has to set it up unless a role or the security policy asks for it.
  - A password that is set through a link ends every session of the account, and turning the second factor on ends every other session.
  - With the admin installed, the links of an invitation and of a password reset by an administrator lead to `<admin>/reset-password`. Without the admin they lead where they did.
  - A holder of the administrator role may turn `requireMfa` of a system role on and off.
  - `GET /api/v1/users/me` also answers `mfaRequired`.
  - **Breaking:** `AdminClient.signIn` of `@bieberkit/admin-core` answers `{ kind: 'signedIn', user }` or `{ kind: 'secondFactor' }` in place of the user.

- f651cd1: The admin has an identity and a new frame (UI-23, UI-24): a grouped menu whose chosen entry joins the page, a breadcrumb, a box that goes to a page (Ctrl or Cmd and K), a menu of the account, a new sign in and folder tabs, with Be Vietnam Pro bundled (ADR 0039). A project can set its name, logo and sentence, and the order of its menu, with the new `admin` key of `bieberkit.config.ts` (UI-33).

  The default theme changed. The theme has two new colors, `frame` and `accent`, and the default radius is 10. A theme that sets `colors.primary` and no `colors.frame` gets a frame that is a dark tone of it. A project that built its own adapter and makes a `Theme` or a `ThemeColors` by hand has to give the two new colors.

- 3d9182a: **Breaking.** Each plugin ships its own screens, and a project builds its admin from its plugins (ADR 0040). `make:plugin` makes a plugin with a page in the admin; see `docs/guides/writing-a-plugin.md`.

  - There is no prebuilt admin. `@bieberkit/admin-antd` is a library: `apps/admin` calls `startAdmin(root, { parts })`, and `bieberkit build` builds it with Vite. A web role with an `apps/admin` that is not built stops with `BK_ADMIN_NOT_BUILT`.
  - A plugin gives screens through its export `./admin` (`defineAdminPlugin`). `definePlugin({ admin })`, the folder `admin` served under `/plugins/`, and `extensions` and `menu` of `_meta` are gone. `_meta` is `schemaVersion` 2.
  - The sign in and the account screens are in `@bieberkit/plugin-users`, the control of a file in `@bieberkit/plugin-media`, and the history tab in `@bieberkit/plugin-audit-log`, which a person needs `audit-log.read` to see.
  - `AdminClient` lost `signIn`, the calls of the password, the second factor, the sessions and the profile, the calls of files and `history`. It gained `request()`. The related functions and message keys left `@bieberkit/admin-core`.
  - The shell offers hooks, slot prop types and shared components to the screens of plugins.

  Also fixed: `migrate:make` writes the header of the project, and the image of a new project starts (its config saw no `node_modules`).

  **To upgrade a project that exists**, make a new project with `pnpm create bieberkit` at this version beside it, then:

  1. Copy its `apps/admin` folder into yours, keep your name in `apps/admin/package.json`, and add every plugin of your config to its `dependencies`.
  2. Remove `@bieberkit/admin-antd` from `apps/server/package.json`.
  3. In `pnpm-workspace.yaml`, add `dedupePeerDependents: false`, which keeps React out of the image of the server, and list `'plugins/*'` if you hold plugins there. In the root `tsconfig.json`, add `"apps/admin"` and `"plugins/*/src/admin"` to `exclude`, and `"plugins/*/src/**/*.ts"` to `include`.
  4. Copy its `Dockerfile` and `deploy/image.mjs`, or add their two new lines to yours.
  5. Move the screens that a plugin of yours declared in `definePlugin({ admin })` into its `./admin` export.
  6. Run `pnpm install`, then `pnpm bieberkit build`.

  `bieberkit start web` no longer serves an admin that you did not build.

## 0.3.0

### Minor Changes

- 301f5ab: A field may say when it is shown and when it is required: `f.string(...).optional().admin({ visibleWhen: { field: 'active', eq: false }, requiredWhen: { field: 'active', eq: false } })`. A condition is data (`eq`, `ne`, `in`, `set`, `all`, `any`, `not`). The routes of an entity drop a hidden field and refuse a required one at the field, on create, update and bulk update. `_meta` carries the conditions and the form follows them as the person types. `defineEntity` refuses a condition that names an unknown field.

- e7bea5b: A row that is opened has tabs: its form with the fields that the server fills and its moves, a child table for each entity that points at it (with a button for a new row that starts pointing at it), and its history from the audit log. `relatedOf`, `relatedFilter`, `prefillOf`, `readOnlyOf`, `historyOf` and `client.history` are in `@bieberkit/admin-core`.

- 28782a9: `f.file()` and `f.image()` make a field that holds the id of a media record. A write is refused at the field unless the file exists, is uploaded and is of a type that the field takes, `_meta` draws the field as a file, and the admin sends the file to the storage with a signed URL. The policy of the admin names the origin of the bucket in `connect-src` and `img-src` when the disk is S3. A disk that cannot sign (the local one) cannot take files from the browser.

- 3bdd7f9: `f.hasMany(() => Line).inline()` is now part of the record in the API: the body of a create and an update takes `lines: [{ id?, ... }]`, the answer gives them, they are saved in the transaction of the record with the permissions of the line entity, and a change of them moves the version of the record. `_meta` describes the collection and the admin edits it as a table inside the form. A save of a row now drops the cached row, which showed old values when the row was opened again.

- 241476e: The admin speaks English, Vietnamese and Chinese (UI-05). `@bieberkit/admin-core` exports the dictionaries, `translator`, `localeOf` and the formats of numbers, dates and money. `@bieberkit/admin-antd` has a language select in the header, keeps the choice in the browser, follows the language of the browser otherwise, and gives Ant Design its locale with the two Vietnamese texts that the library lacks.

- 207bf13: The generic list filters by the fields that the metadata marks `filterable`, with the operators that the API takes for each kind, and checks a filter before it sends it. Filters and sort live in the address, so a link opens the same list. A person keeps named views in the browser (per user and entity, at most 20). Rows can be selected and deleted in one bulk call (`client.bulk`, with the outcome of each row), and the list exports to CSV with formula escaping (IO-04), up to 10,000 rows.

- a0c784c: A row of a list shows the moves of its state field as buttons, and a move that asks for something opens a form made from the JSON Schema of its input, which `/api/v1/_meta` now sends for each transition. Selected rows can take one move or one value for a field in a single bulk call. A move shows in the list before the server answers and is taken back when it is refused. A form refuses a value that the schema of its field would refuse. `admin.list` and `admin.title` may name a relation by its field name, and `_meta` gives the key that the API sends (`owner` is `ownerId`).

- 580e729: Under 768 px the list is a stack of cards, and the frame folds its menu. `n` opens a new row and `/` goes to the filters. A person chooses 25, 50 or 100 rows a page. The dictionaries of Vietnamese and Chinese and the Ant Design locales of the two load when the language is chosen; `MESSAGES` is replaced by `loadMessages(locale)` and `ENGLISH`, and `translator` takes a dictionary.

- 1aa0d82: A plugin can add to the admin with the `admin` key of `definePlugin`: pages (with a menu entry), widgets for the dashboard and for the detail of an entity, controls for the fields that name them with `admin.widget`, and screens that replace the list or the form of an entity. Each is a `.js` file in the folder `admin` of the package, which the web role serves under the admin; the admin gives it React, Ant Design and its client. A contribution that is not valid, or a file that is missing, stops the boot with all the problems. `_meta` carries `extensions` and fills `menu`.

- a8b3cf2: The admin sends the errors that nothing caught, and the Core Web Vitals of a sample of the visits, to the new public route `POST /api/v1/_client-reports`. The server hands an error to the error reporter as a warning of the source `client` and counts a vital in the metrics. The report has no email, no long number and no id of a record.

- 4f88ebd: The admin keeps working when things go wrong. `@bieberkit/admin-core` exports the retry policy and backoff, the offline state, the detection of a missing chunk, dirty tracking, local drafts, the three-way merge of a conflict, the keyboard shortcuts and the builders of error and web-vital reports; `AdminApiError` carries the `current` row of a 412. `@bieberkit/admin-antd` loads each screen as its own chunk, has an error boundary for each route, an offline banner, an unsaved-change guard, a local draft of each form, Ctrl/Cmd+S, and a conflict view that shows who changed the row and which fields differ. `pnpm check:admin-size` measures the initial JavaScript against 400 kB.

- 0089e52: `.searchable()` on a string or an email folds it (`ci_ai` unless it says `ci`) and a list of an entity with a searchable, indexed field takes `q`: the rows where one of the fields starts with the text, whatever the case and the diacritics. `_meta` lists the searchable fields and the field that names a row of a relation. The admin picks a relation by typing, and a list names the related row. `include` together with `fields` gives the included row whole; it was a `500`.

## 0.2.0

No changes in this release.
