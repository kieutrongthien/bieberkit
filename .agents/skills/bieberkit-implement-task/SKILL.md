---
name: bieberkit-implement-task
description: Implement a BieberKit task end to end in the order the project requires, spec and tests first, then code, checks and a signed commit. Use for any feature, fix or refactor task in this repository.
---
<!--
  BieberKit

  @file        .agents/skills/bieberkit-implement-task/SKILL.md
  @description Agent skill for implementing a task spec-first and test-first.
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

## Steps

1. Find the requirement IDs for the task in `docs/spec/SPEC.md` (for example MOD-16, DATA-19). If the task has none, ask which section it belongs to before coding.
2. If the task changes a public API or the technology baseline, stop and write an ADR first (skill `bieberkit-write-adr`). If it adds a module, write a module spec from `docs/modules/_template.md`.
3. Write the tests first, next to the code as `*.test.ts`. Name each test after the requirement it proves, for example `it('MOD-16 rejects a transaction opened outside a service')`.
4. Show the tests to the maintainer when the task touches a maintainer-only area (AGENTS.md, Workflow). Otherwise continue.
5. Implement the smallest change that passes the tests. Follow the existing pattern in the nearest package, do not invent a second one.
6. Run, in this order: `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Fix every failure. Error codes come with a one-line fix.
7. Add a changeset with `pnpm changeset` when a published package changes behavior or API.
8. Commit with `git commit -s` and a Conventional Commit message. No `Co-Authored-By` trailer.

## Done when

- All four commands pass.
- Every new file has a correct header.
- The spec still describes what the code does. If not, the spec change is part of the same commit series.
