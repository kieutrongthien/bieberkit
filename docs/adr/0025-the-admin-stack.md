<!--
  BieberKit

  @file        docs/adr/0025-the-admin-stack.md
  @description ADR 0025: the dependencies of the first admin slice, React, Ant Design, TanStack Query and Router, Vite and Playwright, with their reasons, maintainers and licenses (P9).
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

# 0025. The admin stack of the first slice: React, Ant Design, TanStack Query and Router, Vite, Playwright

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and the spec already names the stack (UI-01, UI-10).
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: UI-01, UI-02, UI-10, UI-14, SEC-01, section 21, P9, PKG-04

## Context

M1.8 ends with a thin admin: a login, a generic list and a generic form, served under `/admin/` with its own CSP, and a browser test of the login and of one CRUD flow. The spec fixes the stack (UI-01: React 19.2.4 or later, Vite 8, TanStack Router, Query, Table, Form and Virtual, Ant Design 6 as the default adapter, UI-10), and P9 asks for a reason, a maintainer and a license for every runtime dependency. `@bieberkit/core` stays free of dependencies (PKG-04), and nothing of this stack reaches a package below the product layer.

## Decision

These packages, each pinned exactly and from the registry after the 7 day release age (`minimumReleaseAge`):

| Package                            | Version      | Where                                     | Reason                                                                                                                                                                     | Maintainer, license                  |
| ---------------------------------- | ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `react`, `react-dom`               | 19.3.1       | `@bieberkit/admin-antd`                   | The UI library of UI-01. A single page app, no server components                                                                                                           | Meta and the React team, MIT         |
| `antd`                             | 6.7.1        | `@bieberkit/admin-antd`                   | The default adapter of UI-10: table, form, layout, menu and the controls that a list and a form need                                                                       | Ant Group, MIT                       |
| `@tanstack/react-query`            | 5.108.0      | `@bieberkit/admin-antd`                   | Server state: caching, invalidation after a write, retry (UI-13)                                                                                                           | Tanner Linsley and contributors, MIT |
| `@tanstack/react-router`           | 1.170.46     | `@bieberkit/admin-antd`                   | The router of UI-01, with typed routes and lazy screens (UI-12)                                                                                                            | Tanner Linsley and contributors, MIT |
| `vite`, `@vitejs/plugin-react`     | 8.3.8, 6.3.0 | dev dependency of `@bieberkit/admin-antd` | Builds the static, content hashed assets of UI-08                                                                                                                          | VoidZero and the Vite team, MIT      |
| `@types/react`, `@types/react-dom` | 19.3.0       | dev                                       | Types                                                                                                                                                                      | DefinitelyTyped, MIT                 |
| `@playwright/test`                 | 1.65.1       | dev dependency of the repository          | The browser test of section 21 (login and CRUD). It downloads its browser with `playwright install`, which is not an install script and is run by the person or the CI job | Microsoft, Apache-2.0                |

`@tanstack/react-table`, `-form` and `-virtual` of UI-01 are not added in this slice. The list uses the table of Ant Design with the sort and the page that the API gives, and the form uses the form of Ant Design with the rules that the metadata gives. They join when a screen needs what they do (saved views, a list of more than 200 rows, conditional fields), with their own ADR line.

**Where the code lives.** `@bieberkit/admin-core` is headless TypeScript with no dependency at all: the client of the API (session, metadata, list, get, create, update, delete, the problem answers of RFC 9457), and the pure functions that turn the metadata into the columns and the form. `@bieberkit/admin-antd` holds React, Ant Design, the screens, and the built application. The server serves the built files from that package, so a project builds no admin of its own unless it replaces the adapter (UI-04, UI-10).

**The CSP of the admin (UI-14, SEC-01).** The files under `/admin/` are static, so the policy is fixed: `default-src 'none'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (Ant Design writes its tokens as style elements at run time, the one concession, and a nonce cannot be given to a static file), `img-src 'self' data:`, `font-src 'self' data:`, `connect-src 'self'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`. The API keeps `default-src 'none'`.

## Options

| Option                                     | For                                                                               | Against                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A. The stack of the spec, in two packages  | What UI-01 and UI-10 say. Another adapter can replace `admin-antd` without a fork | Many dependencies, all in one package that nothing below imports |
| B. A lighter stack (Preact, no UI library) | Smaller bundle                                                                    | Not the spec, and the UI library is the work of months           |
| C. Server rendered admin pages             | No client bundle                                                                  | Not the spec, and every form and list is code in the server      |

## Evidence

All of them are installed and resolve under the supply chain settings (`minimumReleaseAge`, `trustPolicy: no-downgrade`), and none has an install script. `pnpm exec playwright install chromium` downloads 125 MiB and the browser starts headless on the machine of this work.

## Consequences

- Easier: a project gets an admin from the framework with no build step, and the adapter contract of `admin-core` is the seam for another UI library.
- Harder: `style-src 'unsafe-inline'` is on the admin. A later release can move the styles of Ant Design to a stylesheet that is extracted at build, and then drop it.
- Ruled out: server components, and a second UI library in this repository.

## Spec changes

- Section 25 (Phase 1): the first admin slice has no TanStack Table, Form or Virtual (they follow with the screens that need them).

## Follow-ups

- The ADR line for TanStack Table, Form and Virtual, with the first screen that needs them.
- Axe in the Playwright run (section 21, UI-07).
