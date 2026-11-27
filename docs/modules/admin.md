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

## The languages (UI-05)

`@bieberkit/admin-core` has `i18n.ts`: the dictionaries of `en`, `vi` and `zh` (a test makes them have the same keys and placeholders, and refuses empty texts), `translator(dictionary)(key, values)` that fills `{name}` once, `localeOf(languages, saved, supported)` for the choice (saved, then the browser, then English) and `formatNumber`, `formatDate`, `formatDateTime` and `formatMoney` over `Intl`, which never throw and give back what they could not read. The adapter keeps the choice in `localStorage` (a browser that refuses it forgets), gives Ant Design its locale, with the two keys that `vi_VN` lacks (`global.clear`, `Input.otpCell`) filled in, sets `lang` of the page, and has a language select in the header. The screens use `useT()`. The labels of entities come from `label` of the entity in the language. The labels of fields are still the keys of the fields: the metadata has no label for a field yet.

The dictionaries of `vi` and `zh` (`messages/vi.ts`, `messages/zh.ts`) and the Ant Design locales of the two are chunks of their own: `loadMessages(locale)` and `antdLocaleOf(locale)` read them when a person chooses the language (and at the start when the saved language is not English, which waits for them). English is in the bundle, because it is the fallback and the first screen. A browser test (`e2e/screens.spec.ts`) checks that an English session does not request them. The initial JavaScript fell from 393 to 319 kB with the lazy screens and from 323 to 318.8 kB with the lazy languages.

## When the network, a deploy or the person gets in the way (UI-12, UI-17 to UI-19, UI-21, UI-22)

The logic is in `@bieberkit/admin-core`, testable without a browser, and the adapter wires it:

- **Retry and offline (UI-19).** `shouldRetry` and `backoffMs` (`resilience.ts`): a failed read is tried again as the policy says (a network failure up to 5 times, a failure of the server fewer, a 4xx never), with a wait that doubles from 0.5 s to 30 s and is spread by a random factor. `connection` tells whether the admin is offline from the events of the browser and the outcome of the queries, and `OfflineBanner` shows it instead of a blank screen.
- **Error boundaries (UI-19).** Each route has one (`defaultErrorComponent`) with a retry, and one wraps the application.
- **Lazy screens (UI-12).** `Welcome`, `ListScreen` and `FormScreen` are chunks loaded when their route opens. The initial JavaScript is the entry and what it preloads; `pnpm build && pnpm check:admin-size` measures it compressed against 400 kB (it is 318.8 kB). The measure is `tools/lib/admin-size.ts`.
- **A deploy under an open tab (UI-22).** `isChunkError` and `chunkReload`: a screen that cannot be loaded, or the `vite:preloadError` event, reloads the page once; a second one inside a minute is shown, so a bad deploy cannot make a loop. The previous releases' hashed files are kept by the web role: `retainAssets` (`admin-assets.ts`) copies the files of its build into `ADMIN_ASSETS_DIR` (`data/admin-assets` by default) when it starts, marks the files that the release before used and this one does not, and removes a file 24 hours after it was replaced; `serveStatic` serves a hashed file that its build lacks from that folder, never the page and never a path outside `assets/`. The instances of a rolling deploy share the folder, and a folder that cannot be written is reported and does not stop the server. A boot test and a unit test of the folder cover it.
- **Forms (UI-17, UI-18).** `isDirty` drives a guard that asks before leaving (in the router and with `beforeunload`); `saveDraft`, `loadDraft` and `clearDraft` keep a draft of the form in the browser for a week, per user, entity and record, never with a personal or encrypted field, and the form offers to restore it; Ctrl/Cmd+S saves from a field (`shortcutOf`; `n` and `/` are defined and not wired yet). A 412 now carries the row as it is (`AdminApiError.current`), and the form shows who changed it and when, a table of the fields that differ, and two choices: keep my changes on top of theirs (`reapply`, a three-way merge of the row that was opened, the form and the current row) or take theirs.
- **Reports (UI-21).** `errorReport`, `vitalReport`, `routeShape`, `ratingOf`, `dedupe` and `sampled` build what is sent: kind, a message without emails and long numbers and tokens, file and line of the frames, the route with ids as `:id`. The browser side is `reports.ts` of the adapter: an error that nothing caught (`error`, `unhandledrejection`, the boundaries) is sent once, ten at most per page; the vitals (FCP, LCP, CLS, INP, TTFB) are sent when the person leaves, for a tenth of the visits, by `fetch` with `keepalive`. The server side is `registerClientReports` (`client-reports.ts`), the public route `POST /api/v1/_client-reports`, which takes one of two shapes with a closed list of names and lengths, hands an error to the error reporter as a warning of the source `client` (with the frames as its stack, the route as a tag), and counts a vital in `bk_admin_web_vitals_total` and observes it in `bk_admin_web_vital_seconds` and `bk_admin_layout_shift`. A browser test throws an error with an email in it and reads what was sent, and reads the metrics after a visit.

Not browser-tested here: the Playwright run needs the browser of the pinned version, which this machine does not have. The behavior above is covered by unit tests of the logic, the type check and the build.

## The list: filters, views, bulk delete and export (UI-03)

The logic is in `lists.ts` of `@bieberkit/admin-core`, and `ListScreen` wires it:

- **Filters.** A `Filter` is a field, an operator and a text. `operatorsOf` gives the operators that the API takes for a kind (`eq ne in null` for text and `oneOf`, the range operators for numbers and dates, `eq null` for a boolean, `eq in null` for a relation). `filterProblem` refuses what the API would refuse: a field that is unknown or not `filterable`, a wrong operator, a value that is not a number, a date or one of the `oneOf` values. `filterParams` makes `filter[field][op]=value`, and `client.list` takes `filters` and throws before any call when one is wrong.
- **In the address.** The filters (as JSON, written by the router) and the sort are the search of the route (`viewToSearch`, `viewFromSearch`), so a link or the back button gives the same list. A filter in the address that no longer fits the metadata is dropped.
- **Views.** `saveView`, `loadViews`, `deleteView` keep named views in `localStorage` under `bk-views:<user>:<entity>`: at most 20, a name saved twice is replaced where it stands, a storage that refuses or holds a broken text gives no view and no error.
- **Bulk delete.** Rows are selected in the table (when the user may delete), and `client.bulk` calls `POST {path}/bulk` with the version that was read. `bulkSummary` counts what worked and lists each row that did not, with the reason of the API (a 409-like `conflict`, `not_found`, `invalid`). A call above 100 rows is a job, and the screen says so.
- **Export.** CSV of the columns of the list, for the current filters and sort, read in pages of 100 up to 10,000 rows (`exportPages`); the screen says when the file was cut. A text that starts with `= + - @`, a tab or a CR gets a quote mark in front, so a spreadsheet does not run it (IO-04).

Not done in this slice: bulk update and transitions from the screen (the client supports them), a filter on a field of an extension, `visibleWhen`/`requiredWhen`, child tables, relation pickers and file fields. Not browser-tested: unit tests of the logic, the type check and the build only.

## The detail of a row (UI-03, UI-11)

A row that is opened has tabs. **Details** is the form, with the fields that the server fills (`readOnlyOf`: a number from a sequence, the state) in a list above it and the moves that the row may take as buttons (a move that asks for something opens the same small form as in the list, and the row of the answer is the row that the next save is checked against). One tab for each **child table** (`relatedOf`): the entities that the user may list and that have a relation to this one that the API can filter by (the field is `index()` or `unique()`), with their rows (`filter[accountId][eq]=<id>`), a link to each, and a button for a new one that opens the form with the relation filled in (`?accountId=<id>`, `prefillOf` takes only the fields of the form). **History** is the audit log of the row (`GET /api/v1/audit-log/entries?entity=&recordId=`, `client.history`), newest first, with the actor and the fields that changed; a user without `audit-log.read` is told that it is not open to them. Child rows are written by their own screens, so there is no nested write.

## Fields that appear and are required by condition (UI-11)

`statesOf(fields, values)` (`when.ts`) says which fields of a form are shown and which are required for the values that it holds, from `visibleWhen` and `requiredWhen` of the metadata. The form follows the values as they change (`Form.useWatch`): a field that its condition hides is not drawn and is not sent, one that its condition requires has the star and refuses an empty value with the sentence of the language. The server enforces the same conditions (`docs/modules/http.md`), so a client that does not follow them still cannot save what the record does not allow.

## Relations (UI-11)

A relation field is a select that asks the target entity for its rows as the person types (`RelationSelect`): a call of the list with `q` after a pause of 250 ms when the target has searchable fields, the first 20 rows when it has not, and the name of the row that is chosen (`titleOf`: the field that the relation names, then the title of the target, then the first text of its list, then the id), read on its own when it is not among the first. A user who may not read the target types the id, as before. The same picker is the value of a filter on a relation. A list asks for the relations of its columns with `include=` and shows the name of the row (`includeOf`, `relationLabel`); a CSV export keeps the id.

## Accessibility and the second adapter (UI-07, UI-10)

- **Axe in the browser tests (UI-07).** `e2e/accessibility.spec.ts` runs axe (`@axe-core/playwright`, a dev dependency of the repository, ADR 0035) with the tags of WCAG 2.0, 2.1 and 2.2 level A and AA on the login page, the welcome page, a list, a list with a selection, a form, a form that asks for the input of a move, a list with a filter, the list as cards at 360 px, and the pages in the dark palette. None may have a violation. What it found, and what was done: the default brand colors did not read (white on `#1677ff` is 4.0:1), so the defaults of `@bieberkit/tokens` are darker and the dark palette has its own light tones, with the text of a filled button dark (`contrastRatio` and a test hold them to 4.5:1); the placeholder and the description of Ant Design were a quarter to half of the text, so the compiler gives them a mix of 65 to 70% (`mixColors`); the eye of a password field was 14 px, so a rule of `app.css` gives it 24 px; the `scroll.x` of the table of Ant Design adds a hidden row that holds a checkbox, so the table scrolls in a box of its own that the keyboard can reach; the cards had a list that held a pager.
- **The second adapter (spec section 26).** `src/fixtures/text-adapter.ts` draws the menu, the list with its filters, sort and page, the moves, the bulk changes, the export, the saved views, the form with its checks and the merge of a 412 as plain text, with nothing but the public functions of `admin-core` and `AdminClient`, and `adapter.test.ts` runs it against an API in memory. If a rule of the admin were only in Ant Design, that fixture would have to write it, and its test would say so. It is not exported and not built.
