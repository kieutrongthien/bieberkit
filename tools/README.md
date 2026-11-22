<!--
  BieberKit

  @file        tools/README.md
  @description Index of the repository tools and the commands that run them.
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

# Repository tools

Scripts for working on this repository. They are written in erasable TypeScript and run directly with `node`, no build step. They are never imported by packages.

| Command                             | Script                | Purpose                                                                                                                         |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:headers`                | `check-headers.ts`    | File headers (spec section 23). `--fix`, `--staged`, `--json`, `--claude-hook`                                                  |
| `pnpm check:layers`                 | `check-layers.ts`     | Package layers and driver imports (PKG-01 to PKG-04)                                                                            |
| `pnpm check:env-access`             | `check-env-access.ts` | Only `packages/core/src/config/` reads the process environment (CFG-02, P8). Comments are skipped, imports are matched per line |
| `pnpm sync:skills`                  | `sync-skills.ts`      | Mirrors `.agents/skills` into `.claude/skills`. `--check` for CI                                                                |
| `pnpm check:workflows`              | `check-workflows.ts`  | Workflow rules SEC-15, SEC-16 and SEC-21 (ADR 0014). actionlint and zizmor run in CI                                            |
| `pnpm check:api`, `pnpm api:update` | `api-report.ts`       | API report of each package, checked against the built `.d.ts` files. Run `pnpm build` first                                     |
| `pnpm check:packages`               | `check-packages.ts`   | Packs every package and runs publint and `attw --profile esm-only` on the tarballs. Run `pnpm build` first                      |
| `node tools/release-order.ts`       | `release-order.ts`    | Publish order of the packages (layer, then name), written next to the tarballs by the release build job                         |
| `sh tools/bootstrap.sh`             | `bootstrap.sh`        | First-time setup of a checkout                                                                                                  |

Every violation prints a stable code (for example `HDR003`, `LAY002`, `SKL001`) and a one-line fix (AI-02).
