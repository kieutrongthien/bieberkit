<!--
  BieberKit

  @file        docs/adr/0011-plugin-manifest-and-migrations.md
  @description Proposed design of the plugin manifest, the dependency-free resolver and the per-plugin migration runner, with spike results.
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

# 0011. Plugin manifest, resolver and per-plugin migrations

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer reviewed the spike results and accepted this ADR on 2026-11-22.
- Requirements: PLG-01 to PLG-07, DATA-08, DATA-24, PKG-04, MOD-01, spec sections 11.1 and 11.2

## Context

The spec says each plugin publishes a static manifest in the `bieberkit` field of its `package.json` (PLG-07), generated from `definePlugin` and checked in CI. One resolver reads these manifests in the scaffolder, in `bieberkit add` and at kernel boot (11.2). Plugins own their migrations as ordered, versioned steps in a portable schema builder, recorded in `bieberkit_plugin_migrations` (DATA-24), under the expand then contract rule (DATA-08).

Two constraints shape the design. The resolver belongs to `@bieberkit/core`, which may not have runtime dependencies (PKG-04), so it cannot use the `semver` package. And plugin migrations must run on PostgreSQL, MySQL and SQLite with one definition.

This ADR proposes the manifest shape, the resolver's rules and error codes, and the migration step format. The public API of `definePlugin` stays the maintainer's decision: names here are proposals.

## Options

| Option                                                                                                                           | For                                                                  | Against                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A. Static JSON manifest generated from `definePlugin`, one pure resolver without dependencies, migration steps as data on Kysely | Matches the spec. Readable without running plugin code. Spike passed | We own a small range matcher and a runner                                                                            |
| B. Read the manifest by importing the plugin                                                                                     | Always in sync                                                       | Runs plugin code before the graph is resolved, impossible in the scaffolder (PLG-07)                                 |
| C. Use `semver` and Umzug or MikroORM migrations per plugin                                                                      | Less code                                                            | `semver` breaks PKG-04 in core. MikroORM migrations are snapshot based and have no per-plugin ledger or deploy guard |

## Decision

Option A.

1. **Manifest.** The `bieberkit` field of `package.json` holds `core`, `dialects`, `requires`, `conflicts`, `env`, `tables`, `routes`, `permissions` and `admin`. `name` and `version` come from `package.json`. `bieberkit build` writes the field from `definePlugin`. The CI check compares canonical text (keys sorted), so key order never causes a failure, and reports `PLG_MANIFEST_STALE`, `PLG_MANIFEST_VERSION` or `PLG_MANIFEST_MISSING`.
2. **Version ranges.** The resolver accepts exact versions, `^`, `~`, `>=` and `*`, and rejects pre-release tags, `||`, partial versions and `x` ranges with `PLG_BAD_RANGE`. Plugin authors see the error when they build.
3. **Resolver.** One pure function `resolve(manifests, { core, dialect })` returns the boot order or throws a `PluginError` with a stable code: `PLG_CORE_RANGE`, `PLG_DIALECT`, `PLG_MISSING_REQUIRE`, `PLG_REQUIRE_RANGE`, `PLG_CONFLICT`, `PLG_CYCLE`, `PLG_COLLISION_TABLE`, `_ROUTE`, `_PERMISSION`, `_ENV`, `_ADMIN`, `PLG_PREFIX_ENV` and `PLG_PREFIX_PERMISSION`. The order is topological with ties broken by name, so it does not depend on input order. All problems are reported together.
4. **Prefix rule.** Env keys start with the plugin's short name in upper case (`SEO_`), and permissions with the short name and a dot (`seo.`). With that rule, env and permission collisions can only happen between two plugins with the same short name from different scopes, and the resolver still reports those.
5. **Migration steps.** A step is `{ plugin, version, id, kind: 'expand' | 'migrate' | 'contract', after?, up(trx, dialect) }`. The runner applies pending steps by plugin boot order, then version, then declaration order, each in its own transaction, and records `(plugin, step_id, version, kind, applied_at, deploy_id)` in `bieberkit_plugin_migrations` with primary key `(plugin, step_id)`.
6. **Expand then contract guard.** Every `bieberkit migrate` run has a `deploy_id`. A `contract` step whose `after` step was applied under the same `deploy_id` is refused with `PLG_CONTRACT_SAME_DEPLOY`, and later steps of that plugin wait. A contract step starts with an idempotent backfill, because rows written by the old version between the two deploys can still be incomplete.
7. **Portable builder.** Kysely's schema builder (the one MikroORM already runs on), plus helpers: `uuidType(dialect)` and `setNotNull(table, column, type)`. `setNotNull` uses `alterColumn` on PostgreSQL, `modify column` on MySQL and MariaDB, and a table rebuild on SQLite.
8. **SQLite rebuilds** run with foreign keys switched off (`pragma foreign_keys = off` before the transaction and on after it). A step declares this with a flag, and the runner handles the pragma.
9. **MySQL and MariaDB steps** have one DDL statement each, or guard every statement with `if not exists` or `if exists`, because DDL there is not transactional. `bieberkit check` flags steps that break this rule.
10. **Extension tables (PLG-06)** are tables owned by the extending plugin with a foreign key to the target's `id`. Removing the plugin drops the tables its manifest lists and deletes its ledger rows, and nothing else.

## Evidence

Spike on 2026-11-22, Node.js 26.13.1, Kysely 0.29.9, PostgreSQL 15.20, MySQL 8.4.13, SQLite 3.54.1. Sources are throwaway, in `bieberkit-spikes/plugin-spike`.

**Range matcher.** 9,264 checks against the `semver` package (every combination of 48 versions and 193 ranges using the supported forms) gave 0 differences. Five unsupported forms (`^1.2`, `>1.0.0`, `1.x`, `1.0.0 || 2.0.0`, `1.0.0-beta.1`) were rejected.

**Manifest.** The generated field passes the check. After adding a permission without regenerating, the check reports `PLG_MANIFEST_STALE`. A version bump reports `PLG_MANIFEST_VERSION`. Reordered keys still pass.

**Resolver, 8 sample plugins** (users, roles, auth-ui, settings, audit-log, notifications, pages, seo): the order is `settings, users, audit-log, auth-ui, notifications, pages, roles, seo`. It is the same for any input order and every plugin comes after its requirements. The result is plain JSON, so the scaffolder and the kernel get the same answer from the same inputs. Each of these gave the expected code with a readable message: core too old, dialect not supported, missing requirement, requirement range, conflict, cycle, and collisions in table, route and admin path, plus a missing prefix on env keys and on permissions. Two plugins with the same short name from different scopes gave `PLG_COLLISION_PERMISSION` and `PLG_COLLISION_ENV`.

**Migrations** (pages 1.0.0 to 1.2.0 and an extension plugin `seo`, three deploys):

- First install: both plugins' first steps applied. Three pages and three extension rows inserted.
- Upgrade from 1.0.0 to 1.2.0 in one deploy: `add-slug` and `fill-slug` applied, `slug-not-null` refused with `PLG_CONTRACT_SAME_DEPLOY`, and the column was still nullable. The next deploy applied it and the constraint held. A rerun applied nothing. Same on PostgreSQL, MySQL and SQLite.
- A contract step without a final backfill failed on PostgreSQL (`column "slug" ... contains null values`) and on SQLite (`NOT NULL constraint failed`), because a row had been inserted with no slug between the two steps.
- `alterColumn(...).setNotNull()` from Kysely produced invalid SQL on MySQL (syntax error near `not null`). `modify column` with the type works.
- A SQLite table rebuild with foreign keys on **deleted the 3 extension rows** (`on delete cascade` fired when the old table was dropped), with no error. With foreign keys off during the rebuild all 3 rows stayed. PostgreSQL and MySQL kept them in both cases.
- A step that created a table and then failed: PostgreSQL and SQLite rolled it back, MySQL left the table behind (with no ledger row, so a rerun would hit "table exists").
- Removing the extension plugin dropped only `seo_pages_ext` and its ledger rows. The 4 pages rows stayed.

**Not tested:** running the steps through `em.getKysely()` (MikroORM documents that it joins the current transaction, which is useful in tests, but the migrate role should use its own connection from `MIGRATE_DATABASE_URL`, DATA-25); `PRAGMA foreign_key_check` after a rebuild; a second concurrent `bieberkit migrate` (needs a lock, as for the scheduler in ADR 0010); MariaDB; indexes and unique constraints in the SQLite rebuild helper (the spike rebuilds columns and the primary key only); `bieberkit remove` prompts and `bieberkit upgrade` ordering across several plugins; real `package.json` generation in `tsdown`.

## Consequences

- Easier: the scaffolder, `bieberkit add` and the kernel share one function and one set of error codes. Contract steps cannot be merged with their expand step by skipping versions.
- Harder: we own a range matcher with a deliberately small syntax, a runner, and three SQLite and MySQL special cases. The SQLite rebuild helper needs to preserve indexes and constraints before it is used for real.
- Constraint: plugin authors write steps against Kysely's builder, not MikroORM's schema generator. Steps are code in the plugin package.
- Ruled out: importing plugin code to read its manifest, `semver` in core, and `||` or pre-release ranges.

## Spec changes

Made in spec 0.8.4, in the same pull request as these ADRs:

- Section 11.1: list the manifest fields as stored in `package.json` (adding `tables`, `routes`, `permissions`, `admin` and `env` as key lists), and say the file is generated.
- Section 11.2: add the error codes, the prefix rule, the range syntax subset, and the deterministic order.
- PLG-07: say the CI check compares canonical text.
- New PLG-08: supported range syntax, with `PLG_BAD_RANGE`.
- DATA-24: the step format, the ledger columns and the `deploy_id`.
- DATA-08: the guard code and the final backfill rule.
- New DATA-27: SQLite rebuilds run with foreign keys off, and MySQL steps have one DDL statement or use existence guards.

## Follow-ups

- Roadmap items under M1.1 (resolver, ranges) and M1.2 (runner, helpers, `bieberkit check` rule for MySQL steps) once the spec has the IDs.
- A lock so that two `bieberkit migrate` processes cannot run together.
- The `definePlugin` API surface is for the maintainer to design, in plan mode, using this ADR as input.
