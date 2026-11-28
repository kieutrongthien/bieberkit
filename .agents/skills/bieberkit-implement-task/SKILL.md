---
name: bieberkit-implement-task
description: Implement a BieberKit task end to end by running the Superpowers skills in the order this project requires, with BieberKit overrides for design docs, plans, gates and commits. Use for any feature, fix or refactor task in this repository.
---

<!--
  BieberKit

  @file        .agents/skills/bieberkit-implement-task/SKILL.md
  @description Agent skill that runs the Superpowers workflow for a task, spec-first and test-first, with BieberKit overrides.
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

# Implement a task

This repository works with the Superpowers plugin. The generic process lives in its skills. This skill only says which Superpowers skill to run at each step and what BieberKit changes about it. Where the two disagree, this file and AGENTS.md win.

## Steps

1. Find the requirement IDs and the roadmap item. Open `docs/ROADMAP.md` for the item and `docs/spec/SPEC.md` for its IDs (for example MOD-16, DATA-19). If the task has no ID, ask which section it belongs to before going on.
2. Design. Run `superpowers:brainstorming` for anything that adds behavior or changes a public API. Its design document is an ADR (`docs/adr/`, skill `bieberkit-write-adr`) or a module spec (`docs/modules/_template.md`). Do not create `docs/superpowers/specs/`. Skip this step for a fix or refactor whose requirement is already exact in the spec.
3. Plan. Run `superpowers:writing-plans` for work of more than one task. Save the plan to `docs/superpowers/plans/YYYY-MM-DD-<name>.md` with a file header (skill `bieberkit-file-headers`). A roadmap milestone is split into plan tasks, and the milestone is ticked only when its items are.
4. Isolate. Use `superpowers:using-git-worktrees` when the change is more than a few files. Worktrees live in `.worktrees/`, which is ignored.
5. Tests first with `superpowers:test-driven-development`. Tests sit next to the code as `*.test.ts`, and each is named after the requirement it proves, for example `it('MOD-16 rejects a transaction opened outside a service')`.
6. Maintainer gate. When the task touches a maintainer-only area (AGENTS.md, Workflow) or an item tagged **[D]** in the roadmap, stop after the tests, show them and wait. Otherwise continue.
7. Implement with `superpowers:subagent-driven-development`, or `superpowers:executing-plans` for a single-session run. Smallest change that passes the tests, following the nearest existing package pattern (P1). Put each new file in the folder of its kind (AGENTS.md, File layout); start a module or plugin with `make:module` or `make:plugin`. On any failure, run `superpowers:systematic-debugging` before changing code.
8. Verify with `superpowers:verification-before-completion`. The commands are, in this order: `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Claim nothing until all four have run in this session and passed.
9. Review with `superpowers:requesting-code-review` before a pull request. Handle feedback with `superpowers:receiving-code-review`.
10. Add a changeset with `pnpm changeset` when a published package changes behavior or API.
11. Commit with `git commit -s` and a Conventional Commit message. No `Co-Authored-By` and no "Generated with" line, even if a Superpowers skill's template shows one.
12. Tick the roadmap items the commit completes, in the same commit.

## Overrides of Superpowers defaults

- Design documents go to `docs/adr/` or `docs/modules/`, never `docs/superpowers/specs/`.
- `superpowers:finishing-a-development-branch`: only the options that leave the branch for the maintainer are allowed (keep the branch, or open a pull request). Never merge into `main`, never push to `main`, never discard a branch without being told. Agents propose, the maintainer merges.
- Every file a skill writes (plans, notes, docs) needs the project header.
- Plan mode is still required before touching a maintainer-only area.

## Done when

- All four commands pass, with output seen in this session.
- Every new file has a correct header.
- The spec still describes what the code does. If not, the spec change is part of the same commit series.
- The roadmap items this work completes are ticked.
