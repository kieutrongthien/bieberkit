<!--
  BieberKit

  @file        docs/adr/0035-admin-tables-forms-and-checks.md
  @description Decision record: the admin keeps the tables, forms and long lists of Ant Design instead of TanStack Table, Form and Virtual, and adds axe for the accessibility checks of the browser tests.
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

# 0035. The admin draws tables, forms and long lists with Ant Design, and checks accessibility with axe

- Status: Accepted
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: UI-01, UI-07, UI-10, UI-12, P1, P9, PKG-04
- Supersedes: the names TanStack Table, Form and Virtual in UI-01, UI-10 and UI-12 of the spec. Nothing in [ADR 0025](0025-the-admin-stack.md) changes.

## Context

UI-01 lists TanStack Table, Form and Virtual in the stack of the admin, UI-10 says that `admin-core` holds list and form state on TanStack Table and Form, and UI-12 says that lists over 200 rows render with TanStack Virtual. ADR 0025 built the first slice without them. The generic screens of M2.2 are built now, and the choice has to be made once.

What the screens needed, and what had it:

- **List state** (page, sort, filters, selection): kept in the address and in small pure functions of `admin-core` (`filterParams`, `viewFromSearch`, `commonTransitions`), tested without a browser. The table of Ant Design draws the rows, the sort and the selection.
- **Form state**: the form of Ant Design holds the values, its rules call `problemOf` of `admin-core`, which checks against the JSON Schema of the metadata, so the same check can be used by another adapter.
- **Long lists**: the API takes 100 rows a page (API-14), so a list never has 200 rows on a page. Where more is drawn, the `virtual` mode of the table of Ant Design (`rc-virtual-list`, already a dependency of Ant Design) draws the rows in view.
- **Accessibility** (UI-07, section 18.1 of the spec): the pipeline names Playwright with axe. There is no tool in the repository that checks WCAG 2.2 AA.

## Options

| Option                                                                                             | For                                                                                                                 | Against                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Ant Design for the tables, forms and virtual lists; the logic in pure functions of `admin-core` | No new runtime dependency (P9); the bundle stays at 320 kB of 400; the logic is what another adapter reuses (UI-10) | `admin-core` has no list or form hooks, so another adapter writes the glue; the spec names three libraries that are not used                                                   |
| B. TanStack Table, Form and Virtual in `admin-core`                                                | As the spec says; one state machine for every adapter                                                               | Three runtime dependencies for what the pure functions and Ant Design already do; each adds bytes to a bundle that is near its budget; two sources of truth for the same state |
| C. Add axe-core to the browser tests as a dev dependency                                           | Runs on real screens, in the browser tests that exist; finds what a review misses                                   | A dev dependency under the MPL-2.0, which is not Apache-2.0                                                                                                                    |

## Decision

1. Option A for the tables, forms and long lists. UI-01, UI-10 and UI-12 are changed in the spec to say what is true: the adapter draws them, `admin-core` holds the logic that does not depend on a library, and a table draws only the rows in view over 200 rows.
2. Option C for accessibility. `@axe-core/playwright` 4.14.0 (it pulls `axe-core` 4.14.1) is a **dev dependency of the repository** and is never in a package or in a built file.

| Package                 | Reason                                                 | Maintainer               | License | Where                       |
| ----------------------- | ------------------------------------------------------ | ------------------------ | ------- | --------------------------- |
| `@axe-core/playwright`  | Checks WCAG 2.2 AA on the screens of the browser tests | Deque Systems (axe-core) | MPL-2.0 | root `devDependencies` only |
| `axe-core` (transitive) | The rules engine                                       | Deque Systems            | MPL-2.0 | the same                    |

The MPL-2.0 is a weak, file-level license. It binds the files of axe itself if they are changed and distributed, and nothing of the repository is a derivative of them. The packages that are published do not contain it. This is the same footing as any test tool of the repository.

## Consequences

- **Easier.** The bundle does not grow. The logic of the screens has unit tests, and the browser tests find what the unit tests cannot (a sideways scroll at 360 px, a view that could not be picked twice).
- **Harder.** An adapter for another library writes its own list and form glue over the functions of `admin-core`. The contract is the functions and the metadata, which `e2e` and the unit tests pin.
- **Ruled out.** TanStack Table, Form and Virtual in `admin-core` for now. A later ADR can bring them back if a second adapter shows that the glue is the same in both.

## Spec changes

- UI-01: the stack is React, Vite, TanStack Router and Query, and Ant Design 6 by default.
- UI-10: `admin-core` holds the metadata, routing, permissions, the logic of lists, filters, views, moves, forms and checks, and the data hooks.
- UI-12: a table over 200 rows draws only the rows in view.
- Document history.
