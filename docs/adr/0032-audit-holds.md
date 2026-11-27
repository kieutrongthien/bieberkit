<!--
  BieberKit

  @file        docs/adr/0032-audit-holds.md
  @description Decision record: legal holds on audit entries live in a framework table that the prune command reads, and a hold is released by a mark and not by a delete.
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

# 0032. Legal holds on audit entries are a framework table

- Status: Accepted
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: AUD-06, AUD-09, DATA-24, DATA-25, PKG-01, PLG-01

## Context

AUD-09 asks that an administrator can place a hold on an entity, a record or an actor, and that `bieberkit audit:prune` never deletes an entry under a hold and says how many it kept. The command is `pruneAuditLog` in `@bieberkit/data`, run through `@bieberkit/server` on `MIGRATE_DATABASE_URL`, without any plugin loaded. The routes that place a hold are in the `audit-log` plugin.

Constraints:

- **Layers (PKG-01).** `data` cannot import a plugin, and the prune must know the holds. The table has to be readable from `data`.
- **Plugin tables.** A plugin table is created by the project migration (`migrate:make`), and the prune of a project that did not load the plugin would not find it (PLG-01).
- **Append-only audit (DATA-25).** The application role may not delete audit rows. A hold changes what a later prune may do, so a hold must not disappear silently.

## Options

| Option                                                                                   | For                                                                            | Against                                                                               |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A. A framework table `bk_audit_holds` next to `bk_audit_log`, with a data migration step | Prune reads it with no plugin; same migration path as the audit log; one owner | `data` gains a table that only the audit-log plugin writes                            |
| B. A plugin table, and `pruneAuditLog` takes the holds as an argument                    | `data` stays smaller                                                           | The CLI would have to load the plugin to know the holds, and a missing one skips them |
| C. Holds as audit entries (`audit-log.hold.placed`), read by the prune                   | No new table                                                                   | A release is a second entry, and the prune would scan the log it prunes               |

## Decision

Option A. The framework gets the table `bk_audit_holds` (data migration step 0.5.0) and the entity `AuditHold`:

- `id`, `tenant` (empty means every tenant), `entity`, `recordId`, `actorId` (at least one of the three), `reason` (required), `createdAt`, `createdBy`, `releasedAt`, `releasedBy`.
- A hold covers the entries that match every field it sets, in its tenant. It is **released by setting `releasedAt`**, never by a delete, and each placing and release writes an audit entry (`audit-log.hold.placed`, `audit-log.hold.released`).
- `pruneAuditLog` excludes the entries covered by a hold that is not released, counts them as `kept`, and the command prints the number.
- At most 200 holds are active at once (`AUDIT_HOLD_LIMIT`, 409), so the prune builds one bounded condition.
- The `audit-log` plugin owns the routes `POST` and `DELETE /api/v1/audit-log/holds` and `GET` of the list, with the permission `audit-log.hold`. `DELETE` releases.

## Evidence

- `pruneAuditLog` and the audit table: `packages/data/src/orm/audit.ts`, `framework.ts`.
- Framework steps and their versions: `dataMigrationSteps` in `packages/data/src/orm/framework.ts`.

## Consequences

- **Easier.** The prune is correct for any project, and the holds survive a plugin being removed.
- **Harder.** The application role needs `select`, `insert` and `update` on `bk_audit_holds`, which the deploy grants cover as for any table other than the audit log.
- **Ruled out.** Deleting a hold row, and a prune that does not know the holds.

## Spec changes

- Section 12.9 with AUD-07 to AUD-09. Section 5.2: `audit:prune` prints the number kept.
- Document history.

## Follow-ups

- Holds on a time range, if a case needs one.
