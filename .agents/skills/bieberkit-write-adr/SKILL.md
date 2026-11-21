---
name: bieberkit-write-adr
description: Write an architecture decision record in docs/adr for BieberKit. Use before changing anything in the technology baseline, adding a runtime dependency, adding a package, or when a task says "ADR", "decision" or "spike result".
---
<!--
  BieberKit

  @file        .agents/skills/bieberkit-write-adr/SKILL.md
  @description Agent skill for writing an architecture decision record.
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

# Write an ADR

## Steps

1. Read `docs/adr/README.md` for the index and the next free number. Numbers never get reused.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-short-kebab-title.md`. Set the header `@file` and `@description`.
3. Fill every section. Context states the problem and the constraints from the spec, with requirement IDs (for example SEC-11, DATA-19). Options lists at least two real alternatives, including "do nothing" when it is viable.
4. Evidence beats opinion. For spike results, link the spike branch or folder and paste the numbers.
5. Set Status to `Proposed`. Only the maintainer changes it to `Accepted`.
6. Under "Spec changes", list each section of `docs/spec/SPEC.md` that must change. Make those edits in the same pull request.
7. Add the ADR to the index table in `docs/adr/README.md`.

## Rules

- One decision per ADR.
- Never edit the decision of an accepted ADR. Write a new ADR that supersedes it and set the old one to `Superseded by NNNN`.
- Keep it under two pages. Link to sources instead of copying them.
