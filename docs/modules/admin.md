<!--
  BieberKit

  @file        docs/modules/admin.md
  @description Module spec of the thin admin of M1.8: @bieberkit/admin-core (the headless client and the screens from metadata), @bieberkit/admin-antd (login, list, form) and how the web role serves it, at the address that `ADMIN_URL` gives.
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

# The admin (thin slice)

- Packages: `@bieberkit/admin-core` (headless, no dependency), `@bieberkit/admin-antd` (React, Ant Design, the built application), and `serveStatic` of `@bieberkit/http` and `registerAdmin` of `@bieberkit/server`.
- Spec sections: UI-01, UI-02, UI-03, UI-08, UI-10, UI-14, UI-15, UI-18, SEC-01, section 21. ADR 0025.
- Status: **Done in M1.8.** The login is what the roadmap calls `auth-ui`.

## What it does

A person opens the admin (`/admin/` unless `ADMIN_URL` says another address), signs in with the account of the seed, sees the entities that the roles let them read, and lists, makes, changes and deletes rows from screens that are drawn from the metadata of `/api/v1/_meta`. There is no screen to write for an entity: a plugin or a module that declares an entity with `api` and `admin` settings has its screens.

## Parts

| Part                                                                                      | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createAdminClient({ baseUrl?, fetch? })`                                                 | The session (`/api/auth/get-session`, sign in, sign out), the metadata, and the list, get, create, update and delete of an entity. A failure is one `AdminApiError` with the status, the stable code, the fix and the `problems` of each refused field. `update` and `remove` send `If-Match` with the version that was read (API-13)                                                                                                                                          |
| `columnsOf`, `formFieldsOf`, `listFields`, `initialValues`, `bodyOf`, `labelOf`, `allows` | The pure functions that turn the metadata of an entity into the columns, the fields of the form, the keys that the list asks for (`fields=`, UI-15), the body of a save, and whether the user may create, change or delete                                                                                                                                                                                                                                                     |
| `@bieberkit/admin-antd`                                                                   | The application: the gate (nobody sees anything before the session says who signed in), the frame (the menu of the entities that the user may read, the user, sign out), the login, the list (page and sort of the API, a link to each row, delete after a question), the form (a control for each widget, the refusals of the API at the field, a 412 shown as "someone else changed this row"). Routes under `/admin` with TanStack Router, server state with TanStack Query |
| `serveStatic(server, { prefix, directory, policy })`                                      | Files of a folder under a prefix with their types, `no-cache` for the page, one year for the hashed files of `assets/`, the page for a path with no file and no extension (so a reload on a route works), 404 for a missing file with an extension, 405 for a method that writes, and no path that leaves the folder                                                                                                                                                           |
| `registerAdmin(server, root, location)`                                                   | Serves `dist/app` of `@bieberkit/admin-antd` at `location` when the package is in the `node_modules` of `apps/server` or of the root. A project made by `create` has it (`--no-admin` leaves it out)                                                                                                                                                                                                                                                                           |
| `adminLocation(APP_URL, ADMIN_URL)`                                                       | Reads where the admin is: its origin, its host when it has one of its own, and its path. See the next section                                                                                                                                                                                                                                                                                                                                                                  |

## Where the admin is (`ADMIN_URL`)

| `ADMIN_URL`                     | The admin is at                                                 |
| ------------------------------- | --------------------------------------------------------------- |
| not set                         | `APP_URL` and `/admin`                                          |
| `https://example.com/panel`     | any path of the application, such as `/panel` or `/back/office` |
| `https://example.com`           | the root of the application itself                              |
| `https://admin.example.com`     | the root of a host of its own, answered for that host only      |
| `https://admin.example.com/ops` | a path of a host of its own                                     |

The build knows none of this. Vite writes every file with a relative address, and the server, when it sends the page, writes the address of each file and a `<meta name="bk-admin-base">` that the router reads for its base path. A path is a mount of the server, and the root of a host is a fallback that answers a GET or a HEAD that no route matched, and never for `/api/`, `/health/` and `/metrics`. A host of its own is the same server under another name: a proxy (the generated Caddyfile does it with `ADMIN_ADDRESS`) sends both names to the web role. The session cookie belongs to one host (`__Host-`), so the admin signs in on its own host, calls the API on that host without CORS, and its origin is a trusted origin of Better Auth. An address that is not a place (a query, a fragment, a login, a scheme that is not http, a path of the server) stops the boot with `BK_ADMIN_URL_INVALID`.

## The policy of the admin (UI-14, SEC-01)

`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. The API keeps `default-src 'none'`. The one concession, `style-src 'unsafe-inline'`, is for the style elements that Ant Design writes at run time (ADR 0025). The browser test fails on any policy violation.

## Decisions

1. **One built application in the package, no build in the project.** The application is metadata driven, so it is the same for every project. `bieberkit build` has nothing to build for it, and an upgrade of the package is an upgrade of the admin. A project that wants other screens replaces the adapter (UI-10), and UI-04 (custom widgets and pages) is a later slice.
2. **The session is the cookie.** The client keeps no token. A request from the page is same-origin, so the fetch metadata that the CSRF check reads is the browser's own (SEC-03).
3. **The list asks for the columns only, and never for `id` and `version`.** The API sends those two with any selection and refuses them in `fields=`.
4. **A query never answers `undefined`**, so "nobody is signed in" is `null` (TanStack Query rule).

## Not in this slice

Saved views, filters, bulk actions, export (UI-03), detail tabs and activity, TanStack Table, Form and Virtual, the three languages (UI-05, the screens are in English), the theme tokens (UI-06), accessibility checks with axe (UI-07), the 360 px card layout (UI-16), the drafts and shortcuts of forms (UI-17), the 412 screen that shows what changed (UI-18, only the warning), the error boundaries (UI-19), lazy chunks per screen (UI-12; the bundle is one file of 1.2 MB, 383 kB gzipped), and prefetch and realtime (UI-13). The menu comes from the entities and not from `menu` of the metadata, which no plugin fills yet.

## Tests

`admin-core`: `client.test.ts` (the session, the sign in and out, the list with its paging, sort and fields, the writes with `If-Match`, the problems as one error), `screens.test.ts` (columns, form, defaults, the body of a save, permission). `http`: `static.test.ts` (types, cache, binary files, the page and its policy, the fallback, traversal, methods). `server`: `admin.test.ts` (the location of the admin), `boot.test.ts` (the admin is served with its policy when the adapter is installed, and not otherwise; at any path, on a host of its own and for that host only; a sign in from that host; Better Auth and the metadata in the web role). The browser tests are `e2e/admin.spec.ts` and `e2e/admin-subdomain.spec.ts`, which signs in at the root of `admin.localhost` on a second server (`pnpm build`, then `pnpm test:e2e`; `pnpm exec playwright install chromium` once): a wrong password, the sign in, the menu, a setting made, refused for a repeated key, changed and deleted, a reload on a route, and sign out, with no policy violation.

## The theme (UI-06, TOK-01 to TOK-03)

`theme` in `bieberkit.config.ts` is validated by `themeSection` of `@bieberkit/tokens` (the server declares the key and passes the section), and `parseTheme` gives the resolved theme: the colors of the light palette, the dark palette (brand colors from the light one, dark neutrals), the radius, the spacing, the fonts (a font of the config goes in front of the default stack) and the dark mode. The web role puts it in the page of the admin as `<meta name="bk-theme">` (escaped JSON) and as a `<style id="bk-theme">` with the `--bk-*` variables, which the policy allows. The adapter reads it with `readTheme` (a missing or broken value is the default theme, so the admin always opens), picks the palette with `modeOf` (the system setting for `auto`, kept up to date) and gives `compileAntdTheme(theme, mode)` to the `ConfigProvider` with the matching algorithm of Ant Design. Tests: `tokens/src/theme.test.ts` and the `UI-06` cases of `server/src/admin.test.ts`. The Playwright run needs the browser of the pinned version, which this machine did not have.
