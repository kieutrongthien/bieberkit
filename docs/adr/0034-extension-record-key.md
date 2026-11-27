<!--
  BieberKit

  @file        docs/adr/0034-extension-record-key.md
  @description Decision record: the table of an extension keys its row by a unique reference to the record of the target, like the table of translations, instead of using the id of the target as its own key.
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

# 0034. The row of an extension is keyed by a unique `record`, not by the id of the target

- Status: Proposed
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: PLG-06, DATA-19, DATA-26, P1
- Supersedes: the first sentence of decision 1 of [ADR 0033](0033-entity-extensions.md)

## Context

Decision 1 of ADR 0033 says that the primary key of an extension table is `id`, equal to the id of the target row, with a foreign key to the target (composite with `tenant_id` for a tenant target). While it was built, the compiler turned out to have one way to make a table that points at another entity: a `belongsTo` relation, with its composite key for tenants, which the table of translations (`<table>_i18n`) already uses on the three dialects. A primary key that is also a foreign key, and composite with `tenant_id`, is a second form of relation that the compiler, the migration diff and the three dialects would have to learn, for a gain that a unique key gives as well.

## Options

| Option                                                                                                        | For                                                                                                                                         | Against                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A. `id` of the extension is its own, and `record` is a unique foreign key to the target (as the translations) | The compiler and the diff are those of the translations; the tenant key is the one of DATA-26; the tests of the three dialects are the same | One more column (`id`) and one more index than a shared key                                          |
| B. The id of the target is the primary key of the extension (ADR 0033, decision 1)                            | One row, no extra column                                                                                                                    | A primary key that is a composite foreign key is new to the compiler, the diff and the dialects (P1) |

## Decision

Option A. The extension entity has the standard columns and `record`, a `belongsTo` of the target with `on delete cascade`, and a unique key on `record` (on `(tenant_id, record)` for a tenant target). There is at most one extension row for each row of the target, and it goes when the target goes. Nothing else of ADR 0033 changes: the declaration, the effective entity, the reads, the writes, the permissions and the limits are as decided there.

## Consequences

- The extension table has the columns `id`, `record_id`, `tenant_id` (for a tenant target), the standard columns and the fields. A project that reads the table by hand finds the target in `record_id`.
- Option B stays possible later, as a change of the compiler for every relation and not for extensions alone.

## Spec changes

- PLG-06: the table has one row for each row of the target, found by a unique foreign key to it.
