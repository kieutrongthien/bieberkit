<!--
  BieberKit

  @file        docs/adr/0002-formatter-oxfmt.md
  @description Decision to keep Oxfmt as the code formatter, with the conditions found by the Phase 0 spike.
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

# 0002. Formatter: Oxfmt, with conditions

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer asked the implementing agent to choose the best option. The choice stands until the maintainer overrides it with a superseding ADR.
- Requirements: spec section 3 (Formatting row), HDR-01, SEC-11

## Context

Spec section 3 fixes Oxfmt and names the Biome formatter as the fallback "if Oxfmt is not stable enough at Phase 0". The roadmap (M0.2) asks for a decision. Oxfmt is pinned at 0.78.0 (0.79.0 is the latest, published 2026-11-16). It is still a 0.x tool with 81 published 0.x versions, so its output can change between releases.

The spike ran both tools on the repository at commit `f176ffb`.

## Options

| Option                   | For                                                                                                                  | Against                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A. Keep Oxfmt            | Same Oxc toolchain as Oxlint and tsdown. Already configured and pinned. Formats TypeScript, JSON and Markdown tables | 0.x: output may change between releases, so each bump can reformat many files              |
| B. Biome formatter 2.6.8 | Past 1.0, MIT OR Apache-2.0. Also formats TypeScript, JSON and Markdown                                              | A second toolchain beside Oxlint. Replaces a working setup with no gain shown by the spike |
| C. Prettier              | Most widely used                                                                                                     | Not in the baseline. Slower, and not part of the Oxc toolchain. Not evaluated in the spike |
| D. No formatter          | Nothing to maintain                                                                                                  | Agent-written code drifts in style, and reviews fill with style comments                   |

## Decision

Keep Oxfmt (option A), pinned to an exact version, on three conditions:

1. Format the whole repository once, in its own commit, before CI is switched on.
2. Make the header checker accept blank lines between a Markdown frontmatter block and the header comment (see Evidence, finding 3).
3. The fallback to Biome is triggered only by a formatting rule that Oxfmt cannot configure, or by a release that changes the output of already formatted files and cannot be pinned around.

## Evidence

Commands run from the repository root. The changes were reverted afterwards.

1. `pnpm format:check` fails at HEAD: 63 of 162 files are not formatted (all 18 `package.json`, all 18 `tsconfig.json`, 8 `SKILL.md`, 3 ADR files, 2 files in `tools/` and others). The scaffold was never formatted. `.github/workflows/ci.yml` runs this command, so CI as it stands would fail on its first run.
2. After `oxfmt --write`: `oxfmt --check` passes, the second pass changes nothing, and `pnpm test` still passes (19 files, 25 tests). The diff is 63 files, +374 and −476 lines. TypeScript changes are line wrapping at the 120 column limit. Markdown changes are table padding. `package.json` changes are key order (`engines` and `packageManager` move).
3. After formatting, `pnpm check:headers` reports 8 HDR001 failures, all in `SKILL.md` (4 in `.agents/skills/`, 4 in `.claude/skills/`). Oxfmt inserts a blank line between the frontmatter and the header comment, and the checker treats the header as missing. Biome 2.6.8 inserts the same blank lines on the same file, so this is not specific to Oxfmt. HDR-01 says the header is "the first content of the file", and a blank line is not content, so the checker is stricter than the spec.
4. Biome 2.6.8 formats TypeScript, JSON and Markdown tables, so the fallback is real.

## Consequences

- Easier: one formatter for TypeScript, JSON and Markdown, in the same toolchain as the linter.
- Harder: every Oxfmt bump may produce a formatting diff. Renovate PRs for `oxfmt` must run `oxfmt --write` in the same PR.
- The formatting commit is large, so it goes in separately and is listed in `.git-blame-ignore-revs`.

## Spec changes

Made in spec 0.8.1, in the same pull request as this ADR.

- Section 3, Formatting row: replace "The Biome formatter is the fallback if Oxfmt is not stable enough at Phase 0" with "Pinned exactly. The Biome formatter is the fallback (ADR 0002)".
- Section 23.6 (HDR-01): add that blank lines between a frontmatter block and the header are allowed.

## Follow-ups

- Format the repository in one commit.
- Change `tools/check-headers.ts` to allow blank lines after frontmatter, with a test named `HDR-01`.
- Update the sentence in `AGENTS.md` ("the header comes right after the frontmatter"). This file is maintainer-only, so it is proposed, not edited.
- Roadmap M0.3: the CI item stays open until a CI run passes.
