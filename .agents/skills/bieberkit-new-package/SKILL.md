---
name: bieberkit-new-package
description: Add a new workspace package under packages/ in the BieberKit repository, with the right layer, manifest, tsconfig, build config, header and test. Use when asked to create, add or scaffold a framework package.
---
<!--
  BieberKit

  @file        .agents/skills/bieberkit-new-package/SKILL.md
  @description Agent skill for adding a framework package.
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

# Add a framework package

A new package is rare. Check spec section 4.1 first: if the package is not listed there, write an ADR before creating it (skill `bieberkit-write-adr`).

## Steps

1. Pick the layer from spec section 4.3: foundation, contracts, product or tools. A package may depend only on its own layer or lower ones.
2. Copy the closest existing package folder of the same layer, for example `packages/cache` for a contract package. Do not start from an empty folder.
3. In `package.json` change `name`, `description`, the `@bieberkit/source` export path if needed, and `dependencies`. Keep `license`, `author`, `type`, `engines`, `exports` shape and `publishConfig` exactly as copied. Workspace dependencies use `"workspace:*"`.
4. Register the package in `PACKAGE_LAYERS` in `tools/lib/layers.ts`.
5. Rewrite every file header: `@file` must be the new path, `@description` must describe the new package. Run `pnpm check:headers` to confirm.
6. Keep `src/index.ts` as the only public entry until a subpath is needed. A driver adapter goes in `src/adapters/<driver>/index.ts` and gets its own entry in `exports` and in `tsdown.config.ts`.
7. Add the package to the table in `README.md` at the repository root if it is published.
8. Run `pnpm install`, `pnpm check`, `pnpm typecheck` and `pnpm test`.

## Done when

- `pnpm check` passes with no LAY or HDR codes.
- The package builds with `pnpm --filter <name> build` and `dist/index.d.ts` exists.
- A changeset exists if the package is meant to be published.
