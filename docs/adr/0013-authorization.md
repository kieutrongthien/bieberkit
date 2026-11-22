<!--
  BieberKit

  @file        docs/adr/0013-authorization.md
  @description Proposed way to turn CASL conditions into MikroORM filters, with fail-closed rules and generated permission tests.
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

# 0013. Authorization: an own CASL to MikroORM translator

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer reviewed the spike results and accepted this ADR on 2026-11-22.
- Requirements: AUTHZ-01 to AUTHZ-05, DATA-15, DATA-19, PERF-04, SEC-07, P9, P12, spec sections 14.2, 21 and 26

## Context

AUTHZ-02 says CASL conditions are translated into MikroORM query conditions, so list endpoints return only permitted rows. The roadmap asks whether `@ucast/sql` on MikroORM 7 can do this, or whether BieberKit needs its own translator with a small operator set and generated permission tests. `@ucast/sql` 0.3.0 (Apache-2.0) ships a `./mikro-orm` interpreter.

CASL 7 gives both paths the same input: `rulesToAST(ability, action, subject)` returns a condition tree, `null` when nothing is permitted, and an empty `and` when everything is. Only the interpretation differs.

## Options

| Option                                                                               | For                                                                                             | Against                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A. `@ucast/sql/mikro-orm`                                                            | Ready made, from the CASL author                                                                | 4 to 5 of 18 cases raised database errors, including "can read everything" (see Evidence). Results differ by dialect. One more dependency |
| B. Own translator from the CASL tree to a MikroORM filter, with a fixed operator set | About 20 lines. Same behavior on every dialect. Anything unknown is refused before any SQL runs | We maintain it and must keep the operator set in step with CASL                                                                           |

## Decision

Option B.

1. **Input.** Always `rulesToAST`. `null` means deny. An empty `and` means no extra condition.
2. **Operators.** Field conditions `eq` (also `null`), `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, and the `and`, `or` and `not` nodes that CASL builds when it combines several rules. Fields must be properties of the entity.
3. **Fail closed.** Anything else (`$regex`, `$exists`, `$all`, `$size`, `$elemMatch`, a dotted path, an unknown field) throws `AUTHZ_UNSUPPORTED_CONDITION` before a query runs. The service answers 403 and writes an audit entry. Nothing widens.
4. **Conditions are code (section 14.2).** So `bieberkit check` rejects an unsupported operator in a declared condition at build time, and the runtime refusal is a second line.
5. **Condition language.** One operator per field, no `$or`, `$and` or `$not` inside a condition. CASL's default matcher does not evaluate them (rule R5 matched 0 rows in memory), so "or" is written as several rules and "not" as an inverted rule.
6. **Tenant filter.** It is AND-ed outside the translated condition, so no rule can remove it (DATA-15, DATA-19).
7. **Field masks (AUTHZ-03).** Read removes masked fields from the response, and write rejects them with a forbidden error. Both come from `permissions.fields` of ADR 0009 and CASL's `fields`.
8. **Audit (AUTHZ-05).** Denied attempts, unsupported conditions and `asSystem()` calls each write an audit entry.
9. **Generated permission tests.** The testing package generates the matrix from an entity's `permissions` block (section 21). Its own CI runs the six mutants of the spike against it, so it keeps its power.

## Evidence

Spike on 2026-11-22, Node.js 26.13.1, CASL 7.1.3, `@ucast/sql` 0.3.0, MikroORM 7.2.11, PostgreSQL 15.20, MySQL 8.4.13, SQLite 3.54.1. Sources are in `bieberkit-spikes/authz-spike`.

**Rows returned against CASL's own in-memory answer.** 600 rows (450 in the tenant), 18 rule cases: 11 supported ones (own rows, `$in`, `$gte` with `$ne`, no condition, an inverted rule, `Date`, null equality, `$ne: null`, ranges, a nullable column, and two can rules plus one cannot rule), one `$or` condition that CASL itself cannot evaluate, 4 unsupported ones, and 2 users with no usable rule.

| Dialect       | `@ucast/sql`: exact / error / too narrow / denied | Own translator: exact / fails closed / denied |
| ------------- | ------------------------------------------------- | --------------------------------------------- |
| PostgreSQL 15 | 11 / 4 / 1 / 2                                    | 11 / 5 / 2                                    |
| MySQL 8.4     | 11 / 4 / 1 / 2                                    | 11 / 5 / 2                                    |
| SQLite        | 10 / 5 / 1 / 2                                    | 11 / 5 / 2                                    |

Neither path returned a row that CASL would refuse. What differed:

- "Can read everything" (no condition) gave a SQL syntax error in `@ucast/sql` on all three dialects, because the empty `and` becomes `()`. The own translator returned all 450 rows.
- `$regex` worked on PostgreSQL and MySQL but failed on SQLite (`no such function: regexp`). The own translator refuses it everywhere.
- `$exists: true` returned 89 rows fewer than CASL permits on all three, because CASL treats a null column as existing and `IS NOT NULL` does not.
- A dotted path and an unknown field reached the database and came back as raw errors (`column c0.nope does not exist`), which also exposes schema names. The own translator refused them before any query.
- The `$or` condition matched 0 rows in CASL itself, so it is not part of the language (decision 5).

**Generated permission tests.** From one `permissions` block (four actions and one masked field, `email`) the generator made 19 tests: default deny with an audit entry, allowed with the permission, other permissions do not grant read, mask hidden and shown on read, mask rejected and accepted on write, tenant isolation (list, update, other tenant), conditions on list and update, unsupported operator denies, and `asSystem` audit. All 19 passed on all three dialects. Six mutants of the implementation (no tenant filter, no read mask, no write mask, no action check on update, conditions ignored, unsupported operator treated as allow-all) were each caught by at least one test, on all three dialects. The first run caught 5 of 6: the missing action check survived because the field check covered it unless the payload was empty. Adding "update with an empty payload is forbidden" fixed that, so the generator now includes it.

**Dependencies (P9).** `@casl/ability` 7.1.3 (MIT) is already proposed in ADR 0009, and brings `@ucast/core` and `@ucast/mongo2js` (Apache-2.0). `@ucast/sql` is not adopted.

**Not tested:** conditions through relations (joins), `$elemMatch`, the cost of building an ability per request and of large rule sets, query plans with conditions, `asSystem()` across tenants, impersonation (AUTHZ-05), counts and pagination together with the filter, bulk update and delete with conditions as SQL, authorizing creates, the HTTP layer, and PostgreSQL 18 and MariaDB.

## Consequences

- Easier: one small translator that behaves the same on every dialect and never widens. Permission tests come from the entity declaration, and the generator itself is tested by mutation.
- Harder: we keep the operator set and the build-time check in step with CASL. Conditions on relations need a separate design before they are allowed.
- Constraint: conditions use a small portable language. Anything richer is a service method, not a rule.
- Ruled out: `@ucast/sql`, runtime-edited conditions, and logical operators inside one condition.

## Spec changes

Made in spec 0.8.4, in the same pull request as these ADRs:

- AUTHZ-02: BieberKit's translator, the operator set, fail closed with `AUTHZ_UNSUPPORTED_CONDITION`.
- New AUTHZ-06: the condition language (decision 5) and the build-time check.
- AUTHZ-05: denied attempts and unsupported conditions are audited.
- Section 21: the generated matrix, and mutation testing of the generator.
- Section 26: close the open question on `@ucast/sql` against an own translator.

## Follow-ups

- A short design for conditions on relations before M1.4.
- Roadmap items for the translator, the check rule, the generator and the mutation job once the spec has the IDs.
- Re-run the 18 cases on PostgreSQL 18 and MariaDB.
