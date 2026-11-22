---
name: bieberkit-file-headers
description: Write or repair the mandatory Apache 2.0 file header that every BieberKit file needs. Use when creating any new file, when pnpm check:headers fails, or when moving or renaming files.
---

<!--
  BieberKit

  @file        .agents/skills/bieberkit-file-headers/SKILL.md
  @description Agent skill for writing and repairing mandatory file headers.
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

# File headers

Every file that can hold a comment starts with the header from spec section 23. The checker is `tools/check-headers.ts`.

## Which comment style

| Files                                                                                                  | Style                                               |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `.ts` `.tsx` `.js` `.mjs` `.cjs` `.css`                                                                | `/** ... */` block, lines start with `*`            |
| `.yaml` `.yml` `.toml` `.sh`, `Dockerfile`, `.gitignore`, `.editorconfig`, `CODEOWNERS`, `.githooks/*` | `#` lines                                           |
| `.md` `.mdx` `.html`                                                                                   | one `<!-- ... -->` block, lines indented two spaces |
| `.sql`                                                                                                 | `--` lines                                          |
| JSON, lockfiles, `LICENSE`, `NOTICE`, images, fonts                                                    | exempt, no header                                   |

The header goes first. Only a shebang, a Dockerfile `# syntax=` line or Markdown frontmatter may come before it.

Files written by Superpowers skills need it too: plans in `docs/superpowers/plans/` and any note or doc a skill creates. Add the header right after the file is written, before the next step.

## Steps

1. Copy the header from an existing file with the same style.
2. Set `@file` to the path from the repository root, for example `packages/core/src/kernel.ts`.
3. Write `@description` as one sentence saying what the file does. Not "This file...", just the action: "Boots modules and plugins and manages the application lifecycle."
4. Keep the year of creation in `@copyright`. Never bump it on edits.
5. Keep Bieber Kieu as the first `@author`. Generated files add `@generated <command>` after the authors.
6. Run `pnpm check:headers`. For a renamed or moved file, `pnpm check:headers --fix` corrects `@file`.

## Error codes

- HDR001 missing header, HDR002 wrong `@file`, HDR003 empty `@description`, HDR004 wrong first author, HDR005 layout differs, HDR006 unknown file type.
