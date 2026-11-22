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
- Status: Draft. Slice 1 is the part marked **Foundation**. Everything marked **[D]** is a proposal for the maintainer to design (AGENTS.md, Workflow 6) and gets no code until you approve it.

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
function createDatabase(env: DatabaseEnv, options: { entities: readonly EntitySchema[] }): Promise<Database>
interface Database { readonly dialect: Dialect; readonly orm: MikroORM; fork(): EntityManager; close(): Promise<void> }
function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>     // fork per request or job, tied to requestContext
function applySqlitePragmas(connection: SqliteConnectionLike): void                              // WAL, synchronous NORMAL, busy_timeout

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

Reads `DB_CONNECTION`, `DATABASE_URL`, `DATABASE_READ_URLS` and `DB_POOL_MAX` through `CoreEnv`. `MIGRATE_DATABASE_URL` is read only by the migrate role (slice 5). The test harness reads `DATABASE_URL_POSTGRES`, `DATABASE_URL_MYSQL` and `BK_REQUIRE_DIALECTS`, which exist only in tests and in the `services` job of `ci.yml`.

## Tests

Tests sit next to the code and are named after the IDs above. Pure helpers need no database. The ORM tests use `describeDialects`, so every one runs on SQLite locally and on PostgreSQL and MySQL where the URLs exist. Negative controls: a non-UUID id on every dialect, two SQLite connections writing, a cursor with one changed byte, a money value above the safe range. Coverage gate: 90 percent of lines for `packages/data/src` (TST-01).

## Proposals for the maintainer-designed parts **[D]**

Everything below is a proposal. Slice 2 and 3 tests are written after you answer.

### Field DSL (slice 2)

Descriptors are immutable data (ADR 0009). Each builder returns a `Field`, and the chain methods below return a new one.

```ts
f.id()                                          // UUIDv7 primary key
f.string({ min?, max, compare?: 'exact' | 'ci' | 'ci_ai' })
f.email()                                       // string, max 254, compare 'ci'
f.oneOf(values)                                 // string union, stored as varchar, never a database enum
f.decimal({ precision, scale })                 // scaled bigint (DATA-22)
f.money({ currency })                           // <name>_minor bigint + <name>_currency (MOD-11)
f.sequence({ pattern, resetEvery? })            // document number, e.g. 'PO-{yyyy}-{seq:5}' (MOD-12)
f.createdAt()  f.updatedAt()                    // UTC
f.belongsTo(() => Entity)                       // many to one, composite FK when both are tenant scoped
f.hasOne(() => Entity)                          // one to one, the key is on the other side
f.hasMany(() => Entity).inline()                // collection, .inline() saves it with the parent (MOD-09)
f.state({ initial, transitions })               // state machine column (MOD-06, MOD-07)
f.custom({ column, jsonSchema, zod, tsType, admin })   // the only new kind in v1 (SCH-07)

// chain methods on any field
.optional()  .unique()  .index()  .default(value)  .searchable()  .localized()
.computed(fn, { stored?: boolean })             // MOD-08: on save and stored, or on read
```

Entity options besides the spec example: `tenant`, `softDelete`, `features: ['attachments', 'comments', 'timeline', 'tags']`, `actions`, `orm: { indexes, properties }`.

### Tenant model (slice 3)

- `tenant: true` adds `tenant_id`, `UNIQUE (tenant_id, id)`, and a MikroORM global filter that is on by default (DATA-09).
- The tenant comes from core's `requestContext().tenantId`, which the HTTP layer sets once per request (DATA-19). Data never reads headers or sessions.
- No tenant on a query of a tenant entity is `DATA_TENANT_REQUIRED` (400), never an unfiltered read.
- `asSystem(reason, fn)` disables the filter inside `fn`, writes an audit entry with the reason, and is the only way to do it. A blank reason is `DATA_SYSTEM_SCOPE_REASON`.
- Every write checks that each referenced id is visible under the filter (DATA-20). The CASL read rule joins that check when `@bieberkit/auth` provides it, through a small `ReferenceVisibility` port that data defines and auth implements.

## Open questions

Each has my recommendation. Answer or change them, and slices 2 and 3 start from that.

1. **Field kinds beyond the roadmap list.** The roadmap lists 14 kinds and ADR 0009 allows `f.custom` as the only extra. There is no integer, boolean, date or long text, which nearly every real entity needs. _Recommend_ adding `f.int({ min?, max? })`, `f.boolean()`, `f.date()`, `f.dateTime()` and `f.text({ max? })` to the core list, and keeping `f.custom` for the rare rest. The alternative is `f.custom` for each of them, which costs every entity a column, a JSON Schema and a Zod value.
2. **A page size above 100.** _Recommend_ clamping to 100 and returning the real size in `meta`, which keeps old clients working. Rejecting with 400 is stricter.
3. **State machine writes (MOD-07).** _Recommend_ that the state column is writable only by a generated `transition(record, name, input)` service call, validated against `from`, with the entity hook rejecting any other change of that column (`DATA_STATE_DIRECT_WRITE`). Creation sets `initial` and nothing else.
4. **Sequences (MOD-12).** _Recommend_ one counter table `bieberkit_sequences (tenant_id, name, period, value)` incremented inside the saving transaction with an atomic update and its row lock (`UPDATE ... RETURNING` on PostgreSQL and SQLite, `LAST_INSERT_ID(value + 1)` on MySQL). The lock serializes writers, so numbers are unique and gap-free, and a rolled back save releases its number. Throughput on one counter is limited by that lock, which suits document numbers.
5. **Localized fields (DATA-17).** _Recommend_ one translation table per entity, `<table>_i18n (tenant_id, record_id, locale, <localized fields>)` with a composite FK to the entity and a unique `(record_id, locale)`.
6. **Generic features (MOD-13).** Attachments, comments, timeline and tags in shared tables must point at any entity, so the record id cannot be a foreign key. _Recommend_ columns `tenant_id`, `entity`, `record_id` with an index and no foreign key, plus a service-level check that the record exists under the tenant filter on every write. The database then cannot reject a stray row, which is a loss against DATA-20, so the alternative is one feature table per entity, at the cost of many generated tables. Which one?
7. **Computed fields.** A `computed` function is code, so the descriptor holds a function, which cannot go to the client. _Recommend_ that the client and admin treat a computed field as read only data from the server, and that `stored: true` is the default only when the field is filtered or sorted by an API route.
8. **Rounding.** _Recommend_ round half away from zero, once on save (MOD-11), through `toMinor`. Banker's rounding is the alternative, and finance users sometimes expect it.
9. **The unsigned cursor.** _Recommend_ leaving it unsigned (decision above). A signed cursor adds a secret to rotate for no security gain, since a forged cursor only picks a position the user could already page to.
