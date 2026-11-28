<!--
  BieberKit

  @file        packages/cli/CHANGELOG.md
  @description Release history generated from changesets for bieberkit.
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

# bieberkit

## 0.4.0

### Minor Changes

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

- f649fa2: A new project builds and migrates again:

  - `bieberkit.config.ts` of a new project, and the module of `make:module`, declare the type of their default export, which `isolatedDeclarations` asks for (`TS9037`).
  - The generated client no longer names `RequestCredentials`, a type of the DOM that a project of a server does not load.
  - The root of a new project declares `@bieberkit/data`, which its migrations import. Without it `bieberkit migrate` failed with `Cannot find package '@bieberkit/data'`.

  A project that exists adds `@bieberkit/data` to the `devDependencies` of its root, and in `bieberkit.config.ts` writes `const config: ProjectConfigInput = defineConfig({ ... }); export default config;`.

- Updated dependencies [f649fa2]
- Updated dependencies [a62b594]
- Updated dependencies [f651cd1]
- Updated dependencies [e9e15e8]
- Updated dependencies [3d9182a]
  - create-bieberkit@0.4.0
  - @bieberkit/auth@0.4.0
  - @bieberkit/http@0.4.0
  - @bieberkit/server@0.4.0
  - @bieberkit/admin-core@0.4.0
  - @bieberkit/core@0.4.0
  - @bieberkit/data@0.4.0
  - @bieberkit/queue@0.4.0

## 0.3.0

### Minor Changes

- b7300dc: Audit for an enterprise (AUD-07 to AUD-09). `AUDIT_LOG_MIRROR=true` copies every audit entry to the log after commit as one line with `audit: true`, through the outbox and a worker job. The entries list and the export take `after=<id>` to read oldest first, each entry once, with `meta.nextAfter` to resume. Legal holds (`POST`, `GET` and `DELETE /api/v1/audit-log/holds`, new permission `audit-log.hold`) keep entries from `bieberkit audit:prune`, which now says how many it kept. Data migration step 0.5.0 adds the table `bk_audit_holds` (ADR 0032). `pruneAuditLog` returns `kept`, and `createDatabase` takes `auditMirror`.

- 88a425e: The audit log is complete on the API side (AUD-01 to AUD-06). The entries list filters by time, action (exact or `prefix*`), entity, record, actor and request. Reads stay inside the tenant of the request. `GET .../entries/:id` returns one entry, and every entry carries its `actor`. `GET .../export?format=csv|ndjson` streams up to `AUDIT_LOG_EXPORT_MAX_ROWS` entries, escapes formula cells, sets `X-Export-Truncated` when it cuts, and is audited itself (new permission `audit-log.export`). `GET .../actions` lists the distinct actions.

  Retention: `bieberkit audit:prune --before <date>` counts first and, with `--yes`, deletes on `MIGRATE_DATABASE_URL` and writes `audit.pruned`. It runs `pruneAuditLog` from `@bieberkit/data/orm` through `pruneAudit` from `@bieberkit/server`.

  Fix: a project loaded a plugin whose short name has a dash (`audit-log`) with the env prefix `AUDIT-LOG_`, while `definePlugin` checks `AUDIT_LOG_`, so such a plugin with env keys could not boot. `@bieberkit/server` now uses `envPrefixOf`, which `@bieberkit/core` exports.

  Breaking for clients of the thin slice: the entries list takes `pageSize` in place of `limit` and answers `meta.nextCursor` in place of `nextCursor`. In a tenant it now shows that tenant's entries only.

- bf916e3: Expand then contract (DATA-08): a deploy is now named. The new env key `DEPLOY_ID` and the flag `bieberkit migrate --deploy-id` give every run of one release the same id, so a retry, or a second migrate role that waited for the lock, can no longer finish a contract step that the first run refused. Without it each run still gets a random id. `BK_MIGRATE_REFUSED` lists the steps that wait behind a refused one, `@bieberkit/data` exports `CONTRACT_SAME_DEPLOY`, and `bieberkit check plugin-steps` warns about a contract step with no `after` (`BK_STEP_CONTRACT_NO_AFTER`).

- 16b7239: Entity extensions (PLG-06). A module or plugin adds fields to an entity of another module with `extends: { 'crm.Account': defineExtension({ table, fields, permissions? }) }`. The fields live in a table of the extending plugin (one row for each row of the target, deleted with it), never in the table of the target, and they appear in the create, update, list and detail routes, the field masks, `_meta`, OpenAPI and the generated types of the target. A change of only extension fields moves the `version` of the record. A filter or a sort by an extension field is not supported yet. `@bieberkit/data` exports `defineExtension`, `resolveExtensions`, `extensionsOfSchema` and the read and write helpers, `@bieberkit/server` exports `entitiesOf` and `extensionRefsOf`, `compileEntities` takes `extensions`, and the manifest `tables` of a plugin lists its extension tables, so `bieberkit remove` lists and drops them. Boot errors: `DATA_EXTENSION_TARGET_UNKNOWN`, `DATA_EXTENSION_FIELD_CLASH`, `DATA_EXTENSION_TABLE_CLASH`, `DATA_EXTENSION_INVALID`.

- 0e925c7: `bieberkit plugins` shows the dependency graph: each plugin with what it requires (and the range), what requires it, and the tables and routes that it owns, and `--json` adds the edges. The new `bieberkit make:plugin <name>` makes a plugin package with an entity, its permissions, a test and its static manifest, which passes `bieberkit build --check` as it is. `bieberkit remove` reads what the plugin owns from its manifest, and a failing pnpm or a cancelled question now leaves the config, the example and the migrations as they were.

- 18c8fe6: `bieberkit check boundaries` (PLG-01) now refuses a relative path, or a path through `node_modules`, into the files of another plugin package that are not its entry, understands `exports` patterns, knows a plugin by its keyword or its static manifest, and lets a plugin import its own files. The new rule `bieberkit check plugin-tables` (PLG-02) refuses a plugin that queries a table of another plugin (`BK_PLUGIN_TABLE_QUERY`) or gives an entity of another plugin to the entity manager (`BK_PLUGIN_ENTITY_QUERY`). It is a static check that reads the plugins from their `package.json`, and it says what it cannot see.

### Patch Changes

- 288b6b4: Settings are declared (ADR 0030). `@bieberkit/core` exports `defineSetting` and `SettingDef`, and a plugin or module contributes `settings: [...]`; `definePlugin` checks the key prefix. The settings plugin serves the `settings` service (`get(def)` typed by the declaration, cached and flushed after commit, `set`, `reset`) and the routes `GET /api/v1/settings/settings`, `GET/PUT/DELETE .../:key` and `GET /api/v1/settings/public`. Secrets are encrypted with `APP_KEY` and never returned. Tenant values fall back to the global value, then to the default.

  Breaking for clients of the thin slice: the generated entity routes of `settings.Setting` are gone, and an undeclared key is `SETTINGS_UNKNOWN_KEY`. The `bk_settings` table gains `scope` and `secret_value`, and its key is unique for each scope, which a project picks up with `migrate:make`. Server and seed now give the database the key ring of `APP_KEY`, and the test client gains `put`.

- 93599a4: `pnpm create bieberkit` asks with arrow keys, as create-vite does: the name, the database, the template and extra plugins when there is a choice, the admin, the license, the install and git, then a summary to confirm. Writing, installing and git run under spinners. Flags, `--yes` and `--json` are unchanged. The kit's `Ask` function is replaced by a `Prompts` port, with `terminalPrompts()` and `scriptedPrompts()` for tests; `bieberkit remove` and `bieberkit backup:verify` ask through it. `@clack/prompts` is bundled into `dist`, so the install gains no package.

- Updated dependencies [b7300dc]
- Updated dependencies [88a425e]
- Updated dependencies [1ba8b1a]
- Updated dependencies [c90bf7e]
- Updated dependencies [34f5f66]
- Updated dependencies [20908d4]
- Updated dependencies [288b6b4]
- Updated dependencies [210b082]
- Updated dependencies [31f9423]
- Updated dependencies [bf916e3]
- Updated dependencies [16b7239]
- Updated dependencies [7c9da65]
- Updated dependencies [301f5ab]
- Updated dependencies [28782a9]
- Updated dependencies [3bdd7f9]
- Updated dependencies [a0c784c]
- Updated dependencies [1aa0d82]
- Updated dependencies [a8b3cf2]
- Updated dependencies [0089e52]
- Updated dependencies [42f5218]
- Updated dependencies [93599a4]
  - @bieberkit/data@0.3.0
  - @bieberkit/server@0.3.0
  - create-bieberkit@0.3.0
  - @bieberkit/core@0.3.0
  - @bieberkit/queue@0.3.0
  - @bieberkit/http@0.3.0
  - @bieberkit/auth@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [7e00afe]
- Updated dependencies [480c563]
  - @bieberkit/auth@0.2.0
  - @bieberkit/queue@0.2.0
  - @bieberkit/server@0.2.0
  - @bieberkit/http@0.2.0
  - @bieberkit/core@0.2.0
  - create-bieberkit@0.2.0
  - @bieberkit/data@0.2.0
