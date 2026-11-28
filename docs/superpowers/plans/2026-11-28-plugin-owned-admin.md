<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-28-plugin-owned-admin.md
  @description Plan of the plugin-owned admin UI of M2.2: the contract, the library, the build of a project, the slots, the move of the screens into their plugins, the author of a plugin and the acceptance with packed tarballs (UI-34 to UI-38).
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

# Plugin-owned admin UI (M2.2) Implementation Plan

Approved by the maintainer on 2026-11-28 in plan mode. The approval delegates the test review stops of the [D] items, and it accepts: no prebuilt admin and a build in every project with an admin; `can` in `_meta`; the session and the sign out stay in the shell; `bieberkit dev` serves the admin with Vite and sets `ADMIN_URL` to it.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Each plugin ships its own admin UI, and a project, including one with its own plugin, builds one admin from its plugins.

**Architecture:** `@bieberkit/admin-core` holds a headless contract (`defineAdminPlugin`, `composeAdmin`). `@bieberkit/admin-antd` is a typed library whose shell draws ten slots from the composed registry. A Vite plugin of the CLI generates the list of admin parts from the config, keeps one copy of React, validates the parts, and the web role serves `apps/admin/dist`.

**Tech Stack:** Vite 8.3.8, `@vitejs/plugin-react` 6.3.0, React 19.3.1, Ant Design 6.7.1, TanStack Router and Query, tsdown 0.23.7, Vitest, Playwright. No new library.

**Spec:** `docs/modules/plugin-admin.md`, `docs/adr/0040-plugin-owned-admin.md`, UI-34 to UI-38 of `docs/spec/SPEC.md`. Behavior of the account screens: `docs/modules/admin-account.md`.

## Global Constraints

- Ten slots, a closed list (UI-35). A first-party plugin uses no API that another plugin cannot use (UI-36).
- `admin-core` has no runtime dependency (ADR 0025). `admin-core` and `admin-antd` name no first-party plugin (UI-34).
- The policy of UI-14 word for word: no inline script, no other origin. Initial JS of a built `blank` project under 400,000 bytes gzip.
- One copy of `react`, `react-dom`, `antd`, `@bieberkit/admin-antd`, `@bieberkit/admin-core`, `@tanstack/react-query`, `@tanstack/react-router`: `resolve.dedupe`, and the build fails on two.
- A local plugin exports its source; `publishConfig` turns the exports to `dist`. React, Ant Design and `@bieberkit/admin-antd` are **optional** peer dependencies with a range, plus exact dev dependencies.
- `en`, `vi`, `zh`; 360 px; no axe violation in light and dark; file headers; erasable TypeScript; no `any`; no default export in framework package source (the default export of an `./admin` entry is the contract and is written in the guide; ruling to record in the ledger).
- Tests are written first and seen to fail. Existing behavior tests move with the code and keep their assertions.

## Review Focus

1. `bieberkit dev` with no `apps/admin/dist`: the invitation and reset links still lead to the admin. (Task 4)
2. A project made with `--no-admin`, or a server image: installing plugins pulls in no React. (Tasks 4, 6)
3. An admin part that throws when it is imported: the build stops and names the plugin; it never makes a blank admin. (Task 4)
4. A plugin page at an address of the shell or of an entity list (`/account`, `/a/b`): refused with the plugin's name. (Task 1)
5. A person without the permission opens the address of a plugin page: they are told it is not open to them, and its chunk is not loaded. (Task 5)

---

### Task 0: Start

- [ ] Branch `feat/plugin-owned-admin` from `docs/plugin-owned-admin`. Save this plan to `docs/superpowers/plans/2026-11-28-plugin-owned-admin.md` with the file header; ledger by `sdd-workspace`.

### Task 1: The contract (`admin-core`)

**Files:** create `packages/admin-core/src/part.ts`, `compose.ts`, tests `part.test.ts`, `compose.test.ts`; export from `index.ts`; add `request` to `client.ts`.

**Produces:**

```ts
type Load<C> = () => Promise<{ default: C }>;
interface Contribution<C> { id: string; load: Load<C>; permission?: string }
interface AdminPartInput<C> {
  name: string;                                   // npm name of the plugin
  menu?: readonly { page: string; group?: string; icon?: string; permission?: string }[];
  pages?: readonly { path: string; title: string; load: Load<C>; permission?: string }[]; // title: a message key
  headerActions?: readonly Contribution<C>[];
  notices?: readonly Contribution<C>[];
  recordTabs?: readonly (Contribution<C> & { entity: string; title: string })[];          // entity: name or '*'
  fields?: readonly (Contribution<C> & { widget: string })[];
  homeBlocks?: readonly (Contribution<C> & { title: string })[];
  accountTabs?: readonly (Contribution<C> & { title: string })[];                         // "My account" exists when any
  publicPages?: readonly { path: string; load: Load<C> }[];
  signIn?: { load: Load<C> };
  gates?: readonly (Contribution<C> & { needed(state: { metaError: unknown }): boolean })[];
  screens?: readonly (Contribution<C> & { replace: `list:${string}` | `form:${string}` })[];
  messages?: Partial<Record<Locale, () => Promise<{ default: Readonly<Record<string, string>> }>>>;
}
defineAdminPlugin<C>(input: AdminPartInput<C>): AdminPart<C>
composeAdmin<C>(parts: readonly AdminPart<C>[]): { admin: AdminRegistry<C>; problems: readonly AdminProblem[] }
messageProblems(parts, languages: readonly string[]): Promise<readonly AdminProblem[]>
allowed<T extends { permission?: string }>(items: readonly T[], can: ReadonlySet<string>): readonly T[]
interface AdminProblem { plugin: string; code: string; message: string }
AdminClient.request(method: string, path: string, init?: { body?: unknown; headers?: Record<string, string> }): Promise<unknown>
```

- [ ] Tests: one per problem code (`unknown-key`, `bad-path` for a path that is not one segment, `reserved-path` for `/account` and `/ext`, `duplicate-path` across pages and public pages of two plugins, `duplicate-id`, `duplicate-field`, `duplicate-screen`, `menu-without-page`, `no-sign-in`, `two-sign-ins`, `message-missing`, `message-extra`, `message-prefix` where the prefix is the short name and a dot); every problem is reported together, in a fixed order; the composed order is the order of the parts; `allowed` keeps what has no permission; `request` sends and fails like the other calls.
- [ ] Run red, implement, green, commit.

### Task 2: What the caller may do (`http`, `server`) — authorization

**Files:** `packages/http/src/meta.ts` (option `permissions: readonly string[]`, answer `can: string[]`, `META_SCHEMA`), `packages/server/src/boot.ts` (pass `permissionCatalog`), `admin-core/src/types.ts`. Test: `http/src/meta.test.ts`.

- [ ] Tests: `UI-36 _meta carries the permissions that the caller holds and no other`; a caller with none gets `[]`; sorted; a 401 without a session; the refusal rules of a required second factor are unchanged.
- [ ] Red, implement, green, commit.

### Task 3: `admin-antd` as a typed library

**Files:** `packages/admin-antd/{package.json,tsdown.config.ts,src/index.ts,src/app/*}`; test `tools/lib/admin-library.test.ts` (run by `pnpm test:artifacts`).

**Produces:** `startAdmin(root: HTMLElement, options: { parts: readonly AdminPart[] }): void`; `type AdminPart = AdminPart<ComponentType<any>>` of core (typed as `ComponentType<never>` per slot props, no `any`); hooks `useAdminClient`, `useSession`, `useMeta`, `useCan(permission)`, `useText()`, `useLanguage`, `useAdminNavigate`, `useNotice`; components `AuthShell`, `FolderArt`, `Icon`; slot props `RecordTabProps`, `FieldProps`, `ScreenProps`, `GateProps`.

- [ ] First the check that decides: pack `admin-antd`, `admin-core`, `tokens`; a temporary consumer with `main.tsx` calling `startAdmin` builds with Vite. Expect: build passes, CSS, `.woff2` and the logo are in `dist`, one React. Red now.
- [ ] Library build: tsdown unbundled ESM with `.d.ts`, CSS and SVG copied and left as imports; `@fontsource/be-vietnam-pro` becomes a dependency (note in ADR 0039, still Proposed). **If the consumer cannot build it, stop and report.**
- [ ] Move the values bound at import (`client`, `queries`, `router`, `SETTINGS`, theme, media query) into `startAdmin`. The prebuilt app stays for now as `startAdmin(root, { parts: [] })`, so e2e stays green until Task 4.
- [ ] `pnpm build && pnpm test:e2e` green. Commit.

### Task 4: The project builds its admin

**Files:** create `packages/cli/src/admin-vite.ts` (export `bieberkit/admin-vite`), test `admin-vite.test.ts`; `commands/{build,runtime}.ts`; `server/src/{admin,services}.ts`; `create/src/scaffold/{render,deploy}.ts`; `tools/lib/admin-size.ts`, `check-admin-size.ts` (take a folder); `e2e/serve.mjs`; drop the app build of `admin-antd`.

**Produces:** `bieberkitAdmin(): Plugin[]` giving the virtual module `virtual:bieberkit/admin` (`export const parts`), the dedupe list, the one-copy check (`BK_ADMIN_TWO_COPIES`), validation by `runnerImport` + `composeAdmin` + `messageProblems` with the languages of the config (`BK_ADMIN_PART_INVALID`, all problems), and in dev the page data of `pageAt` (export it from `@bieberkit/server`) with a proxy of `/api`. An admin part is a package of `plugins` whose manifest exports `./admin`; the project's own is `apps/admin/src/part.ts` when it exists. `adminDirectory(root)`: `public/admin`, then `apps/admin/dist`. `hasAdmin(root)`: `apps/admin` or `public/admin` exists.

- [ ] Tests: the virtual module lists parts in boot order and skips a plugin without `./admin`; a part that throws names its plugin; composition problems stop the build with all of them; a second copy stops it; `server`: finds both folders, `BK_ADMIN_NOT_BUILT` (with the fix `bieberkit build`) when `apps/admin` exists without a build outside dev, and the password links use `<admin>/reset-password` when `hasAdmin` even with no build; `create`: writes `apps/admin/{package.json,vite.config.ts,index.html,src/main.tsx,tsconfig.json}` with exact pins, nothing of it with `--no-admin`; `deploy`: the Dockerfile copies `apps/admin/dist` to `/out/public/admin` (DEP-06); `runtime`: `dev` starts Vite with `ADMIN_URL` of the dev server and sets it for the server; `build` runs the admin build after generate and typecheck; the typecheck covers `apps/admin`.
- [ ] Red, implement, green. `serve.mjs` builds the admin of the e2e project; a spec measures its size against 400,000 bytes. `pnpm test:e2e` green. Commit.

### Task 5: The ten slots

**Files:** `admin-antd/src/app/{App,Gate,Welcome,ListScreen,FormScreen,controls}.tsx`, new `slots.tsx` (registry context, `Slot` with an error boundary and a lazy chunk, reusing `PluginBoundary`); `e2e/fixtures/crm` gains `src/admin/` in TSX covering every slot, one of which throws; new `e2e/slots.spec.ts`.

- [ ] Browser tests first: each slot is drawn in its place; a permission hides the menu entry and the page says it is not open (Review Focus 5, and no chunk request); a contribution that throws leaves the rest of the screen and is reported (UI-21); texts follow the language; a gate replaces the admin and `signOut` works; axe and 360 px on the fixture screens.
- [ ] Red, implement, green. Without `signIn` from a part the build already fails (Task 4), so until Task 6 the fixture provides it. Full `pnpm test:e2e`. Commit.

### Task 6: The account screens move to `users`

**Files:** create `plugins/users/src/admin/{index.ts,api.ts,rules.ts,SignIn.tsx,ForgotPassword.tsx,ResetPassword.tsx,EnrolScreen.tsx,TwoFactorSetup.tsx,NewPasswordFields.tsx,GraceNotice.tsx,tabs/*.tsx,messages/{en,vi,zh}.ts}`; `plugins/users/{package.json,tsdown.config.ts,tsconfig.json,tsconfig.admin.json}`; remove from `admin-antd` and `admin-core` (`account.ts`, `account-client.ts`, `signIn`, their messages); move `admin-core/src/account.test.ts` to `plugins/users/src/admin/{api,rules}.test.ts` with the same assertions.

- [ ] Move the tests first (red: the modules are not there). Message keys gain the prefix `users.`.
- [ ] Move the code. `./admin` export, two build entries, optional peer dependencies. `pnpm check:layers` stays green.
- [ ] `e2e/account.spec.ts` passes **with no change to what it asserts**. The packed `users` tarball ships `dist/admin`, and a server without admin installs no React (test in `test:artifacts`). Full `pnpm test:e2e`. Commit.

### Task 7: File control to `media`, history tab to `audit-log`

**Files:** `plugins/media/src/admin/` (fields `file`, `image`; upload calls and rules from `admin-core/src/{files,client}.ts`), `plugins/audit-log/src/admin/` (record tab `'*'`; from `related.ts` and `Related.tsx`). Move their unit tests.

- [ ] Tests move first. A project without `media` shows a file field as a read-only id with a sentence; without `audit-log` there is no history tab.
- [ ] The file and history cases of `e2e/screens.spec.ts` pass unchanged. Commit.

### Task 8: Remove the loader of ADR 0037

**Files:** delete `admin-antd/src/app/{Plugins,ExtensionPage}.tsx`, `admin-core/src/extensions.ts`, `server/src/plugin-admin.ts`, `http/src/admin-extensions.ts`, `_meta.extensions` and `_meta.menu` of plugins; create `tools/lib/shared-admin.ts` (+ test) and `tools/check-shared-admin.ts`, added to `pnpm check`.

- [ ] Test first: the check refuses in the sources of `admin-core` and `admin-antd` (tests excluded) `@bieberkit/plugin-`, `/api/v1/{users,roles,media,audit-log,notifications,settings}`, `/two-factor/` and `/request-password-reset`.
- [ ] Remove; the e2e cases of UI-04 now run on the fixture admin part. `pnpm check`, full `pnpm test:e2e`. Commit.

### Task 9: The author of a plugin

**Files:** `cli/src/make.ts` + `make.test.ts`, `commands/make.ts`, `commands/runtime.ts` (dev watches `plugins/*/src` for the types and restarts), `create/src/scaffold/render.ts` (`plugins/*` in the workspace), new `docs/guides/writing-a-plugin.md`.

- [ ] Tests: `make:plugin` writes backend and `src/admin/{index.ts,<Name>Page.tsx,messages}`; exports source with `publishConfig` to `dist`; exact dev dependencies at the versions of the project and optional peers (never `*` alone); `tsdown`, `typescript` declared; adds the dependency to `apps/server` and `apps/admin` and the line to the config (and says so when it cannot); the made files pass the strict type check of a project and `bieberkit check`; with `--no-admin` projects, no admin part.
- [ ] Verify in the acceptance that `dev` restarts after a backend edit in `plugins/`. Commit.

### Task 10: Acceptance with packed tarballs

**Files:** `tools/acceptance/plugin-author.mjs` (from the probe of the spike), script `test:acceptance` in `package.json`.

- [ ] Pack all packages; create a project **outside the repository**; install; `make:plugin`; `migrate:make`, `migrate`, `db:seed`; `dev`: sign in, see the plugin page, edit TSX and TS, see both; `build`; start the web role; the browser signs in and sees the page under the policy, with no console error. `blockExoticSubdeps: false` only in that temporary project, said in the file.
- [ ] Run it; fix what it finds, each with a test where it can be tested. Propose the CI job in the report; do not edit `.github/`. Commit.

### Task 11: Documents and release notes

- [ ] `docs/modules/{plugin-admin,admin,admin-account,admin-identity,server,http,cli,plugins}.md`, README of the packages, `pnpm check:api` reports, changesets (**breaking**: no prebuilt admin; `apps/admin` needed; `signIn` and account, file and history calls left `admin-core`; `definePlugin.admin` and `_meta.extensions` removed; how to upgrade), roadmap ticks with evidence.
- [ ] `pnpm check && pnpm typecheck && pnpm lint && pnpm format:check`, unit tests of every package touched on SQLite, full `pnpm test:e2e`. Report what was not run. Self-review against the Review Focus. Commit.

## Known before starting

- `e2e/accessibility.spec.ts` "relation picker" fails on color contrast most runs; older than this work.
- The three-dialect battery has not run since UI-26. Command: `sh tools/test-services.sh start && export $(sh tools/test-services.sh env | xargs) && BK_REQUIRE_DIALECTS=all pnpm test:coverage`.

## Verification

Task 10 is the end-to-end proof for the requirement of the maintainer; `e2e/account.spec.ts` unchanged is the proof that the move lost nothing; `tools/check-shared-admin.ts` is the proof that the shared packages stay shared.
