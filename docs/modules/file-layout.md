<!--
  BieberKit

  @file        docs/modules/file-layout.md
  @description Design of where the files of a module, a plugin, its admin part and the admin shell go, and how the layout is held (MOD-19, spec 7.4).
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

# File layout of modules, plugins and the admin shell

- Spec sections: 7.4 (MOD-19), UI-34, UI-38
- Status: **Approved on 2026-11-28** by the maintainer, who picked approach A below.

## Why

Spec 7.4 gives every module one shape, so that people and agents know where code goes. The first-party plugins and `make:plugin` did not follow it: routes, services, entities and screens lay in `src/` and `src/admin/`, and the shell of the admin had 37 files in one folder.

## Approaches

- **A. By kind, on both sides** (picked). The admin part has folders by what a file is, as the backend has. One rule for every plugin, which a check can hold. One feature is spread over folders.
- **B. The backend by kind, the admin by feature.** A feature is in one folder. Two rules, folders with one file in small plugins, and names that no check can hold.
- By feature on both sides was left out: it replaces spec 7.4.

## A module and the backend of a plugin

```
modules/crm/  or  plugins/<name>/src/
├── module.ts | index.ts   what it declares and publishes, and no logic
├── entities/              one file per entity
├── services/              business logic, transactions, the published service
├── routes/                custom routes; routes/index.ts lists them in order
├── actions/               entity actions and transition handlers
├── jobs/                  defineJob files
├── events/                payload schemas and subscriptions
├── workflows/             multi-step workflows
└── admin/                 the admin part of a plugin (below)
```

- A folder is made when it has a file.
- The root holds the entry and tests, and no other code.
- A test lies next to what it tests, as `*.test.ts`. A test of the whole module lies at the root.
- Dependencies keep the direction of MOD-15: routes, actions, jobs and events call services.

The screens of a module of a project are not in the module: they are in `apps/admin/src` (spec 16.6).

## An admin part, and `apps/admin/src`

```
admin/
├── index.ts       defineAdminPlugin: the slots, and no screen
├── pages/         whole screens: pages, pages without a session, the sign in, gates, replaced lists and forms
├── tabs/          tabs of a record and of "My account"
├── fields/        controls of fields
├── components/    the smaller pieces: header actions, notices, home blocks, and what screens share, with their CSS modules
├── lib/           no user interface: calls, rules and hooks, with their tests
└── messages/      en.ts, vi.ts, zh.ts
```

The root holds `index.ts`, type declarations (`*.d.ts`) and `tsconfig.json`.

## The shell, `@bieberkit/admin-antd`

`src/app/` starts the application (start, `App`, styles, assets). `src/shell/` is the frame around a screen. `src/screens/` is the generic list, form and detail. `src/slots/` draws the admin parts. `src/components/` is what screens of plugins share. `src/lib/` has no user interface of its own: contexts, hooks, language, reports.

## How it is held

- `pnpm check` of the repository fails on a file out of place in `plugins/*/src` and in `packages/admin-antd/src` (`tools/check-layout.ts`).
- `bieberkit check layout` warns (`BK_LAYOUT_MISPLACED`) in a project, for `apps/server/src/modules/*` and `plugins/*/src`. A warning does not fail the check.
- Both use one function (`packages/cli/src/check/rules/layout-of.ts`).
- `make:plugin` and `make:entity` and `make:job` write into these folders. `make:module` writes `module.ts` only.

## Not changed

Public exports, manifests, routes, jobs and behavior. The other framework packages keep their layout.

## Tests

| What                       | Proof                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The rule                   | Unit tests of the function and of `bieberkit check layout`                                                                                     |
| Nothing but places changed | A snapshot of the exports, routes with their schemas, jobs, subscriptions, settings and admin slots of the six plugins, equal before and after |
| The made plugin            | `make.test.ts`, and `pnpm test:acceptance`                                                                                                     |
| The moved screens          | `e2e/slots.spec.ts` and `e2e/account.spec.ts`                                                                                                  |
