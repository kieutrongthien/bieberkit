<!--
  BieberKit

  @file        packages/http/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/http.
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

# @bieberkit/http

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

### Patch Changes

- Updated dependencies [e9e15e8]
  - @bieberkit/core@0.4.0
  - @bieberkit/data@0.4.0
  - @bieberkit/queue@0.4.0

## 0.3.0

### Minor Changes

- 34f5f66: Operations for an enterprise (OPS-01 to OPS-06). The mail and delete routes of the base plugins honor `Idempotency-Key`; a `DELETE` route may now be `idempotent`, and a 204 is replayed. Invitations and the audit export are limited per person (`limitActor`, `AUTH_ACTION_LIMITED`). `GET /api/v1/settings/export` and `POST /api/v1/settings/import?dryRun=true` carry settings between environments, with secrets left out. `MEDIA_AUDIT_DOWNLOADS=true` audits the reading of private files. New indexes keep the lists of users and of the audit log off full scans (data step 0.5.0, auth migration 0.7.0), and `@bieberkit/testing` exports `planOf`, `fullScans` and `analyze` for tests of a query plan. The lists of users, media and the audit log are tested at 100 000 rows on the three dialects.

- 20908d4: Security policies (POL-01 to POL-05). `@bieberkit/auth` declares the `security.*` settings and reads them on every request through a `PolicyReader` port that `@bieberkit/server` fills from the settings service (ADR 0031). The authenticator enforces an idle and an absolute session limit (`AUTH_SESSION_EXPIRED`), a second factor for everyone with a grace period (`AUTH_MFA_ENROL_REQUIRED`, `mfaEnrolBy` in `GET /users/me`) and a network allowlist for roles flagged `ipRestricted` (`AUTH_NETWORK_DENIED`, audited, fail closed). Sign in revokes the oldest sessions beyond `security.session.max-concurrent` and mails a notice for a new device.

  Auth migration 0.7.0 adds `bk_auth_roles.ip_restricted` and the table `bk_auth_known_devices`. The roles routes take and return `ipRestricted`. `defineSetting` accepts a `guard`, and the settings service refuses a change that locks the person out with `SETTINGS_SELF_LOCKOUT`. `Principal` gains `mfaEnrolBy`.

  Setting keys are kebab-case, so `security.session.idle-minutes` and not `idleMinutes`.

  Managed identities and delegated administration (IDN-02, IDN-03, ROL-09). A user whose `source` is not `local` cannot be renamed, re-mailed, disabled or enabled through the users routes (`USERS_MANAGED_EXTERNALLY`) without the new permission `users.override-external`. The user service gives provider plugins `upsertExternalUser` and `setExternalDisabled`. A role can be assigned for one group only (`groupId`), users have groups (`PUT /users/:id/groups`), and a manager whose roles are limited to groups reaches the users of those groups only (`USERS_OUT_OF_SCOPE`). The users detail has `groups`. Auth migration 0.7.0 also adds `bk_auth_user_roles.scope_group` and `bk_auth_user_groups`.

- 16b7239: Entity extensions (PLG-06). A module or plugin adds fields to an entity of another module with `extends: { 'crm.Account': defineExtension({ table, fields, permissions? }) }`. The fields live in a table of the extending plugin (one row for each row of the target, deleted with it), never in the table of the target, and they appear in the create, update, list and detail routes, the field masks, `_meta`, OpenAPI and the generated types of the target. A change of only extension fields moves the `version` of the record. A filter or a sort by an extension field is not supported yet. `@bieberkit/data` exports `defineExtension`, `resolveExtensions`, `extensionsOfSchema` and the read and write helpers, `@bieberkit/server` exports `entitiesOf` and `extensionRefsOf`, `compileEntities` takes `extensions`, and the manifest `tables` of a plugin lists its extension tables, so `bieberkit remove` lists and drops them. Boot errors: `DATA_EXTENSION_TARGET_UNKNOWN`, `DATA_EXTENSION_FIELD_CLASH`, `DATA_EXTENSION_TABLE_CLASH`, `DATA_EXTENSION_INVALID`.

- 7c9da65: The web role keeps the hashed files of the previous release of the admin for 24 hours after a deploy, in `ADMIN_ASSETS_DIR` (`data/admin-assets` by default), and serves a hashed file that its build lacks from there, so a tab that was open at a rolling deploy still finds its chunks. `serveStatic` takes a `retained` folder.

- 301f5ab: A field may say when it is shown and when it is required: `f.string(...).optional().admin({ visibleWhen: { field: 'active', eq: false }, requiredWhen: { field: 'active', eq: false } })`. A condition is data (`eq`, `ne`, `in`, `set`, `all`, `any`, `not`). The routes of an entity drop a hidden field and refuse a required one at the field, on create, update and bulk update. `_meta` carries the conditions and the form follows them as the person types. `defineEntity` refuses a condition that names an unknown field.

- 28782a9: `f.file()` and `f.image()` make a field that holds the id of a media record. A write is refused at the field unless the file exists, is uploaded and is of a type that the field takes, `_meta` draws the field as a file, and the admin sends the file to the storage with a signed URL. The policy of the admin names the origin of the bucket in `connect-src` and `img-src` when the disk is S3. A disk that cannot sign (the local one) cannot take files from the browser.

- 3bdd7f9: `f.hasMany(() => Line).inline()` is now part of the record in the API: the body of a create and an update takes `lines: [{ id?, ... }]`, the answer gives them, they are saved in the transaction of the record with the permissions of the line entity, and a change of them moves the version of the record. `_meta` describes the collection and the admin edits it as a table inside the form. A save of a row now drops the cached row, which showed old values when the row was opened again.

- a0c784c: A row of a list shows the moves of its state field as buttons, and a move that asks for something opens a form made from the JSON Schema of its input, which `/api/v1/_meta` now sends for each transition. Selected rows can take one move or one value for a field in a single bulk call. A move shows in the list before the server answers and is taken back when it is refused. A form refuses a value that the schema of its field would refuse. `admin.list` and `admin.title` may name a relation by its field name, and `_meta` gives the key that the API sends (`owner` is `ownerId`).

- 1aa0d82: A plugin can add to the admin with the `admin` key of `definePlugin`: pages (with a menu entry), widgets for the dashboard and for the detail of an entity, controls for the fields that name them with `admin.widget`, and screens that replace the list or the form of an entity. Each is a `.js` file in the folder `admin` of the package, which the web role serves under the admin; the admin gives it React, Ant Design and its client. A contribution that is not valid, or a file that is missing, stops the boot with all the problems. `_meta` carries `extensions` and fills `menu`.

- 0089e52: `.searchable()` on a string or an email folds it (`ci_ai` unless it says `ci`) and a list of an entity with a searchable, indexed field takes `q`: the rows where one of the fields starts with the text, whatever the case and the diacritics. `_meta` lists the searchable fields and the field that names a row of a relation. The admin picks a relation by typing, and a list names the related row. `include` together with `fields` gives the included row whole; it was a `500`.

### Patch Changes

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
- Updated dependencies [c90bf7e]
- Updated dependencies [34f5f66]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [7c9da65]
- Updated dependencies [301f5ab]
- Updated dependencies [28782a9]
- Updated dependencies [3bdd7f9]
- Updated dependencies [1aa0d82]
- Updated dependencies [0089e52]
  - @bieberkit/data@0.3.0
  - @bieberkit/core@0.3.0
  - @bieberkit/queue@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [480c563]
  - @bieberkit/queue@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
