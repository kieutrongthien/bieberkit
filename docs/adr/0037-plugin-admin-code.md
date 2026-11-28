<!--
  BieberKit

  @file        docs/adr/0037-plugin-admin-code.md
  @description Decision record: a plugin adds pages, widgets and screens to the admin as ES modules of its own folder that the web role serves, and the admin gives them React, Ant Design and its client.
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

# 0037. A plugin adds code to the admin as modules that the web role serves and the admin loads

- Status: Superseded by 0040
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: UI-04, UI-10, UI-14, UI-19, UI-21, PLG-01, PLG-07, SEC-01, P1, P9

## Context

UI-04 says that a field can use a custom widget, a screen can be replaced by a custom page, and plugins add pages and dashboard widgets. Spec 11.1 and 11.3 name the key `admin` (menu, pages, field panels, dashboard widgets). The admin is one application that is built once and served as static files (ADR 0025, UI-14), with a policy that allows scripts of its own origin only (`script-src 'self'`, SEC-01). A plugin is an npm package that is installed in a project and has no part in the build of the admin. So a plugin cannot be bundled into the admin, and the code that it adds has to reach the browser some other way.

Constraints:

- **No inline script, no other origin** (SEC-01): the code must come from the origin of the admin.
- **One React.** A component that uses hooks must run with the React of the application that draws it. A second copy breaks every hook.
- **A plugin must not take the admin down** (UI-19), and its errors are reported (UI-21).
- **Permissions** are those of the API; what a person may not use is not shown (META-04).

## Options

| Option                                                                                                               | For                                                                                                | Against                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A. ES modules in the folder `admin` of the plugin, served under the admin, loaded with `import()`; the host is given | No build of the admin per project; CSP unchanged; one React; the plugin chooses its own build tool | A module is written against a small contract (`host.ui`), not against imports of React and Ant Design              |
| B. Rebuild the admin in the project with the plugins as imports                                                      | Plugins are ordinary imports with types                                                            | Every project needs the admin toolchain; breaks "one built application" and the 400 kB budget check; slow upgrades |
| C. Metadata only: pages described as forms and tables of the API                                                     | Nothing to load                                                                                    | Cannot draw a chart or a custom control, which is the point of UI-04                                               |
| D. An `iframe` per plugin page                                                                                       | Isolation                                                                                          | A second policy, a second theme, a second session story; no shared controls; `frame-ancestors 'none'` is the rule  |

## Decision

Option A.

1. **The key.** `definePlugin({ admin: { pages, widgets, screens } })`, typed by `@bieberkit/http` (declaration merging of `ModuleContributions`).
   - `pages`: `{ path, module, title, menu?, permission? }`, drawn at `/ext/<plugin>/<path>`, in the menu when `menu` is true. `path` is one segment.
   - `widgets`: `{ slot, module, title?, permission? }`. A slot is `dashboard` (the first page), `form:<module.Entity>` (a tab of the detail) or `field:<name>` (the control of every field with `admin.widget` of that name).
   - `screens`: `{ replace, module, permission? }` with `list:<module.Entity>` or `form:<module.Entity>`.
2. **The files.** `module` names a `.js` file of the folder `admin` of the package of the plugin (no path, no `..`). The web role serves that folder at `<admin>/plugins/<short name>/` with the policy of the admin, no application fallback, and nothing outside the folder. The plugin builds the files with the tool that it likes; `bieberkit build` does not build them in this slice.
3. **The check.** At boot, the contributions of every plugin are validated together with the files that they name, and a mistake stops the boot with all the problems (`BK_ADMIN_CONTRIBUTION_INVALID`). A page, a widget and a screen that a person has no permission for are left out of `/api/v1/_meta`, and so are the menu entries that come from the pages.
4. **The contract.** A module has a default export: a function that takes the host and answers a component. The host is `{ ui: { React, antd }, client, locale, navigate, text }`. The plugin has no copy of React or Ant Design. The props of the component depend on the slot (`entity` and `row` for a panel and a screen, `field`, `value`, `onChange`, `id` and `label` for a control). The type is `AdminHost` of `@bieberkit/admin-core`, so another adapter gives its own `ui`.
5. **The safety.** Each module is drawn inside an error boundary of its own: a module that does not load, or that throws, shows a message where it was, is reported (UI-21), and leaves the rest of the screen as it is. A module is code of the origin, with the rights of the admin; the plugins that a project installs are trusted as much as its dependencies (SEC-14 for how they are installed).

## Consequences

- **Easier.** A plugin can add a report, a chart, a panel or a control with one line of declaration and one file, and the project does not build the admin.
- **Harder.** A module is checked by its author's tests, not by the type system of the admin, except through `AdminHost`. A module uses `host.ui.React.createElement` unless the author's build maps the JSX of its tool to it.
- **Ruled out.** Code of a plugin from another origin, an `iframe`, and a rebuild of the admin per project.
- **Follow-ups.** `bieberkit build` and `make:plugin` for the folder `admin`; a manifest list of the pages (`PLG_COLLISION_ADMIN` cannot happen yet, because the address of a page has the name of its plugin); a typed JSX runtime for modules; dashboards with the layout of a person.

## Spec changes

- UI-04 and 11.1/11.3: the shape of the `admin` key and the contract of a module.
- META: `_meta` carries `extensions` (pages, widgets, screens) and fills `menu`.
- Document history.
