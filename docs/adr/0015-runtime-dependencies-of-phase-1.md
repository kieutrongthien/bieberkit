<!--
  BieberKit

  @file        docs/adr/0015-runtime-dependencies-of-phase-1.md
  @description Lists the runtime dependencies that Phase 1 added, with the reason, the maintainers and the license of each (P9).
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

# 0015. Runtime dependencies of Phase 1

- Status: Proposed
- Date: 2026-11-23
- Deciders: Bieber Kieu
- Requirements: P9, SEC-11, PKG-04, AUTH-11, spec section 3

## Context

P9 says that a new runtime dependency needs an ADR line with its reason, its maintainer and its license, and that the license is compatible with Apache-2.0. The ADRs of Phase 0 name most of the libraries that the packages use. Two were never named in an ADR (Fastify, which is in the technology baseline of the spec, and a direct use of Kysely), and the packages now import a few libraries directly where an ADR spoke of them as a part of another one. This ADR is the one list, so the maintainer can confirm it at once and the supply-chain audit of the roadmap has a single place to read.

All versions are exact in `package.json` (`saveExact`), pass `minimumReleaseAge` of 7 days, and come from `pnpm install` with `strictDepBuilds`: none of them has an install script. `@bieberkit/core` has no runtime dependency (PKG-04), and that does not change.

## Options

| Option                                                | For                                             | Against                                                       |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| A. One list in a new ADR, confirmed by the maintainer | One place to audit. Nothing is added by silence | One more document to keep in step with `package.json`         |
| B. Add the lines to each accepted ADR                 | Each ADR stays complete                         | Accepted ADRs are not edited, so it would need a new ADR each |

## Decision

Option A. The runtime dependencies below are the ones of Phase 1 up to M1.4. The column "ADR" says where the reason is argued.

| Package                                                                 | Version | Used by                    | License | Maintainers (npm)                                     | Reason                                                                       | ADR / spec     |
| ----------------------------------------------------------------------- | ------- | -------------------------- | ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| `fastify`                                                               | 5.12.8  | http                       | MIT     | jsumners, delvedor, matteo.collina, eomm, climba03003 | The HTTP server, with response schemas that whitelist fields (API-01)        | spec section 3 |
| `fast-json-stringify`                                                   | 7.3.6   | data                       | MIT     | the same five as Fastify                              | Serialization from the JSON Schema of an entity                              | 0009           |
| `ajv`                                                                   | 8.20.0  | data                       | MIT     | blakeembrey, esp                                      | Validation from the JSON Schema of an entity                                 | 0009           |
| `ajv-formats`                                                           | 3.0.1   | data                       | MIT     | esp, jason-green, additiveamateur                     | Formats of the schema (uuid, email, date)                                    | 0009           |
| `zod`                                                                   | 4.6.7   | data                       | MIT     | colinhacks                                            | Zod Mini schemas that the DSL produces for projects                          | 0009           |
| `@casl/ability`                                                         | 7.1.3   | auth                       | MIT     | stalniy                                               | The ability of a request, and the tree of conditions (AUTHZ-01, 02)          | 0009, 0013     |
| `@mikro-orm/core`, `sql`, `migrations`, `postgresql`, `mysql`, `sqlite` | 7.2.9   | data (`core` also in auth) | MIT     | b4nan                                                 | The ORM and the three dialects                                               | 0008           |
| `better-sqlite3`                                                        | 13.0.3  | data                       | MIT     | joshuawise                                            | The SQLite driver of MikroORM                                                | 0008           |
| `kysely`                                                                | 0.29.8  | data, auth                 | MIT     | koskimas, igalklebanov                                | The query builder of MikroORM. `auth` uses it for the counters of the limits | 0008, 0012     |
| `better-auth`                                                           | 1.7.25  | auth                       | MIT     | bekacru                                               | Sessions, email and password, and later the strong methods                   | 0012           |
| `@better-auth/kysely-adapter`                                           | 1.7.25  | auth                       | MIT     | bekacru, better-gustavo                               | The adapter of ADR 0012. `better-auth` does not export it                    | 0012           |

Rules that go with it:

1. `better-auth` and `@better-auth/kysely-adapter` have the same version, and a test checks it (AUTH-11).
2. `kysely` has the version that MikroORM uses, so that there is one copy in the tree.
3. A library that is a development dependency (`rolldown`, the type packages) is not in this list: P9 is about what ships to users.
4. A new row needs a new ADR, or an addendum row here while this ADR is still `Proposed`.

## Evidence

`npm view <package> license maintainers` on 2026-11-23 for each package above: every license is MIT, and the maintainers are the ones in the table. The dependency tree of `better-auth` was counted in ADR 0012 (21 packages, all MIT, no install script). `pnpm install` passes `trustPolicy: no-downgrade`.

## Consequences

- Easier: one list to confirm, and to compare with `pnpm list --prod` in the supply-chain audit of M1.9.
- Harder: the list must be kept in step when a version moves. Renovate bumps the table only if someone edits it, so the audit compares the two.
- Ruled out: a runtime dependency that is not in a table of an ADR.

## Spec changes

None. The technology baseline of section 3 already names Fastify, Better Auth, CASL, MikroORM, Ajv and Zod.

## Follow-ups

- The maintainer confirms the table and sets the status to `Accepted`.
- The supply-chain audit of the roadmap (M1.9) compares this list with `pnpm list --prod --depth 0` of every package.
