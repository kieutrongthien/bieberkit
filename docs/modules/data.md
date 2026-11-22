<!--
  BieberKit

  @file        docs/modules/data.md
  @description Module spec of @bieberkit/data: keys, text folding, scaled numbers, pagination, the ORM bindings and the proposals for the maintainer-designed parts.
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

# @bieberkit/data

- Package: `@bieberkit/data`
- Layer: contracts (imports `@bieberkit/core` only)
- Spec sections: 9 (data layer), 10 (entities), ADR 0008, ADR 0009, ADR 0011, ADR 0010
- Status: Slice 1 (Foundation) is implemented. Slices 2 and later are proposals. Everything marked **[D]** is a proposal for the maintainer to design (AGENTS.md, Workflow 6) and gets no code until you approve it.

## Purpose

Everything between the entity definitions and the database: one definition compiled to MikroORM metadata, JSON Schema and Zod, the storage rules that make three dialects behave the same, the tenant model, queries, migrations, the outbox and the audit log. Entity files and the client import no ORM (SCH-08), so the package has subpaths:

| Subpath                            | Holds                                                                                          | Imports MikroORM  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| `@bieberkit/data`                  | Pure helpers (keys, text, numbers, pagination) and, from slice 2, descriptors and entity types | No                |
| `@bieberkit/data/schema` (slice 2) | Descriptors, `defineEntity`, JSON Schema and Zod Mini compilers                                | No                |
| `@bieberkit/data/orm`              | ORM compiler, `Uuid7Type`, SQLite driver, connection, tenant filter, migrations                | Yes, the only one |

It does not hold HTTP routes, authorization rules or the admin UI. It reads configuration only through core's `CoreEnv`, never `process.env` (P8).

## Slicing

| Slice                     | Content                                                                                                                                                | Status                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 1. Foundation             | The helpers and ORM pieces below, the dialect test harness, this spec                                                                                  | In progress                   |
| 2. **[D]** Schema         | `f.*`, `defineEntity`, standard columns, JSON Schema, Zod Mini, registry types                                                                         | Waits for review of this file |
| 3. **[D]** ORM and tenant | `EntityDef` to MikroORM, composite tenant FKs, shadow columns and write helpers, tenant filter, `asSystem()`, reference checks, `version`, soft delete | After slice 2                 |
| 4. Queries                | Keyset, `withTotal`, read-only path, index rule, `.localized()`                                                                                        | After slice 3                 |
| 5. Migrations             | Snapshot diff, `migrate:*`, destructive detection, plugin runner, `MIGRATE_DATABASE_URL`                                                               | After slice 3                 |
| 6. Outbox and audit       | Outbox table and dispatcher, processed ids, audit log append-only for the application role, the framework tables as plugin steps                       | After slice 5                 |
| 7. State and numbers      | State machines (`transition`, no direct write of a state), sequences (`f.sequence`, gap free per tenant)                                               | After slice 6                 |
| 8. Features               | Attachments, comments, timeline and tags as generic tables                                                                                             | After slice 7                 |
| 9. Build output           | Standalone Ajv validators and fast-json-stringify serializers                                                                                          | After slice 8                 |

## Public API of slice 1 (Foundation)

```ts
// @bieberkit/data  (no ORM import)
function uuid7(): string                                                                         // lower case, 36 characters, strictly increasing in the process
function createUuid7(options?: { now?: () => number; random?: (bytes: Uint8Array) => void }): () => string   // a generator with its own state, for tests
function uuid7ToBytes(id: string): Uint8Array                                                    // 16 bytes, any UUID version
function uuid7FromBytes(bytes: Uint8Array): string
function isUuid(value: unknown): value is string                                                 // any version, case-insensitive

function nfc(text: string): string
function fold(mode: 'exact' | 'ci' | 'ci_ai', text: string): string                             // exact is NFC only
function codePointLength(text: string): number

function toMinor(amount: string, currency: string): bigint                                      // '12.345' + 'USD' -> 1235n, half away from zero
function fromMinor(minor: bigint, currency: string): string                                      // 1235n + 'USD' -> '12.35'
function minorUnitOf(currency: string): number                                                   // VND 0, USD 2, KWD 3, from Intl
function toScaled(value: string, scale: number): bigint                                          // decimals, same rules
function fromScaled(scaled: bigint, scale: number): string
function assertSafeScaled(value: bigint, label: string): void                                    // within +-9007199254740991

const MAX_PAGE_SIZE = 100
function pageSize(requested: unknown, fallback?: number): number                                 // integer from 1 to 100
function encodeCursor(position: readonly CursorValue[]): string                                 // opaque, base64url
function decodeCursor(cursor: string): readonly CursorValue[]                                    // throws DATA_CURSOR_INVALID

// @bieberkit/data/orm  (imports MikroORM)
const Uuid7Type: Type<string, Buffer | string>                                                   // uuid on PostgreSQL, binary(16) on MySQL, blob on SQLite
function resolveConnection(env: DatabaseEnv): { dialect: Dialect; location: string; readLocations: readonly string[] }   // pure; the dialect comes from the URL scheme
function createDatabase(env: DatabaseEnv, options: { entities: readonly EntitySchema[] }): Promise<Database>
interface Database { readonly dialect: Dialect; readonly orm: Orm; fork(): EntityManager; close(): Promise<void> }
function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>     // fork per request or job, tied to requestContext
function currentEntityManager(): EntityManager | undefined                                       // the EntityManager of the running unit of work
function createSqliteDialect(location: string, options?: { busyTimeoutMs?: number }): SqliteDialect   // WAL, synchronous NORMAL, busy timeout, BEGIN IMMEDIATE

// packages/data/src/testing  (test support of this package, not exported and not built)
function describeDialects(name: string, suite: (db: TestDatabase) => void): void                 // runs on SQLite, PostgreSQL, MySQL
```

## Behavior (Foundation)

| ID              | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA-03         | `uuid7` returns a UUID with version nibble 7 and variant `10`, whose first 48 bits are the Unix time in milliseconds. Ids are strictly increasing inside one process: within one millisecond the counter increments, and a clock that goes backwards keeps the last timestamp. Sorting ids as text gives creation order                                                                                                                                                                               |
| DATA-14         | `Uuid7Type` stores `uuid` on PostgreSQL, `binary(16)` on MySQL and `blob` on SQLite, and always returns a lower case string. It accepts a string in any case or a 16-byte `Buffer` (the Kysely plugin can convert twice). A value that is not a UUID throws `DATA_UUID_INVALID` before the database sees it, because MySQL would otherwise store an empty binary value                                                                                                                                |
| DATA-21         | `fold('ci', x)` is NFC plus lower case. `fold('ci_ai', x)` also removes combining marks and maps `đ` and `Đ` to `d`. `fold('exact', x)` is NFC only. NFC and NFD input give the same folded text. The fixture set of ADR 0008 (`Lê`, `Le`, `LE`, `lê`, `LÊ`, NFD `Lê`, `đường`, `Đường`, `ĐƯỜNG`, `duong`, `LE01`, `le01`) matches as measured                                                                                                                                                        |
| SCH-05          | `nfc` normalizes to Unicode NFC. Text that is already NFC is returned unchanged                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SCH-03          | `codePointLength` counts Unicode code points, so an emoji is 1 and a decomposed `ế` typed in NFD is 3 until normalized                                                                                                                                                                                                                                                                                                                                                                                |
| DATA-22, MOD-11 | Money and decimals are `bigint` scaled integers. `toMinor` and `toScaled` parse text without floating point, round half away from zero once, and reject a value outside the safe integer range with `DATA_MONEY_RANGE` and malformed text with `DATA_MONEY_INVALID`. `fromMinor` and `fromScaled` format without floating point and keep trailing zeros (`12.30`). The minor unit comes from `Intl` (VND 0, USD 2, KWD 3). A currency that is not three upper case letters is `DATA_CURRENCY_INVALID` |
| DATA-06         | `pageSize` returns an integer from 1 to 100. Missing gives the fallback (default 25). A value above 100 is clamped to 100. A value that is not a positive integer is `DATA_PAGE_LIMIT` (400)                                                                                                                                                                                                                                                                                                          |
| DATA-11         | `encodeCursor` and `decodeCursor` round-trip strings, numbers, `null` and `bigint` (as tagged text) and are opaque to clients. A cursor that is not valid base64url, not JSON of the right shape, or longer than 1,024 characters is `DATA_CURSOR_INVALID` (400). The cursor holds no secret and is not signed: it is a position, and the tenant filter and permissions still apply on use                                                                                                            |
| DATA-23         | After connecting to SQLite the driver sets `journal_mode = WAL`, `synchronous = NORMAL` and a busy timeout, and write transactions start with `BEGIN IMMEDIATE`, through a subclass of the driver. A second connection that wants to write while the first writes waits for it instead of failing with `SQLITE_BUSY_SNAPSHOT`                                                                                                                                                                         |
| DATA-04         | Timestamps are stored in UTC. The connection sets the session time zone to UTC where the dialect has one (PostgreSQL, MySQL), and `Date` values round-trip to the same instant on all three dialects                                                                                                                                                                                                                                                                                                  |
| DATA-05         | `runInUnitOfWork` gives each request and each job its own `EntityManager` fork, and puts it where code of that request can find it (through `AsyncLocalStorage` next to core's `requestContext`). Two concurrent units of work never share an identity map                                                                                                                                                                                                                                            |
| (connection)    | `createDatabase` reads `DB_CONNECTION`, `DATABASE_URL`, `DB_POOL_MAX` and `DATABASE_READ_URLS` from validated `CoreEnv`. A missing URL is `DATA_CONNECTION_MISSING`, a dialect that does not match the URL is `DATA_DIALECT_MISMATCH`. Closing the database closes the pool                                                                                                                                                                                                                           |
| (harness)       | `describeDialects` runs a suite on SQLite always, and on PostgreSQL and MySQL when `DATABASE_URL_POSTGRES` and `DATABASE_URL_MYSQL` are set. With `BK_REQUIRE_DIALECTS=all` a missing URL fails the run instead of skipping it, so CI cannot pass without the databases                                                                                                                                                                                                                               |

## Errors

| Code                      | Status | Fix                                                                             |
| ------------------------- | ------ | ------------------------------------------------------------------------------- |
| `DATA_UUID_INVALID`       | 400    | The id is not a UUID. Check the value that was sent                             |
| `DATA_MONEY_INVALID`      | 400    | Write the amount as digits with an optional decimal point, for example `12.50`  |
| `DATA_MONEY_RANGE`        | 400    | The amount is outside +-9,007,199,254,740,991 minor units. Use a smaller amount |
| `DATA_CURRENCY_INVALID`   | 400    | Use a three letter ISO 4217 code in upper case, for example `VND`               |
| `DATA_PAGE_LIMIT`         | 400    | `limit` must be a whole number from 1 to 100                                    |
| `DATA_CURSOR_INVALID`     | 400    | The cursor is not one this server produced. Start again from the first page     |
| `DATA_CONNECTION_MISSING` | 500    | Set `DATABASE_URL` and `DB_CONNECTION`                                          |
| `DATA_DIALECT_MISMATCH`   | 500    | `DB_CONNECTION` and the scheme of `DATABASE_URL` name different databases       |

Codes of later slices (proposed): `DATA_TENANT_REQUIRED` (400, DATA-19), `DATA_REFERENCE_NOT_VISIBLE` (422, DATA-20), `DATA_VERSION_STALE` (412, API-13), `DATA_STATE_TRANSITION` (409, MOD-07), `DATA_STATE_DIRECT_WRITE` (500, MOD-07), `DATA_SYSTEM_SCOPE_REASON` (500, DATA-09).

## Configuration

`DATABASE_URL` forms: `postgres://` and `postgresql://` for PostgreSQL, `mysql://` and `mariadb://` for MySQL, and for SQLite `sqlite:./file.db`, `sqlite:///absolute/file.db`, `file:./file.db`, a plain path, or `:memory:`.

Reads `DB_CONNECTION`, `DATABASE_URL`, `DATABASE_READ_URLS` and `DB_POOL_MAX` through `CoreEnv`. `MIGRATE_DATABASE_URL` is read only by the migrate role (slice 5). The test harness gets `DATABASE_URL_POSTGRES`, `DATABASE_URL_MYSQL` and `BK_REQUIRE_DIALECTS` through Vitest's `provide` in `vitest.config.ts`, the only place that reads them from the environment. They exist only in tests and in the `services` job of `ci.yml`.

## Dependencies

`@mikro-orm/core`, `/sqlite`, `/postgresql` and `/mysql` are pinned to **7.2.9**, not the 7.2.11 of the ADR 0008 spike. 7.2.11 (published 2026-11-20) was inside `minimumReleaseAge` on 2026-11-22, and the rule was not lowered. 7.2.9 is the newest release old enough. `kysely` 0.29.8 and `better-sqlite3` 13.0.3 are the versions MikroORM 7.2.9 already depends on, listed directly because this package imports them. `@types/better-sqlite3` is a development dependency. Upgrade to 7.2.11 once it matures (2026-11-27) and rerun the dialect suites.

## Tests

Tests sit next to the code and are named after the IDs above. Pure helpers need no database. The ORM tests use `describeDialects`, so every one runs on SQLite locally and on PostgreSQL and MySQL where the URLs exist. Negative controls: a non-UUID id on every dialect, two SQLite connections writing, a cursor with one changed byte, a money value above the safe range. Coverage gate: 90 percent of lines for `packages/data/src` (TST-01).

## The maintainer-designed API **[D]**

Decided on 2026-11-22 (see Decisions). Slice 2 tests come first and wait for the maintainer's review, then the code.

### Field DSL (slice 2)

Descriptors are immutable data (ADR 0009). Each builder returns a `Field`, and every chain method returns a new one. Builders check their own options and throw `DATA_FIELD_INVALID`.

```ts
f.id()                                          // UUIDv7 primary key, declared once as `id`
f.string({ min?, max, compare?: 'exact' | 'ci' | 'ci_ai' })   // max 1 to 4096 code points
f.text({ max? })                                // long text, up to 65535 code points, never indexed or unique
f.email()                                       // string, max 254, compare 'ci'
f.oneOf(values)                                 // string union, varchar, never a database enum
f.int({ min?, max? })                           // 32-bit integer, default range -2147483648 to 2147483647
f.boolean()
f.date()                                        // calendar date, text 'YYYY-MM-DD', no time zone
f.dateTime()                                    // an instant, UTC
f.decimal({ precision, scale })                 // precision 1 to 15, scale 0 to precision; scaled bigint (DATA-22)
f.money({ currency })                           // <name>_minor bigint + <name>_currency (MOD-11)
f.sequence({ pattern, resetEvery? })            // document number, e.g. 'PO-{yyyy}-{seq:5}', resetEvery 'year' | 'month' | 'never' (MOD-12)
f.createdAt()  f.updatedAt()                    // UTC, named createdAt and updatedAt
f.belongsTo(() => Entity)                       // many to one, API key is <name>Id
f.hasOne(() => Entity)                          // one to one, the key is on the other side
f.hasMany(() => Entity).inline()                // collection, .inline() saves it with the parent (MOD-09)
f.state({ initial, transitions })               // state machine column (MOD-06, MOD-07)
f.custom({ column, jsonSchema, zod, tsType, admin })   // the only new kind in v1, `zod` is a schema value (SCH-07)

// chain methods
.optional()  .unique()  .index()  .default(value)  .searchable()  .localized()
.computed(fn, { stored?: boolean })             // MOD-08
```

Rules the builders and `defineEntity` enforce, each with a test:

- `.unique()` and `.index()` are refused on `f.text`, `f.hasMany`, `f.hasOne` and on a computed field that is not stored. `.localized()` is allowed only on `f.string`, `f.text` and `f.email`, and not together with `.unique()`. `.searchable()` only on those three. `.default()` must fit the kind (`f.oneOf` default must be one of the values) and is refused on `f.id`, `f.money`, `f.sequence`, `f.createdAt`, `f.updatedAt`, `f.state` and relations.
- `f.custom` refuses a function for `zod` with `DATA_FIELD_CUSTOM_CALLBACK` (SCH-07).
- `f.sequence` needs a `{seq:N}` token with N from 1 to 12 and accepts `{yyyy}`, `{yy}` and `{mm}`. It is unique and read only.

`defineEntity` options besides the spec example: `tenant`, `softDelete`, `features`, `actions`, `permissions`, `api`, `admin`, `label` and `orm: { indexes, properties }`.

**Entity checks.** The name is `module.Entity` (`crm.Customer`). The table is snake case, at most 40 characters. Field names are camel case. Exactly one `id: f.id()`. The reserved names `tenantId`, `version`, `createdBy`, `updatedBy`, `deletedAt` and `deletedToken` cannot be used, and neither can a name that collides with a generated column (`<name>Cmp`, `<name>Minor`, `<name>Currency`, `<name>Id` of a relation). References in `permissions.fields`, `admin` and `unique` must name existing fields. Errors are `DATA_ENTITY_INVALID` with the entity and field in the message. The result is deeply frozen.

**Standard columns (DATA-18).** `id` is declared by `f.id()`. Always added: `version`, `created_at`, `updated_at`, `created_by`, `updated_by`. `tenant: true` adds `tenant_id`. `softDelete: true` adds `deleted_at` and `deleted_token`. `f.createdAt()` and `f.updatedAt()` are optional declarations of the two columns, and the columns exist either way.

**Expansions that do not need an ORM.** `standardColumns(def)` and `tableConstraints(def)` are pure functions in the root export, so the ORM compiler, the migration checker and the docs share them. A `.unique()` field gives a unique constraint on `[tenant_id?, <column>, deleted_token?]`, a `.index()` field gives an index on `[tenant_id?, <column>]`, a tenant entity gets `UNIQUE (tenant_id, id)` (DATA-26), and an identifier longer than 63 characters is cut and ends with an 8 character hash. A compared field (`ci`, `ci_ai`) uses its shadow column `<column>_cmp` in the constraints.

### Schema compilers (slice 2, `@bieberkit/data/schema`)

```ts
toJsonSchema(def, mode: 'create' | 'update' | 'read'): JsonSchema      // draft 2020-12
toZodMini(def, mode: 'create' | 'update' | 'read'): ZodMiniType        // zod/mini
normalizeInput(value: unknown): unknown                                // NFC on every string, deep (SCH-05)
generateRegistrySource(defs, options): string                          // the EntityRegistry types, marked @generated (SCH-04)
```

- **API shape** (the same in both compilers and in the registry types): a relation `owner` appears as `ownerId` (UUID text), a decimal as text (`"12.30"`), money as `{ amount: "12.30", currency: "USD" }` where `currency` may be omitted on input and defaults to the field's currency, a date as `YYYY-MM-DD`, an instant as an ISO 8601 text in UTC, a state, sequence or computed field as read only text or its base type.
- **create** takes the writable fields. A field is required unless it is optional or has a default. Server fields (`id`, standard columns, `sequence`, `state`, computed, `createdAt`, `updatedAt`) are not accepted. **update** takes the same fields, all optional, and needs at least one. **read** has everything the API returns: `id`, `version`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt` for soft delete, and all declared fields. `tenantId`, `deletedToken` and shadow columns never leave the server. Unknown keys are refused (`additionalProperties: false`), and an optional field in `read` is `T | null`.
- `toZodMini` builds the same rules and applies NFC to every string before checking, so NFD input is accepted and comes out as NFC. With Ajv the caller runs `normalizeInput` first. Both count code points (SCH-03).
- `generateRegistrySource` writes `interface EntityRegistry { '<name>': { row; create; update } }` and `Row<N>`, `CreateInput<N>` and `UpdateInput<N>` read from it. `Row` is the read shape above.

### Tenant model (slice 3)

See "Slice 3: ORM compiler and tenant model" below.

## Decisions

Taken on 2026-11-22 on the nine open questions of the first draft, with reasons.

1. **Field kinds: add `int`, `boolean`, `date`, `dateTime` and `text`.** Nearly every real entity needs them, and `f.custom` for each would cost a column, a JSON Schema and a Zod value per field. `f.custom` stays for the rare rest. `f.int` is 32 bit, because a larger whole number is a `f.decimal` with scale 0 and the same safe range rules.
2. **A page size above 100: clamp to 100.** Done in slice 1 (`pageSize`). The response carries the real size in `meta`, so a client can notice.
3. **State machine writes: only through a generated `transition` call.** The state column is written by `transition(record, name, input)` after checking `from`, and a hook rejects any other change of it (`DATA_STATE_DIRECT_WRITE`). Creation sets `initial` and nothing else. The descriptor in slice 2 only holds `initial` and `transitions`.
4. **Sequences: one counter table.** `bieberkit_sequences (tenant_id, name, period, value)`, incremented inside the saving transaction by an atomic update that holds the row lock (`UPDATE ... RETURNING` on PostgreSQL and SQLite, `LAST_INSERT_ID(value + 1)` on MySQL). Writers queue on that row, so numbers are unique and gap free, and a rolled back save gives its number back. Slice 6.
5. **Localized fields: one translation table per entity.** `<table>_i18n (tenant_id, record_id, locale, <localized fields>)`, a composite foreign key to the entity and a unique `(record_id, locale)`. Slice 4.
6. **Generic features: shared tables without a foreign key.** `bieberkit_attachments`, `_comments`, `_timeline` and `_tags` carry `tenant_id`, `entity` and `record_id`, an index on those three, and no foreign key, because one column cannot reference every table. One table per entity and feature would multiply generated tables and migrations for every plugin entity. The cost is that the database cannot reject a stray row, so the feature service reads the parent record under the tenant filter on every write and copies the parent's `tenant_id`, never the caller's. A contract test covers it. Slice 6.
7. **Computed fields: read only for clients, calculated on read unless `stored: true`.** The descriptor holds the function, which never reaches the client. `bieberkit check` requires `stored: true` for a computed field used in a filter or a sort (DATA-07).
8. **Rounding: half away from zero, once on save.** Done in slice 1 (`toMinor`, `toScaled`).
9. **The cursor stays unsigned.** Done in slice 1. A forged cursor only picks a position the user could already reach, and a signing key would be one more secret to rotate.

Other calls made while writing the slice 2 tests, marked for review:

- **`id` is declared by `f.id()`, the rest of the standard columns are automatic.** DATA-18 says standard columns are never added by hand, and the spec example declares `id`, `createdAt` and `updatedAt`. This reconciles them: `id` is declared, `f.createdAt()` and `f.updatedAt()` only name columns that exist anyway.
- **Relations appear in the API as `<name>Id`.** It matches DATA-20 (`customerId`) and keeps the foreign key visible.
- **`Row` is the read shape of the API (JSON safe)**, not the ORM object, so one type serves server code and clients.
- **Entity files import `@bieberkit/data` only.** The root exports descriptors and the pure expansions without Zod, Ajv or MikroORM. The compilers are at `@bieberkit/data/schema`, and the ORM at `@bieberkit/data/orm`.
- **A bundle size test (SCH-07)** uses `rolldown`, which `tsdown` already brings, as a development dependency.
- **An instant is accepted only in UTC with a `Z`.** Ajv's `date-time` format accepts an offset such as `+07:00` and Zod's `z.iso.datetime()` does not (found by probing both on 2026-11-22), so the JSON Schema adds a pattern that requires `Z`, and both validators then agree. Clients send UTC, and showing a local time is their job (DATA-04).
- **Three rules are written once, as patterns, because the two validators disagree on their own formats.** Probing Ajv 8.20 and Zod 4.6 on 2026-11-22 found: `a@b.c` is an email for Ajv and not for Zod, and `a@b-.co` the other way round; Ajv's `uuid` accepts any 32 hex digits while `z.uuid()` checks version and variant; Ajv's `date-time` accepts the leap second `23:59:60Z` and Zod does not. So an email is checked by one ASCII pattern in both (no `format` keyword), a UUID by `format: uuid` in Ajv and `z.guid()` in Zod (both loose, like `isUuid`), and an instant by `format: date-time` plus a UTC pattern with seconds from 00 to 59. The contract suite keeps these cases as fixtures.
- **An optional field accepts `null`, which means "no value".** In `create` it may be omitted or `null`, in `update` `null` clears it, and in `read` it is `null` when empty. A required field never accepts `null`. `read` allows unknown keys, so an older client survives a newer server, while `create` and `update` refuse them.
- **Money amounts allow `15 - minor unit` digits before the point**, so the amount in minor units stays below 10^15 and inside the safe range. The exact bound is still checked by `toMinor` on the server (`DATA_MONEY_RANGE`).
- **`.unique()` is refused on `f.money`**, because a unique amount has no meaning. `.index()` is allowed.
- **Inline collections** (`f.hasMany(...).inline()`) and `f.hasOne` do not appear in the schemas of slice 2. They join in the HTTP milestone, which needs the schema of the target entity.
- **Codes:** `DATA_FIELD_INVALID`, `DATA_FIELD_CUSTOM_CALLBACK`, `DATA_ENTITY_INVALID`, `DATA_INPUT_INVALID`.

## Slice 3: ORM compiler and tenant model **[D]**

Designed on 2026-11-22 after reading MikroORM 7.2.9 and the spike code of ADR 0009, approved by the maintainer and implemented with the tests written first.

Two things found while implementing, both about MikroORM 7.2.9. `Uuid7Type` needs `compareValues`, because a row read as bytes and the same id converted again were compared as objects, so every update rewrote the key columns and the version moved on a flush that changed nothing. And on SQLite the plain `datetime` type had the same problem for every date, so datetimes use MikroORM's `DateTimeType`, which stores the same integer and compares correctly.

### Public API (`@bieberkit/data/orm`)

```ts
compileEntities(defs: readonly EntityDef<string>[], options?: { tenancy?: 'single' | 'shared-schema'; raw?: readonly EntitySchema[] }): EntitySchema[]
//   one schema per definition, in the same order, then the raw ones. tenancy defaults to 'shared-schema'.

createDatabase(env, { entities, audit?: AuditSink, references?: ReferenceVisibility }): Promise<Database>
interface Database { /* slice 1 */ asSystem<T>(reason: string, fn: () => Promise<T>): Promise<T> }

runAsTenant<T>(tenantId: string, fn: () => T): T        // sets requestContext().tenantId for jobs and tests
currentTenantId(): string | undefined

softDelete(em, row): void       restore(em, row): void       // set or clear deletedAt and deletedToken
expectVersion(row, expected: number | string): void         // If-Match, throws DATA_VERSION_STALE
bulkInsert(em, schema, rows): Promise<void>                  // adds id, tenant, timestamps and shadow values
bulkUpdate(em, schema, where, data): Promise<number>         // adds updatedAt and shadow values

interface AuditSink { record(entry: SystemScopeEntry): void | Promise<void> }
interface SystemScopeEntry { reason: string; userId?: string; requestId?: string; tenantId?: string; at: Date }
interface ReferenceVisibility { visible(entity: string, ids: readonly string[]): Promise<readonly string[]> }
```

### Mapping of an entity

| Field                      | ORM property and column                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | `id`, `Uuid7Type`, `onCreate` gives `uuid7()`                                                                                                                   |
| standard columns           | `tenantId`, `version` (versioned), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`, `deletedToken` (default empty), from `standardColumns(def)` |
| `string`, `email`, `oneOf` | `varchar(max)`, and `<name>Cmp` (hidden, `varchar(max)`) for `ci` and `ci_ai`, filled by `onCreate` and `onUpdate` with `fold()`                                |
| `text`                     | `text`                                                                                                                                                          |
| `int`, `boolean`           | `integer`, `boolean`                                                                                                                                            |
| `date`, `dateTime`         | `date` as `YYYY-MM-DD` text, `datetime` in UTC                                                                                                                  |
| `decimal`                  | `<name>Scaled`, bigint                                                                                                                                          |
| `money`                    | `<name>Minor` bigint and `<name>Currency` `varchar(3)` with the currency as default                                                                             |
| `belongsTo`                | many to one, column `<name>_id`. A composite `(tenant_id, <name>_id)` foreign key onto `(tenant_id, id)` when both entities are tenant scoped (DATA-20)         |
| `hasOne`, `hasMany`        | one to one and one to many, `mappedBy` is the only relation of the target that points back, else `DATA_ENTITY_INVALID`                                          |
| `custom`                   | `column.type` and `column.length`                                                                                                                               |
| stored computed            | a column filled on create and update by the function. A computed field that is not stored has no column (the API mapper of slice 4 calculates it)               |
| `state`, `sequence`        | plain `varchar` columns. Their rules come in slice 6                                                                                                            |

Unique constraints and indexes come from `tableConstraints(def)`, translated from column names to property names. The `orm: { indexes, properties }` override is merged last, and `raw` schemas are added unchanged.

### Tenant rules

- **Filter.** Every tenant entity has the filter `tenant` and, with `softDelete`, the filter `softDelete`. The tenant filter reads `requestContext().tenantId` when the query runs. No tenant is `DATA_TENANT_REQUIRED` (400), never an unfiltered read.
- **No bypass.** `BieberEntityManager` overrides `applyFilters()`. Disabling the tenant filter (`filters: { tenant: false }`, `filters: false`, a list without it) on a read, `nativeUpdate` or `nativeDelete` is `DATA_TENANT_FILTER_DISABLED`, unless the call runs inside `db.asSystem()`.
- **`asSystem(reason, fn)`.** Switches the tenant filter off for the async call tree of `fn`. A blank reason is `DATA_SYSTEM_SCOPE_REASON`. Every use is recorded through the `AuditSink`. Until the audit table of slice 6 the default sink writes a `warn` log line.
- **Tenant on write.** `tenantId` is taken from the context on create. A different value is `DATA_TENANT_MISMATCH` (403), and changing it later is `DATA_TENANT_IMMUTABLE` (403).
- **`tenancy: 'single'`** (CFG-11) compiles tenant entities without `tenant_id`, the unique pair and the filter. A tenant entity then behaves like a global one.
- **A global entity cannot reference a tenant entity**: `compileEntities` throws `DATA_ENTITY_INVALID`, since no foreign key could keep the row inside one tenant.
- **References (DATA-20).** A flush check counts the ids of every relation set on a created or updated row under the current filter. Fewer visible ids than given is `DATA_REFERENCE_NOT_VISIBLE` (422). `ReferenceVisibility`, when given, then filters the visible ids by the CASL read rule of `@bieberkit/auth`. The composite foreign key stays as the backstop.

### Other rules

- **Version (API-13).** A stale flush is `DATA_VERSION_STALE` (412). `expectVersion` compares an `If-Match` value (a number, or text such as `3`, `"3"` and `W/"3"`) before the write, and a value that is not a version is `DATA_VERSION_INVALID` (400). A write bumps `version` by one.
- **Soft delete (DATA-16).** `softDelete` sets `deletedAt` and `deletedToken = id`. The filter `softDelete` hides deleted rows, and `filters: { softDelete: false }` stays allowed for trash views because it is not a security boundary.
- **Shadow columns (DATA-21).** `bulkInsert` and `bulkUpdate` add the folded values. A direct `nativeUpdate` or `insert` that sets a compared field without its shadow value is `DATA_SHADOW_STALE`.
- **Standard values.** `createdBy` and `updatedBy` come from `requestContext().userId`.

### Errors of slice 3

| Code                          | Status | Fix                                                                                    |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `DATA_TENANT_REQUIRED`        | 400    | The request has no tenant. Send the tenant header, or run the job inside `runAsTenant` |
| `DATA_TENANT_FILTER_DISABLED` | 500    | The tenant filter cannot be switched off here. Use `db.asSystem(reason, fn)`           |
| `DATA_SYSTEM_SCOPE_REASON`    | 500    | Give `asSystem` a reason that says why, for the audit log                              |
| `DATA_TENANT_MISMATCH`        | 403    | The row belongs to another tenant than the request                                     |
| `DATA_TENANT_IMMUTABLE`       | 403    | The tenant of a row never changes                                                      |
| `DATA_REFERENCE_NOT_VISIBLE`  | 422    | A referenced id does not exist for this tenant, or the user may not read it            |
| `DATA_VERSION_STALE`          | 412    | The record changed since it was read. Reload it and try again                          |
| `DATA_SHADOW_STALE`           | 500    | Use `bulkInsert` and `bulkUpdate`, which keep the shadow columns right                 |

### Decisions of slice 3

1. **A subclass of `EntityManager`, not only filters.** A plain filter can be switched off by any caller with one option. The subclass is installed through `Configuration.entityManager` and checks the options, so the only way to read across tenants is the audited `asSystem`.
2. **The tenant is read when the query runs.** Not copied onto each fork, so a fork reused in another tenant context cannot keep the old one, and two tabs on two tenants cannot cross (DATA-19).
3. **`asSystem` is a method of `Database`.** It needs the audit sink, so one way to do it (P1).
4. **No `rls` filter option.** MikroORM 7.2 can also write PostgreSQL row level security policies from a filter. The spec calls RLS an optional second layer (section 9.4), and it needs the application role and `FORCE ROW LEVEL SECURITY` work of the migration slice. It is left for then.
5. **API mappers wait for slice 4.** Turning `{ amount, currency }`, decimal text and `ownerId` into ORM properties is needed when HTTP arrives. Slice 3 round trips through the ORM properties.
6. **The roadmap item about a `bieberkit check` rule stays open.** The runtime guard `DATA_SHADOW_STALE` is stronger, but the CLI rule is still needed for code that never runs in tests.

## Slice 4: queries, translations and mappers

Designed on 2026-11-22. None of it is maintainer-designed, so the tests and the code follow the design directly.

### Public API (`@bieberkit/data/orm`)

```ts
listPage(em, schema, options?: ListOptions): Promise<Page>
interface ListOptions {
  where?: Record<string, unknown>                // ORM property names; compared fields are folded for you
  sort?: readonly { field: string; direction?: 'asc' | 'desc' }[]   // default: id ascending
  limit?: unknown                                 // pageSize(): 1 to 100, default 25
  cursor?: string
  withTotal?: boolean
  select?: readonly string[]                      // properties to return, `id` is always there
  populate?: readonly string[]                    // relations, one batched query each
  locale?: string                                 // the translation to prefer, with fallback to the default value
}
interface Page { rows: Record<string, unknown>[]; limit: number; nextCursor: string | null; total?: number }

queryableFields(schema): readonly string[]        // what a client may filter or sort by (DATA-07)

setTranslation(em, schema, recordId, locale, values): Promise<void>   // upsert one row of the translation table
translationName(entityName): string               // 'crm.Page' gives 'crm.PageTranslation'

toApiRow(schema, row): Record<string, unknown>    // an ORM row to the read shape of the API
toOrmData(schema, input, mode: 'create' | 'update'): Record<string, unknown>   // a validated body to ORM properties

DatabaseOptions.queryLog?: (sql: string) => void  // for tests that count queries (PERF-04)
```

### Rules

- **Pages (DATA-06, DATA-11).** `listPage` always orders by the sort fields and then by `id`, so the order is total. The cursor holds the values of the last row, and the next page is the rows after it (`(a, b, id) > (x, y, z)`, written for mixed directions). It also holds the sort, so a cursor of another sort is `DATA_CURSOR_INVALID`. One more row than the limit is read to know whether there is a next page. `total` is counted only when `withTotal` is true, over the same filter without the cursor.
- **Index rule (DATA-07).** A client may filter or sort only by `id`, `createdAt`, `updatedAt` and fields declared `.index()` or `.unique()`. Another field is `DATA_FIELD_NOT_INDEXED` (400) and an unknown one `DATA_QUERY_INVALID`. A sort field must not be optional (`DATA_SORT_INVALID`), because a keyset over nulls is not total.
- **Compared fields (DATA-21).** `where: { name: 'DUONG' }` on a `ci_ai` field looks in the shadow column with the folded value. Allowed: equality, `$eq`, `$ne`, `$in`, `$nin` and `$like` (the pattern is folded). Sorting by a compared field sorts by the shadow column.
- **Read only (DATA-10, PERF-04).** Rows are read with `disableIdentityMap`, returned as plain objects, and relations are loaded with one query each (`select-in`). Hidden columns do not come back. The read goes to a replica when there is one (`connectionType: 'read'`).
- **Translations (DATA-17).** A localized field keeps its value for the default locale in the table of the entity. Each other locale is a row of `<table>_i18n` with `record`, `locale` and the localized fields, unique on `(record, locale)` and with the same tenant foreign key as any relation. The compiler adds the schema `<name>Translation` after the entities. A read with `locale` takes every translated, non-null field from that row and the default value for the rest. It costs one query for the whole page.
- **Mappers.** `toApiRow` turns money into `{ amount, currency }`, decimals into text, a relation into `<name>Id`, instants into ISO text and stored or non-stored computed fields into values (a non-stored one is calculated here, MOD-08). `toOrmData` does the reverse for a body that was validated with the schemas of slice 2.
- **`orm.uniques`** joins `orm.indexes` in the override of an entity: composite unique constraints by property names.

### Errors of slice 4

| Code                     | Status | Fix                                                                             |
| ------------------------ | ------ | ------------------------------------------------------------------------------- |
| `DATA_QUERY_INVALID`     | 400    | The query names a field or an operator that does not exist. Check the name      |
| `DATA_FIELD_NOT_INDEXED` | 400    | Filter and sort only by an indexed field. Add `.index()` to the field (DATA-07) |
| `DATA_SORT_INVALID`      | 400    | Sort by a field that is always set, such as a required field or `createdAt`     |
| `DATA_LOCALE_INVALID`    | 400    | Use a language tag such as `vi` or `pt-BR`                                      |
| `DATA_FIELD_INVALID`     | 500    | Only localized fields have translations (also raised by builders)               |

### Found while implementing slice 4

All of it about MikroORM 7.2.9.

- **A relation on a composite tenant key cannot be filtered by its id.** `{ record: id }` becomes a row value comparison that SQLite refuses. The translation code asks for `{ record: { id } }`, which joins the owner table and keeps the tenant filter.
- **`insertMany` gives the shared `tenant_id` column to the first row only** when a relation uses the same column, so the rows after it fail the foreign key. `bulkInsert` inserts a table that has a composite tenant key one row at a time, and every other table in chunks of 500.
- **A bigint column comes out of `toObject` as text.** `toApiRow` reads it from a bigint or a string.
- **`strategy: 'select-in'`** is set on every page read. The default may join a to-one relation into the same query, which is fine, but the rule of DATA-10 is one batched query per relation, and a join of a collection would multiply the rows of a page.

## Slice 5: migrations

Designed on 2026-11-22. None of it is maintainer-designed (ADR 0008 and ADR 0011 decide the model), so the tests and the code follow the design directly.

### Two kinds of migration

1. **Project migrations** are files generated by `@mikro-orm/migrations` (7.2.9, MIT, same maintainer as the ORM) from the entities of the project. The diff is always snapshot against metadata, never the live database (ADR 0008), so `migrate:make` gives the same file on every machine. The snapshot is `.snapshot-<dialect>.json` next to the files, one per dialect, and `snapshotOnMigrate` is off so that `up` never rewrites it from a live database.
2. **Plugin steps** are the versioned steps of ADR 0011 (DATA-24), run by a small runner of our own over Kysely, with the ledger `bieberkit_plugin_migrations`.

Plugin steps run first and project migrations second, because a project entity may point at a table of a plugin. The command that orchestrates both is the CLI of M1.8. This slice delivers the two parts.

### Public API

`@bieberkit/data` (root, no ORM, so `bieberkit check` can use it):

```ts
detectDestructive(statements: readonly string[]): DestructiveFinding[]
upStatementsOfMigration(source: string): string[]          // the addSql strings of up(), never of down()
interface DestructiveFinding { kind: 'drop-column' | 'drop-table' | 'rename' | 'alter-type' | 'not-null-without-default'; statement: string }

interface PluginMigrationStep {
  plugin: string; version: string; id: string
  kind: 'expand' | 'migrate' | 'contract'
  after?: string                                            // contract only: the expand step that it finishes
  up(trx: Transaction<StepDatabase>, dialect: Dialect): Promise<void>   // StepDatabase: tables are named as text
}
orderSteps(steps, pluginOrder): PluginMigrationStep[]       // plugin boot order, then version, then declaration order
validateSteps(steps, pluginOrder): void                     // DATA_MIGRATION_STEP_INVALID
findStepRisks(steps): StepRisk[]                            // the rules of `bieberkit check` (DATA-08, DATA-27)
```

`@bieberkit/data/orm`:

```ts
openMigrator(env: MigrationEnv, options: { entities, directory, logger? }): Promise<Migrator>
interface MigrationEnv { DB_CONNECTION: Dialect | undefined; MIGRATE_DATABASE_URL: string | undefined; DB_POOL_MAX: number }
interface Migrator {
  readonly dialect: Dialect
  make(name?: string): Promise<MadeMigration | null>         // null when entities and snapshot agree
  up(options?: { allowDestructive?: boolean }): Promise<string[]>    // names applied, oldest first
  down(): Promise<string[]>                                   // rolls back the last one
  status(): Promise<{ executed: string[]; pending: string[] }>
  runPluginSteps(steps, options: { pluginOrder; deployId? }): Promise<PluginRun>
  close(): Promise<void>
}
interface MadeMigration { name: string; path: string; up: string[]; down: string[]; destructive: DestructiveFinding[] }
interface PluginRun { deployId: string; applied: string[]; refused: { step: string; code: string; message: string }[]; waiting: string[] }

uuidType(dialect): RawBuilder                                 // uuid, binary(16), blob
setNotNull(trx, dialect, table, column, type): Promise<void>
runPluginMigrations(db, dialect, steps, { pluginOrder, deployId? }): Promise<PluginRun>   // what Migrator.runPluginSteps calls
```

### Rules

- **The role (DATA-25).** `openMigrator` reads `MIGRATE_DATABASE_URL` and nothing else. A missing one is `DATA_MIGRATE_CONNECTION_MISSING`. `CoreEnv` already copies `DATABASE_URL` into it in development only. The web, worker and scheduler roles never import `openMigrator`.
- **Names.** Files are `Migration<yyyymmddhhmmss>[_name].ts`. When two files are made in the same second the second gets a numeric suffix (MikroORM would overwrite the first). The table that records them is `bieberkit_migrations`.
- **Destructive statements (DATA-08).** `make` returns the findings of the generated `up` and writes the file. `up` scans the `up()` body of every pending file and throws `DATA_MIGRATION_DESTRUCTIVE` before running any of them, unless `allowDestructive` is true. The release that drops a column is the contract release, and the person who runs it says so. A statement is split into its clauses, so `alter table t add column a ..., drop column b` is found. A new column is `not-null-without-default` when it is `not null` and has no `default`.
- **Rollback.** `down` runs the `down()` of the last executed migration only. A rollback is a repair, never part of a deploy.
- **Plugin steps (DATA-24, ADR 0011).** `runPluginSteps` creates the ledger when it is missing, validates and orders the steps, and runs each pending one in its own transaction together with its ledger row, so a failed step leaves no row. The ledger holds `(plugin, step_id, version, kind, applied_at, deploy_id)` with `(plugin, step_id)` as primary key. A contract step whose `after` step is in the ledger with the same `deploy_id` is refused with `PLG_CONTRACT_SAME_DEPLOY`, and every later step of that plugin waits. Other plugins go on. The call returns what was applied, refused and waiting. It does not throw for a refusal, so that the CLI can print all of them and exit with a failure.
- **SQLite (DATA-27).** The runner switches foreign keys off before the transaction of every step on SQLite, because the pragma has no effect inside one and a table rebuild would otherwise delete rows of dependent tables. Before the commit it runs `pragma foreign_key_check`, and a violation rolls the step back. Foreign keys are switched on again in all cases.
- **`setNotNull`.** PostgreSQL uses `alter column set not null`, MySQL `modify column <type> not null`, SQLite rebuilds the table from its own `create table` text, so defaults, checks, foreign keys, unique constraints, indexes and triggers survive. Identifiers must match `[A-Za-z_][A-Za-z0-9_]*`.
- **`findStepRisks` is static.** It reads `up.toString()`. It reports a step that has more than one DDL statement without an existence guard on MySQL, and a drop or rename in a step that is not `contract`. It is a heuristic for CI, not a runtime refusal, so a false positive never stops a deploy.

### Errors of slice 5

| Code                              | Status | Fix                                                                                       |
| --------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `DATA_MIGRATE_CONNECTION_MISSING` | 500    | Set `MIGRATE_DATABASE_URL`, the role that owns the schema (DATA-25)                       |
| `DATA_MIGRATION_DESTRUCTIVE`      | 409    | Split it: expand and migrate now, contract in a later release. Or pass `allowDestructive` |
| `DATA_MIGRATION_STEP_INVALID`     | 500    | A step has a duplicate id, an unknown plugin, a bad version or a wrong `after`            |
| `PLG_CONTRACT_SAME_DEPLOY`        | 409    | Deploy the expand release first, and run the contract step in the next one (DATA-08)      |

### Found while implementing slice 5

All of it about MikroORM 7.2.9.

- **The migrations are TypeScript that Node runs.** MikroORM imports each file, and Node strips the types of `.ts` files outside `node_modules` (Node 24.12 and later). A project keeps its migrations in its own source, and the tests of this package make them under `packages/data/.tmp`, because a file under `node_modules` is refused.
- **The first migration has an empty `down`.** `migrator.create(undefined, false, true)` writes the schema as `up` only. `down()` of the first migration therefore changes nothing. The first one is never a thing to roll back.
- **MySQL opens its pool on the first query.** `em.getKysely()` throws before that, so `kyselyOf` sends `select 1` first and is async.
- **A column is added with `add <name>`**, without the word `column`, on PostgreSQL and MySQL. The detector accepts both.
- **The migrations table is `bieberkit_migrations`**, set by `migrations.tableName`, so every table that the framework owns starts with `bieberkit_`.
- **A SQLite rebuild does not carry views.** A view that names the table makes the rename fail, so a step drops it before and creates it again after. The check of `bieberkit check` for this waits for M1.8.

### Left out

- **A migration lock.** Two `migrate` runs at once are stopped by the primary key of the ledger and by the table of MikroORM on PostgreSQL and SQLite. MySQL has no transactional DDL, so a lock (`get_lock`) belongs to the deploy of M1.8 where one run is guaranteed (DATA-25 says once per deploy).
- **Row level security policies and the append-only grants of `audit_log`** (DATA-25) come with the audit table of slice 6.
- **The `migrate:*` commands** are the CLI of M1.8. This slice is the library they call.

## Slice 6: outbox and audit log

Designed on 2026-11-23. None of it is maintainer-designed (MOD-18, OBS-05, DATA-25 and ADR 0010 decide the model). The roadmap item of slice 6 is split in three: this slice, the domain parts (state machines, sequences, features) as slice 7, and the standalone Ajv and serializer modules as slice 8. The slicing table above says so.

### The framework tables are plugin steps

`@bieberkit/data` owns four tables. They are created by `dataMigrationSteps`, the steps of the plugin `@bieberkit/data` (DATA-24), run by the migrate role before the project migrations. They are never in the snapshot of a project, because a project does not pass them to `openMigrator`. One step makes one table or one index, so a MySQL step is one DDL statement.

| Table                        | Columns                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bieberkit_outbox`           | `id` uuid, `tenant_id` uuid null, `event`, `event_version`, `entity` null, `record_id` uuid null, `record_version` null, `payload` text (JSON), `idempotency_key` null, `request_id` null, `user_id` uuid null, `created_at` and `available_at` as epoch milliseconds, `attempts`, `last_error` null |
| `bieberkit_outbox_processed` | `(subscriber, event_id)` primary key, `processed_at` epoch milliseconds                                                                                                                                                                                                                              |
| `audit_log`                  | `id` uuid, `tenant_id` uuid null, `at` instant, `actor_id` uuid null, `request_id` null, `action`, `entity` null, `record_id` uuid null, `reason` null, `data` text (JSON) null                                                                                                                      |

The ORM maps them with hand written schemas (`frameworkEntities`) that `createDatabase` adds to the entities of the project. Their tenant column is the property `tenant`, not `tenantId`, so the tenant hooks of `DataSubscriber` leave it alone: an audit row of a failed login has no tenant, and the dispatcher reads every tenant. A drift between a step and a schema fails the tests, which write through the ORM into tables that the steps made.

### Public API (`@bieberkit/data/orm`)

```ts
emitEvent(em, event: OutboxEvent): void                 // adds a row to the unit of work: it commits with the data (MOD-03, §7.5)
interface OutboxEvent { name: string; version?: number; payload: unknown; record?: { entity: string; id: string; version?: number }; idempotencyKey?: string }

recordAudit(em, entry: AuditEntry): void                // the same, for the audit log (OBS-05)
interface AuditEntry { action: string; entity?: string; recordId?: string; reason?: string; data?: unknown; tenantId?: string }

createOutboxDispatcher(db, options: { publisher: OutboxPublisher; batchSize?: number; pollMs?: number; maxBackoffMs?: number; logger?: Logger }): OutboxDispatcher
interface OutboxPublisher { publish(message: OutboxMessage, trx: Transaction<StepDatabase>): Promise<void> }
interface OutboxDispatcher { dispatchOnce(): Promise<DispatchResult>; start(): void; wake(): void; stop(): Promise<void> }
interface OutboxMessage { id; jobId: string /* 'ob-<id>' */; name; version; tenantId?; userId?; requestId?; entity?; recordId?; recordVersion?; payload; idempotencyKey?; createdAt: Date }
outboxLag(db): Promise<{ pending: number; oldestAgeMs: number | null; failing: number }>

processOnce(db, subscriber, eventId, handler: (em) => Promise<void>): Promise<boolean>   // false when this subscriber already handled the event
purgeProcessed(db, options?: { olderThanMs?: number }): Promise<number>                  // default 7 days

dataMigrationSteps: readonly PluginMigrationStep[]      // plugin '@bieberkit/data'
grantAuditLog(trx, dialect, role: string): Promise<void> // PostgreSQL and MySQL: only select and insert on audit_log for the application role (DATA-25)
DatabaseOptions.audit?: AuditSink | 'table'             // 'table' writes the use of asSystem into audit_log (AUTHZ-05)
```

### Rules

- **Same transaction (§7.5).** `emitEvent` and `recordAudit` only add an entity to the unit of work. The flush that writes the data writes them, in one transaction, and a rolled back flush leaves neither. They take the tenant, the user and the request id from the request context.
- **Dispatch (MOD-18, ADR 0010 rule 4).** `dispatchOnce` runs one transaction: it claims up to 100 due rows in the order of the index (`available_at, created_at, id`) with `FOR UPDATE SKIP LOCKED` on PostgreSQL and MySQL (SQLite has one writer, so `BEGIN IMMEDIATE` is the lock), calls `publisher.publish(message, trx)` for each, and deletes them. The transaction is the same one that the `database` queue driver inserts its job in (rule 5). On MySQL a row is deleted by its own primary key, and a deadlock (error 1213) is retried up to five times. The delivery is at least once and has no order. Every message carries `recordVersion`, so a subscriber can ignore an older event.
- **A poison row does not block the rest.** When `publish` throws for a row, the transaction is rolled back, and in a new one that row gets `attempts + 1`, `last_error` and `available_at` in the future (one second doubled for each attempt, at most one hour). The next call goes on with the other rows. `outboxLag(db).failing` counts rows with attempts.
- **`jobId` (Q-01).** `jobId` is `ob-<id>`, stable across redeliveries, so the queue can deduplicate.
- **Run loop.** `start` polls every `pollMs` (1000) and `wake` ends the wait at once. On PostgreSQL a `LISTEN/NOTIFY` listener would call `wake`. It needs the `pg` package as a dependency of its own, so it comes with the queue package and its ADR line (P9). `stop` waits for the batch in progress.
- **Processed ids (MOD-18).** `processOnce` inserts `(subscriber, event_id)` and runs the handler in the same transaction. A second call returns `false` and does not run the handler. A handler that throws rolls the marker back, so the next delivery runs it again. `purgeProcessed` deletes markers older than seven days.
- **Append only (DATA-25, OBS-05).** The audit log cannot be changed in four places: the unit of work refuses an update or a delete of an audit row (`DATA_AUDIT_APPEND_ONLY`), SQLite triggers abort `update` and `delete`, and on PostgreSQL and MySQL `grantAuditLog` gives the application role `select` and `insert` only. The migrate role runs it with the name of the application role, which `bieberkit migrate` reads from `DATABASE_URL`.
- **`asSystem` (AUTHZ-05).** With `audit: 'table'` the sink writes the entry in a transaction of its own, before the function runs, so a failed function still leaves its record. If the write fails the scope does not start.

### Errors of slice 6

| Code                     | Status | Fix                                                                         |
| ------------------------ | ------ | --------------------------------------------------------------------------- |
| `DATA_AUDIT_APPEND_ONLY` | 500    | The audit log is never changed. Write a new entry that corrects the old one |
| `DATA_OUTBOX_INVALID`    | 500    | An event has a blank name, a version below 1 or a payload that is not JSON  |
| `DATA_AUDIT_INVALID`     | 500    | An audit entry has no action, or data that is not JSON                      |

### Found while implementing slice 6

All of it about MikroORM 7.2.9 and the databases.

- **The claim must be in index order on MySQL.** With `order by created_at, id` and a range on `available_at`, MySQL sorts the rows with a filesort and locks every due row that it read, so a second dispatcher skips all of them. Ordering by the whole index (`available_at, created_at, id`) lets it stop after the batch and lock only that. A test holds the first two rows and expects the next call to take the other two.
- **`kyselyOf` must not be called inside a transaction on SQLite.** There is one connection, so a second statement outside the transaction waits for it. A handler of `processOnce` writes through its `em`, which is bound to the transaction.
- **`sum(case ...)` for the count of failed rows.** MySQL has no `filter (where ...)`.
- **A drift test compares the steps with the schemas.** `getUpdateSchemaSQL` after the steps must name neither the outbox nor the audit table.
- **The default of `audit` stays a log line.** A project that has not made the framework tables would fail on the first `asSystem`, so `'table'` is chosen on purpose.
- **MySQL cannot take one table out of a database-wide grant.** `grantAuditLog` grants `select` and `insert`, and the application role must not hold `update` or `delete` on the whole database (DATA-25).

### Left out

- **`LISTEN/NOTIFY`** (see Run loop) and the metrics export. `outboxLag` returns the numbers. The observability package turns them into the metric.
- **Reading the audit log** for the admin UI. It needs the permission model, so it comes with the `audit-log` plugin of M1.8. Until then a reader filters on the tenant itself.
- **Encrypted `pii` values in audit data** (PDP-06) come with the privacy work. `data` holds what the caller gives.
- **An audit entry for every row change** is written by the services and the generated routes of M1.3, which know the action. This slice gives them the table and the call.

## Slice 7: state machines and sequences

Designed on 2026-11-23. None of it is maintainer-designed (MOD-06, MOD-07, MOD-12 and decisions 3 and 4 above decide the model). Slice 6 said slice 7 would also hold the features. They are moved to slice 8, so that each slice stays reviewable, and the standalone Ajv modules are slice 9.

### Public API (`@bieberkit/data/orm`)

```ts
transition(em, schema, row, name, input?): Promise<TransitionResult>   // changes the state of a loaded row, adds an event and an audit entry, does not flush
interface TransitionResult { name: string; from: string; to: string; event: string }
availableTransitions(schema, row): readonly { name: string; to: string; permission?: string }[]   // what the row can do now, for the buttons
transitionOf(schema, name): { from; to; permission?; input? }          // the declaration, for the route that checks the permission first

nextSequence(em, key: { entity: string; field: string; tenantId?: string }, options?: { resetEvery?: ResetEvery; now?: Date }): Promise<number>
formatSequence(pattern: string, value: number, now?: Date): string    // 'PO-{yyyy}-{seq:5}' and 42 give 'PO-2026-00042'
```

### State machine rules

- **Created in the initial state (decision 3).** A new row has `initial` in its state field, or nothing, which becomes `initial`. Any other value is `DATA_STATE_DIRECT_WRITE`.
- **Changed only by `transition` (MOD-07).** The unit of work refuses an update that changes a state field unless `transition` made it (`DATA_STATE_DIRECT_WRITE`, 500: it is a bug of the caller). `nativeUpdate`, `insert` and `insertMany` refuse a state field as they refuse a stale shadow column, and so do `bulkUpdate` and `bulkInsert`.
- **`transition` checks, then changes.** An unknown name is `DATA_TRANSITION_UNKNOWN` (404). A row whose state is not in `from` is `DATA_TRANSITION_NOT_ALLOWED` (409). `input` is checked against the schema of the transition with the Standard Schema interface that Zod implements, and a refusal is `DATA_TRANSITION_INPUT_INVALID` (422). Input given to a transition that declares none is refused the same way. The permission is not checked here: the route reads `transitionOf(...).permission` and asks the ability before it calls (AUTHZ).
- **It adds, never flushes.** `transition` sets the state, then adds an outbox event and an audit entry to the unit of work, so the service's flush writes all three in one transaction (§7.5). A stale row fails the flush as `DATA_VERSION_STALE`.
- **The event** is named `<module>.<resource>.<transition>` from the entity name, for example `crm.customer.qualify` for `crm.Customer`. Its payload is `{ id, transition, from, to, input? }` and its record version is the version after the write. The audit action is `<entity name>.<transition>`, for example `crm.Customer.qualify`, and its data is `{ from, to, input? }`.

### Sequence rules

- **One counter row per tenant, name and period (decision 4).** `bieberkit_sequences (tenant_id, name, period, value)` with those three as the primary key. `name` is `<entity>.<field>`. `period` is `2026` for `resetEvery: 'year'`, `2026-11` for `'month'`, `-` for `'never'`. A global entity uses the nil UUID as its tenant.
- **Allocation is inside the flush transaction.** A `beforeCreate` hook gives every new row its number when the sequence field is empty. A value that the caller already set is kept, for imports. The counter is raised by an update that takes the row lock and holds it until the commit, so concurrent writers queue, numbers are unique and have no gap, and a rolled back save gives its number back (MOD-12). The row is first added with `insert ... on conflict do nothing` (`insert ignore` on MySQL), then raised by `update ... returning value` (PostgreSQL, SQLite) or `update ... set value = LAST_INSERT_ID(value + 1)` and `select LAST_INSERT_ID()` (MySQL).
- **The pattern** takes `{yyyy}`, `{yy}`, `{mm}` and one `{seq:N}`. The date is UTC, and a number longer than `N` digits is not cut.
- **The table is a framework table.** `dataMigrationSteps` gets one more step (version 0.2.0) and `frameworkEntities` one more schema, so `schema.create()` and a deploy agree.

### Errors of slice 7

| Code                            | Status | Fix                                                                     |
| ------------------------------- | ------ | ----------------------------------------------------------------------- |
| `DATA_STATE_DIRECT_WRITE`       | 500    | Change a state with `transition`. A new row starts in the initial state |
| `DATA_TRANSITION_UNKNOWN`       | 404    | The entity has no such transition. Check the name                       |
| `DATA_TRANSITION_NOT_ALLOWED`   | 409    | The record is not in a state that this transition starts from           |
| `DATA_TRANSITION_INPUT_INVALID` | 422    | The input does not match the schema of the transition, or it takes none |

### Found while implementing slice 7

All of it about MikroORM 7.2.9 and the databases.

- **One statement takes the number.** A first version inserted the counter row with `insert ignore` and then updated it. Twenty concurrent writers deadlocked on MySQL (a shared lock, then an exclusive one). One upsert does both: `insert ... on conflict do update ... returning` on PostgreSQL and SQLite, and `insert ... on duplicate key update value = LAST_INSERT_ID(value + 1)` followed by `select LAST_INSERT_ID()` on MySQL. The first value is written as `LAST_INSERT_ID(1)`, so one read serves both paths.
- **`beforeCreate` runs inside the flush transaction**, and `nextSequence` on its `em` joins it. A test saves a row that fails on a unique key after the number was taken, and the next save gets the same number.
- **The compiler marks the properties.** A state property carries `bkState: { initial }` and a sequence property `bkSequence: { pattern, resetEvery }`. MikroORM keeps unknown options on `meta.properties`, so the subscriber and the entity manager read the markers and need no map from schemas to definitions.
- **`snake` is for property names.** `snake('Order')` is `_order`, so the event name uses its own conversion of the resource name.
- **A sequence is now numbered by the server.** Two tests of slice 3 and 4 expected an empty sequence (`number: null`). They now expect `CUS-00001`. A number that is given is still kept.

### Left out

- **The permission check and the route** (`POST .../actions/<name>`) are in M1.3 and M1.4. `transitionOf` and `availableTransitions` are what they call.
- **`actions`** (buttons that are not transitions, MOD-06) are handlers of the route layer. The data layer has nothing to add.
- **Tenant timezone for the date in a pattern.** It is UTC. A tenant setting can pass `now` later.

## Slice 8: record features

Designed on 2026-11-23. None of it is maintainer-designed (MOD-13 and decision 6 above decide the model). This slice is built on the branch of slice 7, which was not merged yet.

### Four generic tables

`features: ['attachments', 'comments', 'timeline', 'tags']` on an entity (MOD-13) turns on shared tables that every entity uses, so a plugin entity adds no table and no migration. They are framework tables: steps of `dataMigrationSteps` (version 0.3.0) and schemas of `frameworkEntities`. Every row has `tenant_id`, `entity` and `record_id`, and an index on those three. There is no foreign key, because one column cannot point at every table (decision 6). `tenant_id` is never null: an entity without a tenant uses the nil UUID, so a unique index can hold.

| Table                   | Columns besides `id`, `tenant_id`, `entity`, `record_id`                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `bieberkit_comments`    | `body` text, `created_at`, `created_by`                                                             |
| `bieberkit_tags`        | `tag` (64 code points), `created_at`, `created_by`. Unique on `(tenant_id, entity, record_id, tag)` |
| `bieberkit_attachments` | `storage_key` (512), `name` (255), `content_type` (255), `size` bigint, `created_at`, `created_by`  |
| `bieberkit_timeline`    | `type` (100), `data` text (JSON) null, `at`, `actor_id`                                             |

### Public API (`@bieberkit/data/orm`)

```ts
addComment(em, schema, recordId, { body }): Promise<CommentRow>        listComments(em, schema, recordId, page?): Promise<FeaturePage<CommentRow>>      deleteComment(em, schema, recordId, commentId): Promise<boolean>
addTag(em, schema, recordId, tag): Promise<TagRow>                     listTags(em, schema, recordId, page?): Promise<FeaturePage<TagRow>>              removeTag(em, schema, recordId, tag): Promise<boolean>
addAttachment(em, schema, recordId, { key, name, contentType, size }): Promise<AttachmentRow>   listAttachments(...)                                   removeAttachment(em, schema, recordId, attachmentId): Promise<boolean>
addTimeline(em, schema, recordId, { type, data? }): Promise<TimelineRow>                         listTimeline(...)
interface FeaturePage<T> { rows: T[]; limit: number; nextCursor: string | null }   // page = { limit?, cursor? }
```

### Rules

- **The parent is read under the filters, on every call (decision 6).** The service loads the record with `em.findOne`, so the tenant filter and the soft delete filter apply. A record that is not visible, of another tenant, deleted or missing is `DATA_RECORD_NOT_FOUND` (404), which does not tell the two cases apart. Nothing runs without a tenant (`DATA_TENANT_REQUIRED`). Inside `asSystem` the parent of any tenant is visible.
- **The tenant is the parent's, never the caller's.** No function takes a tenant. A row is written with the `tenantId` of the parent, and a list reads only rows with that tenant, so a stray row that someone inserted by hand for another tenant is not returned (the contract test of decision 6).
- **The feature must be on.** An entity that did not list the feature gets `DATA_FEATURE_DISABLED` (500, a bug of the caller).
- **The record's permissions apply.** The route asks the ability for `read` or `update` on the record before it calls these functions (§14.2). The data layer checks that the record is visible, and nothing more.
- **Adding does not flush.** Like `emitEvent`, an `add*` call adds to the unit of work, so the row commits with the rest of the transaction. The returned row already has its `id` and its dates.
- **Lists.** Rows come in the order of their ids, which is the order of creation (DATA-03). The page size follows `pageSize` (DATA-06: 25 by default, at most 100). The cursor is the id of the last row, and a row after it is `id > cursor` (decision 9: unsigned).
- **Tags.** A tag is NFC text, trimmed, with 1 to 64 code points. Adding a tag that exists returns it and writes nothing. Case does not matter: `VIP` and `vip` are one tag, and the first spelling is kept. The unique index and the lookups use `tag_key`, the tag folded by `fold('ci')` (DATA-21), because MySQL compares text without case and PostgreSQL and SQLite with it.
- **Attachments are metadata.** The file is in the storage of M1.5, and `key` is the key it gave. `size` is a whole number of bytes from 0 to the safe maximum.
- **The timeline** has what happened to the record. `transition` adds an entry of type `transition` with `{ name, from, to }` when the entity has the feature.

### Errors of slice 8

| Code                    | Status | Fix                                                                      |
| ----------------------- | ------ | ------------------------------------------------------------------------ |
| `DATA_FEATURE_DISABLED` | 500    | Add the feature to `features` of the entity                              |
| `DATA_RECORD_NOT_FOUND` | 404    | The record does not exist for this tenant                                |
| `DATA_FEATURE_INVALID`  | 400    | A comment, tag or attachment has a blank or too long part, or a bad size |

### Found while implementing slice 8

All of it about the databases.

- **MySQL compares text without case.** The first test of two tags `Vip` and `vip` failed on MySQL only: its default collation made them equal in the unique index and in `findOne`. The tag now has a `tag_key`, folded the way a `ci` field is (DATA-21), and the index and the lookups use it on every dialect.
- **A hand written schema needs its properties spelled out.** Spreading helper objects into `EntitySchema` made MikroORM lose the entity type, so each of the four schemas lists its columns.
- **The nil tenant keeps the unique index honest.** `NULL` values are distinct in a unique index on PostgreSQL, MySQL and SQLite, so a global entity would have allowed the same tag twice with a null tenant.
- **A test of the drift between steps and schemas covers the four tables** with no further code: it looks for any statement about a table that starts with `bieberkit_`.

### Left out

- **Events for comments and tags** (for notifications) come with the notifications plugin of M1.8. The route can call `emitEvent`.
- **Editing a comment.** A comment is added or deleted. An edit with history is a product decision for the admin.
- **Deleting the rows of a deleted record.** A soft deleted record keeps its features. A hard delete is a job of the retention work (PDP).

## Slice 9: standalone validators and serializers

Designed on 2026-11-23. None of it is maintainer-designed (SCH-06, PERF-06 and ADR 0009 decide the model). Slices 7 and 8 were merged into `main` before it started.

### What is built

At build, `emitStandalone(defs)` writes two CommonJS modules and a manifest. The web role loads them instead of compiling the schemas at boot (ADR 0009 measured 654 to 668 ms to compile 600 validators, and 69 ms to load the standalone module).

- `validators.cjs`: one Ajv validator for each entity and each of `create` and `update`, keyed `<entity>:<mode>`. The `read` schema is not a validator, because the server writes what it reads.
- `serializers.cjs`: one `fast-json-stringify` function for each entity, `<entity>:read`, and one for a list of rows, `<entity>:list`. Its value is the whitelist of fields (API-01): a field that the read schema does not name never leaves the server. ADR 0009 found that it is not faster than `JSON.stringify`, and the wording of the spec follows that.
- `standalone.json`: the format version, the SHA-256 of all schemas, and the entity names.

### Public API (`@bieberkit/data/build`)

A new subpath, for build tools and the web role. It imports Ajv and `fast-json-stringify`, so the client never does, and `./schema` stays free of them (SCH-07).

```ts
emitStandalone(defs, options?: { runtime?: string }): StandaloneFiles          // pure: returns the text of the three files
writeStandalone(defs, directory, options?): Promise<StandaloneFiles>
loadStandalone(directory): Promise<StandaloneRuntime>
createStandaloneRuntime(parts: { validators; serializers; manifest }): StandaloneRuntime
createAjv(options?): Ajv                                                         // the options of SCH-06, also used by the contract tests

interface StandaloneRuntime {
  validate(entity: string, mode: 'create' | 'update', input: unknown): ValidationResult
  serialize(entity: string, row: unknown): string
  serializeMany(entity: string, rows: readonly unknown[]): string
  assertCurrent(defs): void
}
type ValidationResult = { ok: true; value: unknown } | { ok: false; issues: ValidationIssue[] }
interface ValidationIssue { path: string; keyword: string; message: string }   // path is dotted: 'balance.amount', or '' for the body
```

`@bieberkit/data/runtime` (a second new subpath) re-exports the few helpers that the generated code needs: `ucs2length` and `equal` of Ajv, the formats of `ajv-formats`, and the serializer helpers of `fast-json-stringify`.

### Rules

- **The generated code `require`s only `@bieberkit/data/runtime`.** Ajv and `fast-json-stringify` write `require("ajv/dist/runtime/ucs2length")` and similar. A project that depends on `@bieberkit/data` cannot resolve them under pnpm, because they are dependencies of ours. The emitter rewrites each known `require` to `require("@bieberkit/data/runtime").<name>`, and an unknown one stops the build with `DATA_STANDALONE_UNSUPPORTED`, so a new Ajv helper is noticed at build and not at the first request. `options.runtime` replaces the specifier, for tests that run from the sources.
- **The output is reproducible.** The same entities give the same bytes and the same hash. Entities are sorted by name, and nothing in the text depends on the time or the machine.
- **`validate` normalizes first.** It runs `normalizeInput` (NFC, SCH-05) and then the validator, and returns the normalized value, so a handler never sees decomposed text. The verdict of the standalone validator is the verdict of an Ajv that compiled the same schema, and a test compares them on the shared fixtures.
- **A stale build is refused.** `assertCurrent(defs)` compares the hash of the schemas of the entities that are loaded with the manifest, and a difference is `DATA_STANDALONE_STALE`. The web role calls it at boot, so old validators never run on new entities.
- **An unknown entity or mode is `DATA_STANDALONE_UNKNOWN`** (500: the route that asked is wrong).
- **Dependency (P9).** `fast-json-stringify` 7.3.6 (MIT, exact). ADR 0009 named 7.3.9, which was a day old and refused by `minimumReleaseAge`, so the newest version that is old enough is used. The upgrade is a roadmap item with the others.

### Errors of slice 9

| Code                          | Status | Fix                                                                                                     |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `DATA_STANDALONE_STALE`       | 500    | Run the build again: the entities changed since the modules were made                                   |
| `DATA_STANDALONE_UNKNOWN`     | 500    | The entity is not in the build, or the mode is not `create` or `update`                                 |
| `DATA_STANDALONE_UNSUPPORTED` | 500    | The generated code needs a helper that the runtime does not export. Add it to `@bieberkit/data/runtime` |

### Found while implementing slice 9

- **The output was not the same twice.** `fast-json-stringify` names what it merges and checks with a counter that lives as long as the process (`__fjs_merged_0`, `__fjs_root_2`), so a second emit in the same process gave other names. The emitter renumbers each name by its first place in the unit.
- **A row with an unexpected key inside a money value is refused.** The read schema of a nullable money is `anyOf` an object with `additionalProperties: false` and `null`, and the serializer throws `does not match schema definition` for such a row. A field at the top that the schema does not name is dropped, as API-01 wants. The rows come from `toApiRow`, so the throw is a bug of the caller and is fail closed.
- **The `require` of an ESM package works.** The generated `.cjs` files require `@bieberkit/data/runtime`, which is ESM, and Node 24.12 loads it with `require()`. A check with the built package (subpath exports, the generated file in a folder of the same package) printed a valid and an invalid verdict, and the file asks for nothing else.
- **A test cannot use the built package.** Tests run from the sources, so they name `src/runtime.ts` as the runtime. The check of the real specifier was made by hand after `pnpm build`.
- **The tests write under `packages/data/.tmp`**, like the migration tests: a file under `node_modules` would not be loaded as TypeScript.

### Left out

- **The command** `bieberkit build` that calls `writeStandalone` is the CLI of M1.8. This slice is the library.
- **Validators of custom route schemas.** They come from Zod through JSON Schema (SCH-01) and are the route layer's, in M1.3.
- **A benchmark** of the boot time. The k6 and boot measurements are M1.9.
