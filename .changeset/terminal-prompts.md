---
'create-bieberkit': minor
'bieberkit': patch
---

<!--
  BieberKit

  @file        .changeset/terminal-prompts.md
  @description Changeset for the arrow-key prompts of create-bieberkit and the prompts port of the kit (ADR 0029).
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

`pnpm create bieberkit` asks with arrow keys, as create-vite does: the name, the database, the template and extra plugins when there is a choice, the admin, the license, the install and git, then a summary to confirm. Writing, installing and git run under spinners. Flags, `--yes` and `--json` are unchanged. The kit's `Ask` function is replaced by a `Prompts` port, with `terminalPrompts()` and `scriptedPrompts()` for tests; `bieberkit remove` and `bieberkit backup:verify` ask through it. `@clack/prompts` is bundled into `dist`, so the install gains no package.
