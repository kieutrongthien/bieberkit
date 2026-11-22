<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-22-core-foundation.md
  @description Implementation plan for roadmap M1.1: the foundation of @bieberkit/core, in slices, test first.
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

# Core foundation (M1.1) implementation plan

Design: `docs/modules/core.md`. Roadmap: M1.1. Work is test first: each task writes the failing test, then the code, then runs the gates. One signed commit per task. Tests are named after the requirement IDs of the module spec.

Gates after every task, on Node.js 26: `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Slice A: errors, environment, logging

1. **errors** (`src/errors/`). `BkError`, `ConfigError`, `EnvValidationError`, `ContainerError`. Tests: MOD-17.
2. **env schema** (`src/config/env.ts`). `defineEnv`, `mergeEnv`, `readEnv`, `redact`, `describeEnv`. Tests: CFG-01, CFG-05, CFG-06, CFG-env.
3. **env file** (`src/config/env-file.ts`). `parseEnvFile`, `withEnvFile`. Tests: CFG-03, CFG-04.
4. **core env** (`src/config/core-env.ts`). `coreEnv`, `assertProductionSafe`, `loadEnv`. Tests: CFG-07 and the ephemeral-secret rule.
5. **env access check** (`tools/check-env-access.ts`). Wired into `pnpm check`. Tests: CFG-02, P8, with a negative control in a scratch clone.
6. **logging** (`src/logging/`). `createLogger`, `requestContext`. Tests: OBS-01, CORE-01, CORE-02, CFG-05.

## Slice B: container, lifecycle, events, roles

7. **container** (`src/container/`). Tests: CORE-03 to CORE-09.
8. **lifecycle** (`src/lifecycle/`). Tests: CORE-10 to CORE-13.
9. **events** (`src/events/`). Tests: MOD-03, MOD-05, CORE-14, CORE-15.
10. **roles** (`src/roles/`). Tests: CORE-16.
11. **coverage gate**. `@vitest/coverage-v8`, `test:coverage`, 90 percent lines for `packages/core/src`.
12. **exports, API report, changeset, roadmap ticks**.

## Stop

After slice B the work stops. The maintainer reviews the module spec and the tests of the maintainer-designed parts. Slice C (`defineModule`, `definePlugin`, `defineConfig`, `resolvePlugins`) and slice D (the "Done when" test app) get their own plan after that review.
