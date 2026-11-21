<!--
  BieberKit

  @file        CLAUDE.md
  @description Claude Code entry point that imports AGENTS.md and adds Claude-specific notes.
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

@AGENTS.md

## Claude Code

- Skills live in `.claude/skills/` as a mirror of `.agents/skills/`. Edit `.agents/skills/`, then run `pnpm sync:skills`.
- A hook checks the header of every file you write or edit. When it reports a problem, fix the header before moving on.
- Install the Superpowers plugin (`superpowers@claude-plugins-official`). It is the only plugin this workflow assumes. The repository skills in `.claude/skills/` cover only what Superpowers does not: headers, ADRs, new packages and the task order.
- Use plan mode before touching any of the maintainer-only areas listed under Workflow in AGENTS.md.
- Commit attribution is off in `.claude/settings.json`. Keep it off.
