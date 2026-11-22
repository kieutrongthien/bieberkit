<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-22-data-schema.md
  @description Implementation plan for roadmap M1.2 slice 2: the field DSL, defineEntity and the schema compilers, test first.
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

# Data schema (M1.2, slice 2) implementation plan

Design: `docs/modules/data.md`, ADR 0009. The tests are written and wait for the maintainer's review. Implementation follows them, one task per test file, each ending in one signed commit. Gates after every task on Node.js 26: `pnpm check`, `typecheck`, `lint`, `test`.

## Tasks

1. **Fields and the entity** (`src/schema/fields.ts`, `define-entity.ts`, `patterns.ts`, `index.ts`). Tests: `fields.test.ts`, `define-entity.test.ts`. Root exports `f`, `defineEntity`, `EntityDef`, `standardColumns`, `tableConstraints`, and a `./schema` subpath in `package.json` and `tsdown.config.ts`.
2. **NFC step** (`src/schema/normalize.ts`). Tests: `normalize.test.ts`.
3. **JSON Schema** (`src/schema/json-schema.ts`). Tests: `json-schema.test.ts`.
4. **Zod Mini** (`src/schema/zod-mini.ts`). Tests: `zod-mini.test.ts`.
5. **Contract suite**. Tests: `contract.test.ts` with `src/testing/contract.ts`. Any disagreement found here is fixed in the compilers, never in the fixtures.
6. **Registry types** (`src/schema/registry.ts`). Tests: `registry.test.ts`.
7. **Client bundle**. Tests: `bundle.test.ts`.
8. **Gates**: API report for the new subpath, changeset, ROADMAP ticks, coverage threshold stays at 90 percent.

## Stop

Slice 3 (ORM compiler and the tenant model) starts after slice 2 is reviewed and merged.
