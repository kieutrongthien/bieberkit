<!--
  BieberKit

  @file        docs/adr/0007-generated-project-license.md
  @description Proposed default license of projects created by create-bieberkit, an open question in spec section 26.
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

# 0007. Default license of generated projects

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer asked the implementing agent to choose the best option. The choice stands until the maintainer overrides it with a superseding ADR.
- Requirements: spec section 6, section 8.3, section 23.7, spec section 26 (open question)

## Context

The scaffolder writes `license` into `bieberkit.config.ts` and into the header of every file it creates (spec 23.7). The spec example uses `UNLICENSED`, and section 26 asks whether that stays the default. The framework is Apache 2.0, but the code a user generates is their application: management-style business apps, often private. Files copied from the registry keep the BieberKit Apache 2.0 header either way (23.7), so this choice does not touch them.

## Options

| Option | For | Against |
| --- | --- | --- |
| A. `UNLICENSED` default, `--license <SPDX id>` flag and prompt to change it | Safe for private business code: grants nothing, the owner decides. Matches npm's convention for private packages | An open-source user must set a flag. A published package with `UNLICENSED` cannot be reused by others |
| B. Apache-2.0 default | Same as the framework. Open by default | Publishes private business code by default, which is the wrong failure for most users |
| C. MIT default | Short and common | Same problem as B, and a second license in the ecosystem |
| D. No default, always ask | Forces a conscious choice | `--yes` means "accept defaults, never prompt" (spec 5.1), so it would need a default anyway |

## Decision

Option A. Keep `UNLICENSED` as the default and add `--license <SPDX id>` with a matching prompt. Accept any SPDX identifier plus `UNLICENSED`. The scaffolder writes the matching `LICENSE` file for a known SPDX id and writes none for `UNLICENSED`. The header uses the chosen identifier in `@license` and `SPDX-License-Identifier`.

## Evidence

Spec 8.3 already shows `license: 'UNLICENSED'`, and 23.7 already says "default `UNLICENSED`". This ADR confirms an existing default instead of changing it. The flag table in spec 5.1 has no `--license` flag today, and spec 5.1 requires that every prompt has an equivalent flag, so adding the prompt means adding the flag. Not checked: how npm, GitHub and license scanners treat `UNLICENSED` in a header comment.

## Consequences

- Easier: private projects start safe.
- Harder: the scaffolder needs a small table of license texts for the ids it supports (Apache-2.0, MIT, others on request), under the same one-way rule (P1).
- Ruled out: a different default per template.

## Spec changes

Made in spec 0.8.1, in the same pull request as this ADR.

- Section 5.1: add a `--license` row (values: an SPDX id or `UNLICENSED`, default `UNLICENSED`). It does not exist today.
- Section 23.7: state that the header and `LICENSE` follow the chosen id.
- Section 26: tick the open question.

## Follow-ups

- Test named after spec 23.7: scaffold with `--license MIT` and check the header, `LICENSE` and `package.json`.
