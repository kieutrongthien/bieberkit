<!--
  BieberKit

  @file        docs/adr/0009-define-entity-api.md
  @description Proposed design of defineEntity and the field DSL: descriptors compiled to MikroORM, JSON Schema, Zod Mini and CASL, with typed rows from a generated registry.
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

# 0009. defineEntity and the field DSL

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer reviewed the spike results, accepted `ajv-formats` and then accepted this ADR on 2026-11-22.
- Requirements: SCH-01 to SCH-06, DATA-15, DATA-16, DATA-18, DATA-20 to DATA-22, MOD-11, PKG-02, PKG-03, P9, P12, spec sections 10.1, 10.2 and 10.6

## Context

`defineEntity` is the main public API of BieberKit. One definition must compile to MikroORM metadata, JSON Schema, Zod 4 Mini, CASL subjects and admin metadata, and entity definitions must never depend on a library's own API (P12, SCH-02). ADR 0008 fixed the storage rules and found one conflict that this ADR must solve: an exported MikroORM `defineEntity` result fails the repository's `isolatedDeclarations` rule (TS9010), because its inferred type is a large generic that cannot be written by hand. Spec SCH-04 already says entity types are generated instead of inferred.

This ADR covers the shape of the API and its compilers. `f.state`, `f.sequence`, `hasMany().inline()`, `features`, `extends` (PLG-06) and the HTTP and admin outputs are out of scope and listed under Follow-ups.

## Options

| Option                                                                              | For                                                                                                                              | Against                                                                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A. Own descriptors (plain immutable data) compiled by pure functions to each target | Matches the spec (10.6). The descriptors can be inspected, tested and shipped. The client imports no ORM. Spike: all checks pass | We own the compilers and must keep them aligned with MikroORM, Ajv and Zod                                                          |
| B. Wrap MikroORM `defineEntity` and derive the other outputs from its metadata      | Less compiler code                                                                                                               | Ties the DSL to MikroORM (breaks P12). The exported type fails `isolatedDeclarations` (201 errors for 200 entities in the spike)    |
| C. Zod schema as the source of truth, derive the rest                               | Familiar to users                                                                                                                | Zod cannot express tenant, soft delete, indexes, comparison modes or relations. SCH-01 only makes Zod the default for custom routes |

For typing there are two sub-options:

| Option                                                                                   | For                                                                            | Against                                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| T1. Nameable `EntityDef<Name>` plus a generated registry of row, create and update types | Passes `isolatedDeclarations`. About 3 times faster type check at 200 entities | A generator step is needed for detailed types                                                        |
| T2. Inferred generics, as in the example in spec 10.1                                    | No annotation to write                                                         | Fails `isolatedDeclarations`, so every entity file needs an exception and a slower declaration build |

## Decision

Option A with T1. This follows three choices the maintainer made on 2026-11-22: named type plus registry, per-entity override plus raw entity as the escape hatch, and `f.custom()` as the only way to add a field kind in v1.

1. **Descriptors.** `f.*` returns an immutable `Field` that wraps a plain `FieldDef` object. `defineEntity` returns `EntityDef<Name>`, where the only generic parameter is the name literal. The public API is `export const Customer: EntityDef<'crm.Customer'> = defineEntity({...})`.
2. **Types.** Row, create and update types come from `EntityRegistry`, an interface that `bieberkit dev` and `build` generate into `.bieberkit/types/` and that each published package ships in its `.d.ts` (marked `@generated`, HDR-05). `Row<'crm.Customer'>` reads from it.
3. **Compilers.** Pure functions from `EntityDef` to: MikroORM `EntitySchema` options, JSON Schema 2020-12 (create, update and read), Zod 4 Mini (create, update and read), CASL subject and field mask, and the registry source. The ORM compiler builds the `EntitySchema` options object directly and does not use MikroORM's `p.` builder.
4. **Package layout.** Subpaths of `@bieberkit/data`: `./schema` (descriptors, JSON Schema, Zod Mini, NFC step) and `./orm` (the only module that imports MikroORM). The CASL compiler lives in `@bieberkit/auth`. Entity files import only `@bieberkit/data`, never the ORM.
5. **Standard options.** `tenant` and `softDelete` add the DATA-18 columns. Every unique constraint gains `tenant_id` and `deleted_token`. A tenant entity also gets `UNIQUE (tenant_id, id)`, and relations between tenant entities use composite FKs onto it (ADR 0008). `compare: 'ci' | 'ci_ai'` adds a hidden shadow column filled by entity hooks on create and update. Bulk writes (`nativeUpdate`, `insert`) skip those hooks, so the data layer provides write helpers that add the shadow values, and `bieberkit check` flags direct calls on entities that have compared fields. `f.money` expands to `<name>_minor` (bigint) and `<name>_currency`, and `f.decimal` to a scaled bigint, both limited to the safe integer range.
6. **Validation.** One NFC step runs before both validators (SCH-05). Both Ajv and Zod then use their default length rules, which already count code points. The shared fixture test of SCH-03 stays required.
7. **Relations.** `f.belongsTo(() => Entity)` takes a thunk. The ORM compiler resolves targets through a registry map, because MikroORM rejects a string target.
8. **Escape hatches.** (a) `orm: { indexes, properties }` is merged into the generated metadata. (b) A hand-written MikroORM `EntitySchema` lives in its own `*.orm.ts` file and is registered next to the generated ones. Generated entities can point at it through a descriptor stub, and it gets no route or admin screen unless it declares `expose`. `bieberkit check` reports both uses.
9. **New field kinds.** Only `f.custom({ column, jsonSchema, zod, tsType, admin })`, where `zod` is a **schema value**, not a callback that receives `z`. A callback defeats tree-shaking (see Evidence). A `defineFieldType` registry is rejected for v1.
10. **Compile timing.** ORM metadata, JSON Schema and Zod are built at boot. Ajv validators and serializers are emitted as standalone modules at build (SCH-06).
11. **Dependencies.** `zod`, `ajv`, `ajv-formats`, `@casl/ability` and `fast-json-stringify` (see Evidence). The maintainer accepted `ajv-formats` on 2026-11-22. Generated standalone validators `require` it at runtime, so it ships in the web role. If it is ever dropped, the three formats in use (`uuid`, `email`, `date-time`) can be replaced with `ajv.addFormat` entries without touching entity definitions.

## Evidence

Spike on 2026-11-22 on Node.js 26.13.1 (the ORM, validator and bulk write checks were repeated on Node.js 24.12.0 with identical results), MikroORM 7.2.11, Zod 4.6.7, Ajv 8.20.0, CASL 7.1.3, TypeScript 7.0.2. Sources are throwaway and in the scratchpad of that session, not in the repository.

**ORM compiler** (descriptors for id, string with unique and `ci_ai`, email, oneOf, money, decimal, custom, belongsTo, createdAt, updatedAt; options `tenant` and `softDelete`). All ten checks passed on PostgreSQL 15, MySQL 8.4 and SQLite:

- uniques include `tenant_id`, the field and `deleted_token`; all 9 standard columns exist;
- create, read, money and decimal round trip;
- the shadow column holds `duong le`, then `duong le moi` after an update, and a lookup by the folded value finds the row;
- a duplicate code in one tenant is blocked, reuse after soft delete works, and the same code in another tenant works;
- the composite tenant FK rejects a cross-tenant contact, and a stale write is rejected by `version`;
- the `orm` override added a column and an index, and a raw `EntitySchema` round trips with a relation from a generated entity.

Two things only showed up by running it: a relation target must be a schema instance or a thunk, not a string; and entity names with a dot (`crm.Customer`) work in MikroORM as they are, so no renaming is needed.

**Validators** (25 fixtures: boundaries, emoji, Vietnamese NFC and NFD, email, enum, money at ±(2^53−1) and 2^53, decimal scale, unknown property, custom field, missing field): Ajv, Zod Mini with `maxLength` and Zod Mini with a code-point refinement gave the same verdict on all 25. Before running it I expected Zod to count UTF-16 units and disagree with Ajv on emoji. That expectation was wrong: Zod 4.6.7 and Ajv 8.20.0 both count code points (32 emoji pass `max 32`, 33 fail). NFC is still needed: 20 `ế` typed in NFD are 60 code points and fail both validators until normalized.

**CASL:** subject `crm.Customer`. With `read` only, 11 of 12 fields are readable (`email` is masked), `update` is denied. With no permission `read` is denied.

**Boot cost, 200 entities, 600 validators:** JSON Schema generation 4 ms, Zod Mini construction 56 to 66 ms, Ajv compile 654 to 668 ms. A standalone module takes about 0.65 s to generate at build, is 6.3 MB (80 KB gzip) and loads in 69 ms. Standalone validators are about 10 times faster at boot.

**Client bundle** (esbuild, minified), 20 entities:

| Variant                                                  | Min    | Gzip  |
| -------------------------------------------------------- | ------ | ----- |
| One tiny Zod Mini schema (baseline)                      | 12 KB  | 4 KB  |
| `f.custom({ zod: (z) => ... })` callback in the compiler | 426 KB | 85 KB |
| No namespace passed                                      | 28 KB  | 9 KB  |
| `f.custom({ zod: <schema value> })`, 21 entities         | 29 KB  | 9 KB  |

The callback receives the whole `z` namespace, so the bundler keeps all of Zod. Passing a schema value avoids it. No ORM, CASL or Ajv module is in any variant.

**Types** (`tsc` 7.0.2, `--isolatedDeclarations`):

|                                  | MikroORM `defineEntity` | `EntityDef<Name>` plus registry |
| -------------------------------- | ----------------------- | ------------------------------- |
| Errors for 200 exported entities | 201 (TS9010)            | 0                               |
| Types / instantiations           | 16,165 / 68,110         | 7,034 / 4,334                   |
| Check time (3 runs)              | 0.125 to 0.147 s        | 0.039 to 0.052 s                |
| Memory                           | 116 MB                  | 68 MB                           |

Typed errors work through the registry: a wrong `tier` and a wrong currency fail, and `Row<'crm.Customer'>['email']` resolves. Absolute times are small because TypeScript 7 is native, so the gain is mostly headroom as projects grow.

**Dependencies (P9):** `zod` 4.6.7 (MIT, one package, modified 2026-10-12). `ajv` 8.20.0 (MIT, 5 packages, modified 2026-04-24). `ajv-formats` 3.0.1 (MIT, last published 2024-03-30, so it is the least active; peer dependency `ajv ^8.0.0`, which Ajv 8.20.0 satisfies; shares its main maintainer with Ajv). `@casl/ability` 7.1.3 (MIT, modified 2026-11-13). None has an install script. `fast-json-stringify` 7.3.9 (MIT, modified 2026-11-21) is the serializer Fastify uses for response schemas. Maintainers are to be confirmed before acceptance.

**Checks added after the first draft (same day, Node.js 26.13.1):**

| Check                                                                | Result                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORM compiler on PostgreSQL 18 and MariaDB 11, the ten checks above   | 10 of 10 on both                                                                                                                                                                                                                  |
| `nativeUpdate` on an entity with an `ci_ai` field                    | The shadow column stays stale on all five engines (PostgreSQL 15 and 18, MySQL 8.4, MariaDB 11, SQLite)                                                                                                                           |
| `insert` without a helper                                            | The shadow column is `NULL` on all five                                                                                                                                                                                           |
| The same two calls through a helper that adds the folded value       | Correct on all five                                                                                                                                                                                                               |
| `fast-json-stringify` on the generated read schema                   | Drops fields that are not in the schema (`passwordHash`, nested `credit.secret`), keeps Vietnamese text, and writes required properties first. Standalone mode works (8.2 KB, requires only `fast-json-stringify/lib/serializer`) |
| Serialization speed against `JSON.stringify`, warmed up, median of 3 | fast-json-stringify is slower: 1.4 times for 1 row, 2.5 times for 20 rows, 3.1 times for 1,000 rows (777 µs against 253 µs)                                                                                                       |
| Zod to JSON Schema for custom routes (SCH-01)                        | `toJSONSchema` with `draft-2020-12` gives a schema that Ajv compiles and applies correctly. It also converts the entity create schema that contains the NFC transform                                                             |
| What the standalone Ajv module needs at runtime                      | `ajv/dist/runtime/ucs2length` and `ajv-formats/dist/formats`                                                                                                                                                                      |

The serializer result matters for wording: its value is the field whitelist (API-01), not speed. The spec says it is the fastest path (section 3, section 10.6). That is a micro-benchmark of one row shape, so the k6 run in M1.9 should confirm it before the wording changes.

**Not tested:** HTTP routes, OpenAPI output and Fastify integration; admin and `_meta` output; `f.state`, `f.sequence`, `hasMany().inline()`, `features`, `.localized()` and `extends`.

## Consequences

- Easier: one definition drives every output. The client imports no ORM. Types stay fast as projects grow. Unusual cases have two exits.
- Harder: we own the compilers, the registry generator and a contract test that runs the fixtures through Ajv and Zod on every change. Text writes must go through entities or recompute the shadow columns.
- Constraint: entity files must stay free of ORM imports, and raw entities go in separate files.
- Accepted risk: `ajv-formats` has had no release since 2024-03. The replacement path is described in decision 11.
- Ruled out: callbacks that receive `z`, MikroORM's `defineEntity` as the public API, and a field-type registry in v1.

## Spec changes

Made in spec 0.8.3, in the same pull request as this ADR:

- Section 10.1: the example uses `export const Customer: EntityDef<'crm.Customer'> = defineEntity({...})`.
- Section 10.2 and 10.6: point at this ADR. Mention the subpath split in 10.6.
- Section 3 (Fastify row) and 10.6 (output table): replace "fastest" with the field whitelist and standalone loading, unless M1.9 shows otherwise.
- SCH-06: say that standalone validators need Ajv's runtime helpers and `ajv-formats` in the web role.
- DATA-21: bulk writes must go through helpers that add the shadow values.
- SCH-03: state that Ajv and Zod 4 Mini both count code points by default, so only the NFC step is needed.
- SCH-04: name `EntityRegistry`, `EntityDef<Name>` and `Row`, `CreateInput`, `UpdateInput`.
- New SCH-07: `f.custom` takes schema values, never callbacks that receive a library namespace.
- New SCH-08: entity files import no ORM, and hand-written ORM entities live in separate files.
- New DATA-26: unique constraints and `UNIQUE (tenant_id, id)` are generated as in decision 5.

## Follow-ups

- Spikes or ADRs for `f.state`, `f.sequence`, `hasMany().inline()`, `features`, `.localized()` and `extends`.
- Entity-to-API shape for `f.money` (`{ amount, currency }`) and `f.decimal` (string), in the HTTP work.
- The authorization ADR reuses the CASL subject and field names defined here.
- A `bieberkit check` rule and a contract test for bulk writes on entities with compared fields.
- Re-measure serialization on the k6 reference endpoints (roadmap M1.9) before changing the spec wording.
- The spike sources are archived outside the repository, in `bieberkit-spikes/` next to it, with a README. They were used for the Node.js 24.12 run.
