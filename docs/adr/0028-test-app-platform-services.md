<!--
  BieberKit

  @file        docs/adr/0028-test-app-platform-services.md
  @description Reuse the mail and cache contracts as internal runtime dependencies of the test app.
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

# 0028. The test app reuses the mail and cache contracts

- Status: Proposed
- Date: 2026-11-25
- Deciders: Bieber Kieu
- Requirements: P1, P9, PKG-01, TST-02; proposed BPL-02 in the base-plugins design

## Context

Slice S0 registers mail, queue and cache for plugins in the server and in `createTestApp`. Testing already depends on queue, but does not declare mail or cache. Their in-memory implementations exist; duplicating them would give tests different behavior from the contracts.

## Options

| Option                                                   | For                                                            | Against                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Depend on the existing mail and cache workspace packages | Real validation, queue integration and cache behavior in tests | Two internal dependency edges                               |
| Implement local test doubles                             | No new dependency edges                                        | Duplicates contracts and can hide integration failures      |
| Leave the services absent                                | No change                                                      | Does not satisfy BPL-02; plugins cannot run in the test app |

## Decision

Add `@bieberkit/mail` and `@bieberkit/cache` as `workspace:*` runtime dependencies of `@bieberkit/testing`. Use `createMailer` with `createMemoryTransport` and `createCache` with `createMemoryEngine`; keep the existing sync queue.

| Dependency         | Reason                                                             | Maintainer  | License    |
| ------------------ | ------------------------------------------------------------------ | ----------- | ---------- |
| `@bieberkit/mail`  | Real mailer validation and queued delivery into a readable mailbox | Bieber Kieu | Apache-2.0 |
| `@bieberkit/cache` | The same cache contract, backed by memory                          | Bieber Kieu | Apache-2.0 |

These are internal workspace edges from the product layer to contracts (PKG-01), with no new third-party dependency or technology-baseline change.

## Evidence

[The S0 plan](../superpowers/plans/2026-11-25-base-plugins-s0-platform.md), Task 3, records the maintainer-reviewed RED suite: 16 expected failures, 43 passes, no skips across the boot, auth-mail and three-dialect test-app tests. The missing services, mailbox and mail callbacks account for the failures.

## Consequences

Plugins can consume the same typed services in tests and in a real boot. The test app owns and closes its in-memory mailer, queue and cache. Human-facing authentication messages are tested in the server; the test app captures links through its memory mailer without importing the higher server layer.

## Spec changes

Add the S0 service-registry requirement BPL-02 and describe the mailbox/outbox helpers in section 21 (TST-02) in the same pull request. Sections 3 and 4.3 retain their technology baseline and layer rules.

## Follow-ups

Implement and verify Task 3, update package manifests and the lockfile, and include the API reports and changesets in this slice. Only the maintainer may change this ADR's status to Accepted.
