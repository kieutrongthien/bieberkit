<!--
  BieberKit

  @file        docs/adr/0005-mariadb-support-level.md
  @description Proposed support level for MariaDB, an open question in spec section 26.
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

# 0005. MariaDB support level

- Status: Proposed
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Requirements: spec section 9.1, DATA-14, MOD-11, MOD-18, spec section 26 (open question), P9

## Context

Spec 9.1 lists PostgreSQL 15+ and MySQL 8.4 LTS+ as Tier 1 and SQLite 3 as Tier 2. MariaDB is not listed. The reason MySQL is Tier 1 is "common shared hosting in Vietnam". If those hosts offer MariaDB rather than MySQL, the Tier 1 promise does not reach the users it was written for. The spec does not say which they offer, and this ADR cannot verify it.

MariaDB and MySQL have diverged. Points to verify in the ORM spike (not yet tested): `SKIP LOCKED` for the outbox dispatcher (MOD-18), native UUID storage (DATA-14), JSON column behavior, and collation names (MOD-11). MikroORM 7.2.11 publishes a separate `@mikro-orm/mariadb` driver next to `@mikro-orm/mysql`, both MIT, so a driver exists.

The risk table in spec section 26 already says the full v1 scope is about three times what one maintainer can harden, and that MySQL is hardened after PostgreSQL.

## Options

| Option | For | Against |
| --- | --- | --- |
| A. Not supported | No work. Honest | Excludes users who only have MariaDB |
| B. Best effort | No CI cost. Reports are welcome and cheap fixes are taken. Can be promoted later | Users may read "best effort" as "works". Needs clear wording in the docs |
| C. Tier 2 with CI | Real guarantee | A fourth database in the CI matrix and in M2.7, plus a separate driver, with one maintainer |

## Decision

Option B for 1.0. The `mysql` dialect is the only MySQL-family value that configuration accepts. The docs state that MariaDB is untested and may work through the MySQL dialect. Revisit after the Phase 2 gate, and promote to Tier 2 only if the maintainer confirms demand and the dialect matrix is stable.

This is a recommendation on partial information. If the maintainer knows that the target hosts offer MariaDB only, option C becomes the better choice and the Tier 1 row for MySQL should be reconsidered.

## Evidence

- `npm view @mikro-orm/mariadb` and `@mikro-orm/mysql`: version 7.2.11, MIT, both modified 2026-11-21.
- No MariaDB test has been run. The ORM spike (roadmap M0.2, first item) is the place to add a MariaDB 11 run to the PostgreSQL, MySQL 8.4 and SQLite runs, at low cost, and record what fails.

## Consequences

- Easier: the dialect matrix stays at three.
- Harder: a MariaDB-only user gets no support promise.
- Ruled out for 1.0: a `mariadb` dialect value in `bieberkit.config.ts`.

## Spec changes

- Section 9.1: add a note under the table that MariaDB is best effort and not in CI.
- Section 26: tick the open question once accepted.

## Follow-ups

- Add a MariaDB run to the ORM spike and paste the result here.
- The maintainer confirms which database the intended hosts provide.
