<!--
  BieberKit

  @file        docs/README.md
  @description Map of the documentation folder.
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

# Documentation

| Path           | Content                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `spec/SPEC.md` | The BieberKit specification. Source of truth for design and requirement IDs  |
| `ROADMAP.md`   | Phase by phase checklist to 1.0. Agents tick items as work lands             |
| `adr/`         | Architecture decision records. Changes to the technology baseline start here |
| `modules/`     | Short specs for modules and packages, written before their code              |

Requirement IDs (for example `PKG-01`, `DATA-19`, `SEC-11`) are stable. Code, tests, ADRs and commit messages refer to them.

User-facing documentation is written in Phase 3 and is bundled into each package at build so that it matches the installed version (spec section 22.1).
