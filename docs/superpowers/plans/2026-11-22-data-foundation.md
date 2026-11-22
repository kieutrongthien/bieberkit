<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-22-data-foundation.md
  @description Implementation plan for roadmap M1.2 slice 1: the foundation of @bieberkit/data, test first.
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

# Data foundation (M1.2, slice 1) implementation plan

Design: `docs/modules/data.md`. Roadmap: M1.2. Each task writes the failing test, then the code, then runs the gates, and ends in one signed commit. Tests are named after the requirement IDs of the module spec.

Gates after every task, on Node.js 26: `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Tasks

1. **keys**: `src/keys/uuid7.ts`. Tests: DATA-03.
2. **text**: `src/text/fold.ts`. Tests: DATA-21, SCH-05, SCH-03.
3. **numbers**: `src/numbers/scaled.ts`. Tests: DATA-22, MOD-11.
4. **pagination**: `src/query/page.ts`. Tests: DATA-06, DATA-11.
5. **dependencies and subpath**: `@mikro-orm/*` pinned, `exports` for `./orm`, second tsdown entry, `check:layers` green.
6. **Uuid7Type**: `src/orm/uuid7-type.ts`. Tests: DATA-14 on every dialect.
7. **dialect harness**: `src/testing/dialects.ts`. Tests: the harness itself, including `BK_REQUIRE_DIALECTS`.
8. **SQLite driver**: `src/orm/sqlite.ts`. Tests: DATA-23 with two connections to one file.
9. **connection and unit of work**: `src/orm/connect.ts`. Tests: DATA-04, DATA-05, connection errors.
10. **gates**: coverage threshold for `packages/data/src`, API report, changeset, roadmap ticks.

## Stop

After task 10 the work stops. The maintainer reviews `docs/modules/data.md`, mainly the proposals and the open questions. Slice 2 gets its own plan after that.
