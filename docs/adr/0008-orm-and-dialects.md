<!--
  BieberKit

  @file        docs/adr/0008-orm-and-dialects.md
  @description Proposed decision to build on MikroORM 7 across PostgreSQL, MySQL and SQLite, with the rules the Phase 0 spike showed are needed.
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

# 0008. ORM and dialects: MikroORM 7, with rules from the spike

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer reviewed the spike results and accepted this ADR on 2026-11-22.
- Requirements: DATA-03, DATA-14, DATA-16, DATA-18, DATA-20 to DATA-23, MOD-11, MOD-18, PERF-04, API-13, P9, P12, spec sections 3 and 9

## Context

Spec section 9 commits to MikroORM 7 with `defineEntity` as one definition for PostgreSQL 15+, MySQL 8.4 and SQLite 3. Roadmap M0.2 asks for a spike before the commitment is final. The questions were: does one entity set work on all three, how do UUIDv7 keys, integer money, text comparison and tenant foreign keys behave, and what has to be added on top.

## Options

| Option                              | For                                                                                                                                                       | Against                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A. MikroORM 7.2 with `defineEntity` | All 8 behavior checks passed on PostgreSQL, MySQL and MariaDB, and 7 of 8 on SQLite (money above 2^53 fails, and has a simple rule). Already the baseline | Several core libraries rely on one main maintainer (spec section 26). Typings reject two things that work at runtime |
| B. Drizzle                          | Light and typed                                                                                                                                           | Rejected in spec 9: no shared table type, so each plugin needs three schemas                                         |
| C. Kysely directly                  | MikroORM 7 already sits on Kysely 0.29.9                                                                                                                  | We would write the unit of work, identity map, versioning and migrations ourselves                                   |

## Decision

Option A, with MikroORM pinned to an exact 7.2.x version, and these rules. Each rule is backed by a measurement below.

1. **Drivers**: `@mikro-orm/postgresql`, `@mikro-orm/mysql` and `@mikro-orm/sqlite` (better-sqlite3 13.2.0, which ships prebuilt binaries and has no install script). MariaDB 11 also passed everything, which supports ADR 0005 (best effort).
2. **UUIDv7 (DATA-03, DATA-14)**: a custom `Uuid7Type` picks `uuid`, `binary(16)` or `blob` by platform and converts to a string in JavaScript. The generator is our own, because Node.js has no UUIDv7.
3. **Money (MOD-11, DATA-22)**: `bigint` minor units, and never `DECIMAL`. Validation limits every money value to the safe integer range (about 9.007e15) on all dialects, so SQLite behaves like the others and the JSON API stays exact. Turning on `safeIntegers` in better-sqlite3 was rejected: it makes every integer column, including `version`, a `bigint`.
4. **Text comparison (DATA-21)**: `ci` and `ci_ai` use shadow columns that the application folds (Unicode NFC, lowercase, strip combining marks, map `đ` to `d`), with plain equality and a normal index. Native collations are not used. `ci_ai` therefore treats `đ` and `d` as equal. This is a product decision, so it is stated here.
5. **Tenant foreign keys (DATA-20)**: keep a single-column `id` primary key, add `UNIQUE (tenant_id, id)`, and declare the relation with `joinColumns('tenant_id', 'x_id').referencedColumnNames('tenant_id', 'id')`. The child's own `tenant_id` column is the first FK column.
6. **SQLite (DATA-23)**: after init, set `journal_mode = WAL` and `synchronous = NORMAL` through `getNativeClient()`. Provide `BEGIN IMMEDIATE` through our own Kysely driver override in `@bieberkit/data`, because MikroORM issues a plain `begin`.
7. **Outbox (MOD-18)**: `FOR UPDATE SKIP LOCKED` on PostgreSQL, MySQL and MariaDB. SQLite has no such syntax, so a single writer with `BEGIN IMMEDIATE` replaces it.
8. **Migrations (DATA-08)**: use `@mikro-orm/migrations` snapshots. The destructive-statement check scans the generated SQL for `drop column` and `drop table`.

## Evidence

Spike on 2026-11-22. Sources are throwaway and outside the repository. Environment: the whole spike ran twice, on Node.js 22.23.2 and on Node.js 26.13.1 (the default of this project), with identical results. Node.js 24 was not run. MikroORM 7.2.11, containers `postgres:15` (15.20), `postgres:18` (18.7), `mysql:8.4` (8.4.13), `mariadb:11` (11.8.9), and SQLite 3.54.1.

| Check                                                                           | PG 15  | PG 18   | MySQL 8.4    | MariaDB 11   | SQLite                        |
| ------------------------------------------------------------------------------- | ------ | ------- | ------------ | ------------ | ----------------------------- |
| Schema generation from one `defineEntity` set                                   | pass   | pass    | pass         | pass         | pass                          |
| Id column type (DATA-14)                                                        | `uuid` | `uuid`  | `binary(16)` | `binary(16)` | `BLOB`                        |
| 60 ids: order by id = creation order, lookup by string                          | pass   | pass    | pass         | pass         | pass                          |
| Money 2^63-1 and 2^53+1 round trip                                              | pass   | pass    | pass         | pass         | **fail** (reads as JS number) |
| Stale write rejected by `version` (API-13)                                      | pass   | pass    | pass         | pass         | pass                          |
| Tenant filter and unscoped read (DATA-09)                                       | pass   | pass    | pass         | pass         | pass                          |
| Soft delete with `deleted_token` unique (DATA-16)                               | pass   | pass    | pass         | pass         | pass                          |
| Populate: 2 queries for 5 customers and 15 orders (PERF-04)                     | pass   | pass    | pass         | pass         | pass                          |
| Composite tenant FK rejects a cross-tenant child (DATA-20), composite PK design | pass   | pass    | pass         | pass         | pass                          |
| Same, with single `id` PK plus `UNIQUE (tenant_id, id)` (chosen design)         | pass   | not run | pass         | not run      | pass                          |
| Migration: initial, diff, up, down                                              | pass   | not run | pass         | pass         | pass                          |
| `SKIP LOCKED` gives two workers disjoint rows                                   | pass   | pass    | pass         | pass         | no syntax                     |

Details behind the rules:

- **Money on SQLite**: the value is stored exactly (`9223372036854775807` as `integer`) and lost on read (`9223372036854776000`). `decimal(18,4)` holding `12345678901234.5678` is stored as `real` and read back as `12345678901234.568`, which confirms DATA-22.
- **Text comparison**: fixtures `Lê, Le, LE, lê, LÊ, Le+U+0302` (NFD), `đường, Đường, ĐƯỜNG, duong, DUONG`, `LE01, le01`. Folded shadow columns gave identical matches on all five engines. Native options differ: PostgreSQL deterministic collations treat NFC and NFD as different, and ICU non-deterministic collations match the shadow results. MySQL `0900_ai_ci` matches them too. MySQL `vi_0900_ai_ci` and MariaDB `vietnamese_ci` treat `ê` as a letter of its own (`le` does not match `Lê`) and `đ` as different from `d`. MariaDB `unicode_ci` matches `Lê` but not `đ` to `d`, while `unicode_520_ci` matches both. SQLite `NOCASE` is ASCII only (`LÊ` does not match `lê`).
- **SQLite concurrency**: with a deferred `BEGIN`, a read followed by a write after another connection committed fails at once with `SQLITE_BUSY_SNAPSHOT`. Through MikroORM's `em.transactional`, a second connection can write while the first has only read, so the stock driver does not hold the write lock. With `begin` replaced by `begin immediate` the second writer got `SQLITE_BUSY`, which is the intended queueing. The spike patched `SqliteDriver.prototype`. Production code should subclass instead.
- **SQLite defaults**: `foreign_keys` is on, `busy_timeout` is 5000 ms, and `journal_mode` is not WAL until set.
- **Composite FK**: with a composite primary key `Parent(tenant_id, id)`, a `Child` joined by `joinColumns` and `referencedColumnNames` gets the FK on all five engines. The chosen design (single `id` primary key plus unique pair) produced the same FK DDL and rejected cross-tenant rows on PostgreSQL 15, MySQL 8.4 and SQLite. It was not run on PostgreSQL 18 and MariaDB. The builders take varargs, so passing an array fails.
- **Migrations**: generated SQL is dialect-correct (`add "phone" varchar(30) null` on PostgreSQL, `add column ... text null` on SQLite). Rollback of the second migration worked on all four. File names have one-second resolution, so two migrations created in the same second overwrite each other. Scripts must not create two in a second.
- **Typing with TypeScript 7.0.2**: `export const Customer = defineEntity({...})` fails `isolatedDeclarations` with TS9010, because the inferred type is a large generic that cannot be written by hand. Also, `.default(0n)` on a `bigint` property and the `filters` option shape are rejected by the typings although they run correctly.
- **Dependencies (P9)**: core plus the six drivers add 44 packages in the scratch tree. Licenses: 40 MIT, 2 Apache-2.0, 2 ISC. None has an install script, so the pnpm `allowBuilds` rule is not touched. `@mikro-orm/*` needs Node.js 22.17 or later.

Not tested: speed, many processes sharing one SQLite file under ORM load, a nullable composite FK, unique indexes and `LIKE` on shadow columns, PostgreSQL row-level security (the source shows `sessionContext` with `set_config` and `set local role` in `begin`, a lead for the tenant ADR), and MySQL 8.0 (not supported by the spec).

## Consequences

- Easier: one entity definition, native key types, working optimistic locking, tenant FKs enforced by the database, and migrations on every dialect.
- Harder: we own a UUIDv7 type, a folding function, a SQLite driver override and the money limit. These sit in `@bieberkit/data` and each needs a contract test run on every dialect.
- Constrained: the exported `defineEntity` result conflicts with the repository's `isolatedDeclarations` rule. The `defineEntity` API ADR (maintainer-designed) must either return a type that can be named, or document an exception for entity files.
- Ruled out: `DECIMAL` columns, native collations for `ci` and `ci_ai`, and `safeIntegers` on SQLite.

## Spec changes

Made in spec 0.8.2, in the same pull request as this ADR:

- Section 3, ORM row: "MikroORM 7.2, pinned exactly" and a pointer to this ADR.
- DATA-20: state the `id` primary key plus `UNIQUE (tenant_id, id)` design.
- DATA-21: replace "explicit collations or normalized shadow columns" with shadow columns only, and state that `ci_ai` folds `đ` to `d`.
- DATA-22 and MOD-11: add the safe integer limit on all dialects.
- DATA-23: say that `BEGIN IMMEDIATE` comes from a driver override.

## Follow-ups

- Node.js 26 is covered. Run the spike once on Node.js 24.12 (the minimum) before Phase 1 starts.
- The `defineEntity` ADR (roadmap M0.2) decides how to meet `isolatedDeclarations`.
- The queue ADR reuses the `SKIP LOCKED` result.
- Keep the spike sources if you want them: they are in the scratchpad of the session that ran it and may be cleared.
