<!--
  BieberKit

  @file        docs/adr/0040-plugin-owned-admin.md
  @description Decision record: each plugin ships its own admin UI, the shared admin packages hold only what is shared, and a project builds its admin from its list of plugins.
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

# 0040. A plugin ships its own admin UI, and a project builds its admin from its plugins

- Status: Accepted
- Accepted: 2026-11-28, by delegation: the maintainer chose the direction and then asked the engineer to approve the record and carry it out ("duyệt giùm tôi rồi thực hiện đi"). Approved after the spike below passed.
- Date: 2026-11-28
- Deciders: Bieber Kieu
- Requirements: UI-34 to UI-38, UI-04, UI-10, UI-12, UI-14, UI-25, DEP-06, PLG-01, PLG-03, PLG-05, PLG-07, P1, P9

## Context

The maintainer asks that a plugin is a piece that plugs in wherever something is needed, in the backend and in the admin: the screens of a feature live in its plugin, and the shared admin packages hold only what is shared. It must work well for a plugin that a person writes in a project made by `pnpm create bieberkit`, which has only the published, built packages. The author of a plugin writes its screens, inside limits: on enabling the plugin, its features appear in the BieberKit layout.

The code goes another way. ADR 0025 builds one admin inside `@bieberkit/admin-antd`, and a project builds none. ADR 0037 lets a plugin add prebuilt `.js` modules that import neither React nor Ant Design, to a few slots that all need a session. So the screens of the base plugins went into the shared packages: the account screens (UI-26), the upload of a file (media) and the history of a record (audit-log).

## Options

| Option                                                                                                            | For                                                                                                                                                                                 | Against                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Compose at build time: a plugin exports `./admin`; the project builds one admin from the plugins of its config | TSX and types as usual; unused code is dropped and chunks are shared; one React; the source of a local plugin is compiled with hot reload; it is what spec 16.6 and DEP-06 describe | A project builds a frontend and has Vite as a dev dependency; adding a plugin needs a build; `create`, `dev` and the Dockerfile change                                   |
| B. Compose at run time: extend ADR 0037; each plugin builds its own bundle and the prebuilt admin loads it        | A project builds no frontend; adding a plugin needs a restart only                                                                                                                  | The host must hand whole libraries to plugins; each author needs a build and a watcher of their own; a version mismatch shows at run time; types cover the contract only |
| C. Keep the screens in the shared packages                                                                        | No work                                                                                                                                                                             | Not what is asked; a third-party plugin never has what a first-party one has                                                                                             |

## Decision

Option A.

1. **One list, both sides.** A plugin has a backend (`definePlugin`, as today) and an optional admin part, the export `./admin`. A line of `plugins` in the config attaches both. Removing the line removes both; the data stays (PLG-03). There is no switch that turns a plugin off while the application runs.
2. **Shared means shared.** `@bieberkit/admin-core` and `@bieberkit/admin-antd` hold the shell, the generic screens, the theme and shared components. They name no first-party plugin. `@bieberkit/admin-antd` is published as a typed library that a project builds from.
3. **Controlled extension.** The admin part is a declaration of what the plugin has and in which slot of a closed list it goes (UI-35). It does not patch the shell, replace the layout or write global styles. The shell owns the layout, the menu, permissions, routes, lazy loading, languages and an error boundary for each contribution (UI-36). A wrong declaration stops the build with every problem.
4. **One door.** A first-party plugin and a plugin of a person use the same public, versioned API. There is no `auth-ui` plugin: the account screens belong to `users`.
5. **Authors are first class.** In a new project, `make:plugin` makes a plugin with both parts, wired in; `dev` shows an edit with no manual build; the same package can be published (UI-38). A test that installs packed tarballs outside the repository proves it.
6. **The policy stays.** The admin is still static files with the policy of UI-14: no inline script and no other origin.

The shape of the API is in [plugin-admin.md](../modules/plugin-admin.md). Its names are proposals: the public API of `definePlugin` belongs to the maintainer.

## Evidence

- Measured on the build of 2026-11-28: the chunk `Plugins` of the admin is **235 kB** compressed (the initial JavaScript is 330.5 kB). Its source imports the whole of Ant Design (`import * as AntD`) to hand it to modules, which is the likely reason; the chunk was not taken apart. Under B, a sign in that a plugin draws would need what this chunk holds.
- Read in the code, not run, what a plugin of a new project meets today: `make:plugin` writes to `plugins/`, but the workspace of `create` lists `apps/*` and `packages/*`; the build script of the plugin calls `tsdown`, which neither declares; the server resolves a plugin to its `dist`; there is no admin part.
- The browser tests link the packages of the repository into the project, so they cannot find those.
- **The spike, passed on 2026-11-28** (Node 26, pnpm 12.21.0; sources in `bieberkit-spikes/plugin-admin-spike`, outside the repository). All 26 packages were packed, and a project was created outside the repository from the tarballs alone. A stand-in shell took the place of `@bieberkit/admin-antd` as a library, which does not exist yet.
  1. Node ran the `.ts` backend of the local plugin through its workspace link, with no `dist`: its route answered 401 without a session, and an unknown route 404.
  2. Vite built one admin from a published admin part (built TSX, packed) and a local one (TSX source): one copy each of React, ReactDOM, Ant Design and the shell, and a lazy chunk for each page. Under the policy of UI-14, word for word, a browser drew both pages, both used the context of the shell and their hooks, and the console had no error.
  3. In `vite dev`, an edit of the local screen showed after **78 ms**, with no full reload and the state of the component kept.
- **Found by the spike, and binding on the build:** with a plugin that asks for React 19.3.0 beside 19.3.1, Vite put **two copies of React** in the build; with `resolve.dedupe` it put one. A plugin in a project must export its source, and `publishConfig` must turn the exports to `dist` (shown for a packed plugin). A plugin whose peer dependencies are `*` with no dev dependencies made pnpm fetch the placeholder `0.0.0-stage` from npm.
- **Not shown:** the real `@bieberkit/admin-antd` as a library (its CSS, fonts and size), and whether `bieberkit dev` restarts the server and regenerates the types after an edit in `plugins/`. The spike turned `blockExoticSubdeps` off in its own project only, because tarballs stood in for the registry.
- **Also found, and fixed apart from this decision:** every new project failed `bieberkit build` on two type errors, and `bieberkit migrate` because its root did not declare `@bieberkit/data`.

## Consequences

- **Easier.** A screen of a plugin is ordinary React with types. A feature is added or removed in one place. The shared packages stop growing with each plugin.
- **Harder.** The build keeps one copy of React, Ant Design and the shell (`resolve.dedupe`) and fails when it cannot. A project has a frontend build. The admin API of plugins is public and needs versions. A plugin screen is written for the Ant Design adapter; another adapter (UI-10) needs its own screens, so a plugin keeps its logic free of UI libraries.
- **Dependencies.** A project gains `vite` and `@vitejs/plugin-react` as dev dependencies, the versions that ADR 0025 approved (VoidZero and the Vite team, MIT).
- **Ruled out.** Screens of one plugin in a shared package, a second way for first-party plugins, and code of a plugin loaded at run time from outside the build.
- **ADR 0037** is `Superseded by 0040`. Of ADR 0025, "one built application and no build in the project" is replaced; the stack stays. The code follows both until the items of M2.2 land.

## Spec changes

UI-34 to UI-38 are new. UI-03, UI-04, UI-10, UI-11, UI-24 to UI-32, the CLI table (`make:plugin`), 11.1, 11.3 and 12 change. 16.6 and DEP-06 already say this. Spec 0.8.40.

## Follow-ups

The items of "Plugin-owned admin UI" in M2.2 of the roadmap.
