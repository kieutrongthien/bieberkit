<!--
  BieberKit

  @file        AGENTS.md
  @description Instructions for AI coding agents working on the BieberKit repository.
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

# BieberKit

Open-source TypeScript framework for management-style web apps and APIs (Apache 2.0). The project is before implementation. `docs/spec/SPEC.md` is the source of truth. When code and spec disagree, stop and ask, or change the spec in the same pull request.

## Commands

- `pnpm install` only. Never npm, yarn or bun.
- `pnpm check` runs headers, package layers, file layout and skill sync, among others. Run it before every commit.
- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm build`.
- One package: `pnpm --filter @bieberkit/core build`. One test file: `pnpm test packages/core/src/index.test.ts`.
- `pnpm check:headers --fix` inserts a missing header. You still write the `@description`.
- Files in `tools/` run with plain `node tools/<file>.ts` (Node.js type stripping, no build).

## Layout

- `packages/` framework packages, one folder each, published as `@bieberkit/*`, `bieberkit` and `create-bieberkit`.
- `plugins/` first-party plugins. `templates/`, `registry/`, `examples/` are empty until Phase 2.
- `skills/` holds skills shipped into generated projects. Skills for working on this repository are in `.agents/skills/`. Generic process skills come from the Superpowers plugin, which is not vendored here.
- `docs/spec/SPEC.md` spec, `docs/adr/` decisions, `docs/modules/` module specs.

## File layout (MOD-19)

Put each file in the folder of its kind. `pnpm check` fails otherwise (`pnpm check:layout`, [docs/modules/file-layout.md](docs/modules/file-layout.md)).

- Module or plugin backend (`modules/<name>/`, `plugins/<name>/src/`): `module.ts` or `index.ts` declares and publishes and holds no logic; then `entities/` (one file per entity), `services/`, `routes/` (`routes/index.ts` lists them in order), `actions/`, `jobs/`, `events/`, `workflows/`, `settings/`.
- Admin part (`src/admin/`): `index.ts` declares the slots; then `pages/`, `tabs/`, `fields/`, `components/`, `lib/` (no user interface), `messages/`.
- Admin shell (`packages/admin-antd/src/`): `app/` only starts the application; then `shell/`, `screens/`, `slots/`, `components/`, `lib/`.
- A folder is made when it has a file. A test lies next to what it tests.
- The generators (`make:module`, `make:entity`, `make:job`, `make:plugin` in `packages/cli/src/make.ts`) and the `AGENTS.md` of a new project (`packages/create/src/scaffold/render.ts`) follow this. Change them with the rule.

## Package layers (PKG-01)

Imports point downward only. `pnpm check:layers` enforces it from `tools/lib/layers.ts`.

1. Tools: `bieberkit` (cli), `create-bieberkit`, `@bieberkit/mcp`
2. Product: admin-core, admin-antd, site-kit, tokens, content, testing
3. Contracts: http, data, auth, queue, cache, storage, mail, search, log
4. Foundation: core. Node.js built-ins only, no runtime dependencies (PKG-04)

Driver libraries (BullMQ, BentoCache, FlyDrive, mail transports, search engines) are imported only inside `src/adapters/<driver>/` of a contract package and exported as a subpath, for example `@bieberkit/cache/bentocache`.

## TypeScript

- Erasable syntax only: no `enum`, decorators, `namespace` or constructor parameter properties. Use `as const` objects and union types.
- Relative imports keep the `.ts` extension. Type-only imports use `import type`.
- Exported functions and constants declare their types (`isolatedDeclarations`).
- No `any`. Take `unknown` and narrow it.
- ESM only. No default exports in package source (config files such as `tsdown.config.ts` are the exception).

## Every file needs the header

Spec section 23. Copy the header from a file of the same kind, set `@file` to the repo-relative path, write a one-sentence `@description`, and use the year the file was created. JSON, lockfiles, `LICENSE`, `NOTICE` and binaries are exempt. In Markdown with frontmatter (`SKILL.md`), the header comes after the frontmatter, and blank lines between them are allowed (formatters add one).

## Rules agents often break

- Read `process.env` only in `packages/core/src/config/`. Everything else gets validated config (P8).
- Only services open transactions (MOD-16). Routes, actions, jobs and subscribers call services.
- Nothing external inside a transaction: no HTTP calls, queue pushes, mail or cache writes. Write an outbox record and let the worker do it after commit.
- Throw `BkError` subclasses with a stable code (MOD-17). Never throw strings.
- One way to do each thing (P1). If a second way seems necessary, write an ADR instead of adding it.
- A new runtime dependency needs an ADR line with reason, maintainer and license (P9). Apache-2.0 compatible licenses only.
- Never edit files marked `@generated`. Change the generator.

## Workflow

This repository uses the Superpowers plugin. Start every task with the skill `bieberkit-implement-task`, which says which Superpowers skill to run at each step. Work from `docs/ROADMAP.md` and tick items there when the work lands.

1. A non-trivial change starts with an ADR (`docs/adr/`) or a module spec (`docs/modules/`). This is the design document `superpowers:brainstorming` produces. Never write `docs/superpowers/specs/`.
2. Write tests from the spec first (`superpowers:test-driven-development`). The maintainer reviews the tests, then you implement.
3. Plans from `superpowers:writing-plans` go in `docs/superpowers/plans/` and carry the file header.
4. Before saying work is done, run `pnpm check`, `pnpm typecheck`, `pnpm lint` and `pnpm test` and read the output (`superpowers:verification-before-completion`).
5. Keep pull requests small. A change to a public API needs a changeset (`pnpm changeset`).
6. The maintainer designs these by hand. Use plan mode, propose, never merge: the public API of `defineEntity` and `definePlugin`, authentication, authorization, tenant isolation, the release pipeline.
7. Agents never merge into `main` and never push to it. When a branch is finished, keep it or open a pull request (`superpowers:finishing-a-development-branch`, those two options only).
8. Do not create git worktrees unless the maintainer asks for one. Work in the current checkout, on a branch if needed. This overrides the worktree step of `bieberkit-implement-task` and `superpowers:using-git-worktrees`.
9. If a Superpowers skill conflicts with this file, this file wins.

## Commits

- Conventional Commits, for example `feat(core): add lifecycle hooks`.
- Sign off every commit: `git commit -s` (DCO).
- Do not add `Co-Authored-By` trailers or "Generated with" lines to commits or pull requests, even when a Superpowers skill's template includes one.
- Never commit `.env` files, secrets or `dist/`.

## Do not touch without being asked

- `.github/workflows/`, the supply-chain settings in `pnpm-workspace.yaml`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/`, `.gemini/`, `.agents/` (SEC-14).
- Never use `pull_request_target`, and never give `id-token: write` to a job that installs, builds or tests.
- Never lower `minimumReleaseAge` or add to `allowBuilds` to make an install pass. Report the failure instead.
