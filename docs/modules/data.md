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
| 6. Outbox and domain      | Outbox, audit log, features, state machines, standalone Ajv and serializers                                                                            | After slice 5                 |

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

Proposed on 2026-11-22 after reading MikroORM 7.2.9 and the spike code of ADR 0009. The tests come first and wait for the maintainer's review, then the code.

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

- **Version (API-13).** A stale flush is `DATA_VERSION_STALE` (412). `expectVersion` compares an `If-Match` value before the write. A write bumps `version` by one.
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
