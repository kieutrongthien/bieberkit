<!--
  BieberKit

  @file        docs/adr/0001-record-architecture-decisions.md
  @description Decision to record architecture decisions as ADRs in the repository.
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

# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Requirements: AI-01, spec section 22.3

## Context

BieberKit has one maintainer and is built largely with AI coding agents. Agents start every session without memory of earlier discussions, and a project with one maintainer has a bus factor of one (spec section 26). Decisions that live only in chat history or in the maintainer's head get lost or silently reversed.

## Options

| Option | For | Against |
| --- | --- | --- |
| ADRs in `docs/adr/` | Versioned with the code, reviewed in pull requests, readable by agents | Some writing effort per decision |
| Decisions only in the spec | One document | Loses the options and the reasons, so decisions get reopened |
| Issues or discussions | Easy to start | Outside the repository, hard for agents to find |

## Decision

Record every architecture decision as a short ADR in `docs/adr/`, numbered in order and never renumbered. The spec states what the system is. ADRs state why.

## Consequences

- A change to the technology baseline (spec section 3) or a new runtime dependency needs an ADR.
- Agents use the skill `bieberkit-write-adr` and set new ADRs to `Proposed`. Only the maintainer accepts them.
- An accepted ADR is never rewritten. A new ADR supersedes it.

## Spec changes

None. Spec section 3 already requires an ADR for baseline changes.
