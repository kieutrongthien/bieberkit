---
'@bieberkit/admin-antd': minor
'@bieberkit/admin-core': minor
'@bieberkit/http': minor
'@bieberkit/server': minor
'@bieberkit/plugin-users': minor
'@bieberkit/plugin-media': minor
'@bieberkit/plugin-audit-log': minor
'bieberkit': minor
'create-bieberkit': minor
---

<!--
  BieberKit

  @file        .changeset/plugin-owned-admin.md
  @description Changeset for the admin that a project builds from the admin parts of its plugins, with the upgrade of a project that exists (ADR 0040, UI-34 to UI-38).
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

**Breaking.** Each plugin ships its own screens, and a project builds its admin from its plugins (ADR 0040). `make:plugin` makes a plugin with a page in the admin; see `docs/guides/writing-a-plugin.md`.

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
