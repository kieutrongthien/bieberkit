<!--
  BieberKit

  @file        docs/adr/README.md
  @description Index and process for architecture decision records.
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

# Architecture decision records

An ADR records one decision, the options considered and the consequences. The technology baseline in spec section 3 changes only through an ADR. Use the skill `bieberkit-write-adr` or copy [0000-template.md](0000-template.md).

Status values: `Proposed`, `Accepted`, `Rejected`, `Superseded by NNNN`. Only the maintainer accepts an ADR.

## Index

| No.                                             | Title                                                   | Status   |
| ----------------------------------------------- | ------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)   | Record architecture decisions                           | Accepted |
| [0002](0002-formatter-oxfmt.md)                 | Formatter: Oxfmt, with conditions                       | Accepted |
| [0003](0003-logging-binding.md)                 | Logging: a port in core, pino behind a contract package | Accepted |
| [0004](0004-content-editor.md)                  | Content editor: Tiptap 3                                | Accepted |
| [0005](0005-mariadb-support-level.md)           | MariaDB support level                                   | Accepted |
| [0006](0006-docs-site.md)                       | Documentation site generator and hosting                | Accepted |
| [0007](0007-generated-project-license.md)       | Default license of generated projects                   | Accepted |
| [0008](0008-orm-and-dialects.md)                | ORM and dialects: MikroORM 7, with rules from the spike | Accepted |
| [0009](0009-define-entity-api.md)               | defineEntity and the field DSL                          | Accepted |
| [0010](0010-queue-drivers.md)                   | Queue drivers: BullMQ on Valkey and a database driver   | Accepted |
| [0011](0011-plugin-manifest-and-migrations.md)  | Plugin manifest, resolver and per-plugin migrations     | Accepted |
| [0012](0012-authentication.md)                  | Authentication: Better Auth on MikroORM's Kysely        | Accepted |
| [0013](0013-authorization.md)                   | Authorization: an own CASL to MikroORM translator       | Accepted |
| [0014](0014-release-pipeline.md)                | Release pipeline: trusted publishing from tarballs      | Accepted |
| [0015](0015-runtime-dependencies-of-phase-1.md) | Runtime dependencies of Phase 1                         | Proposed |

## Needed for the Phase 0 gate

The gate "ADRs accepted" (spec section 25) needs decisions on the items below. Spikes that feed them are listed in spec section 26.

| Topic              | Questions to settle                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| ORM and dialects   | MikroORM 7 `defineEntity` on PostgreSQL, MySQL 8.4 and SQLite, support tiers, collation and money handling            |
| Plugin manifest    | Static manifest in `package.json` (PLG-07), resolution order, collisions, per-plugin migrations (DATA-24)             |
| `defineEntity` API | Field DSL, compilation to MikroORM metadata, JSON Schema, Zod Mini and CASL, escape hatches                           |
| Authentication     | Better Auth through a MikroORM adapter that shares the request transaction, on all three dialects                     |
| Authorization      | CASL rules to SQL: `@ucast/sql` on MikroORM 7, or an own translator with a small operator set                         |
| Queue drivers      | BullMQ on Valkey and the database driver behind one contract, outbox dispatch                                         |
| Release pipeline   | npm trusted publishing, protected tags, no shared cache, `id-token: write` only on the publish job (SEC-15 to SEC-21) |
| Content editor     | Lexical or Tiptap for block JSON content (spec section 16.5)                                                          |
| Formatter          | Oxfmt, or the Biome formatter as fallback                                                                             |
