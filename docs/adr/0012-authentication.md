<!--
  BieberKit

  @file        docs/adr/0012-authentication.md
  @description Proposed way to run Better Auth on MikroORM so that it joins the request transaction, with the rules the spike found.
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

# 0012. Authentication: Better Auth on MikroORM's Kysely

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer reviewed the spike results and accepted this ADR on 2026-11-22.
- Requirements: AUTH-01, AUTH-02, AUTH-06, AUTH-08, AUTH-09, AUTH-10, DATA-18, DATA-24, SEC-11, P9, P12, spec sections 7.5 and 14.1

## Context

AUTH-09 says Better Auth connects through a BieberKit adapter on top of MikroORM that joins the request's transaction, so a signup writes its user, audit and outbox rows atomically. The roadmap asks for a spike that confirms this on all three dialects. AUTH-10 adds rules for client IP, rate-limit storage, snake_case names, UUID ids and a schema drift check.

Better Auth 1.7.27 ships a Kysely adapter, and MikroORM 7 runs on the same Kysely (0.29.9, one copy in the tree). `em.getKysely()` returns a Kysely bound to the current EntityManager, and MikroORM documents that it uses the current transaction when the EntityManager is inside one.

This ADR covers sessions and email and password. Passkeys, TOTP, OAuth, magic link and organizations are not part of the spike (see Not tested).

## Options

| Option                                                                                | For                                                                                                              | Against                                                                                                                           |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A. Better Auth's built-in Kysely adapter over `em.getKysely()`, through a small proxy | Almost no adapter code. Maintained by Better Auth. Joins the request transaction. Tables stay BieberKit entities | Depends on MikroORM's Kysely plugin (two quirks found, both with workarounds)                                                     |
| B. Our own adapter with `createAdapterFactory` on `EntityManager`                     | Full control                                                                                                     | We maintain every operation (create, find with joins, update, consume, increment). Not built, because A worked                    |
| C. Community `better-auth-mikro-orm` 0.5.0                                            | Ready made                                                                                                       | Declares MikroORM 6. On MikroORM 7 it failed twice with "Cannot find metadata for User". Could not be shown to join a transaction |

## Decision

Option A, with Better Auth pinned exactly (1.7.27 was tested, the minimum is 1.7.16, AUTH-08). Option B stays the fallback if a Better Auth upgrade breaks A.

1. **Connection.** `betterAuth({ database: kyselyAdapter(db, { type, transaction: false }) })`, where `db` is a proxy that returns `em.getKysely({ tableNamingStrategy: 'entity', columnNamingStrategy: 'property', convertValues: true, processOnCreateHooks: true, processOnUpdateHooks: true })` of the current request. The current EntityManager comes from `AsyncLocalStorage`, and outside a request it is a fork of the root one. Better Auth then writes `user` and `emailVerified`, and MikroORM maps them to `auth_users` and `email_verified` and converts UUIDs.
2. **Nested transactions join.** Some adapter operations call `db.transaction()`, which Kysely refuses on a transaction. The proxy returns, inside a transaction, an object whose `execute(cb)` calls `cb` with the current Kysely, so a nested transaction joins the outer one. Outside a transaction it returns the real `transaction()`.
3. **Tables.** `user`, `session`, `account`, `verification` and `rateLimit` are BieberKit entities, with UUIDv7 ids from `advanced.database.generateId` (this must stay set) and snake_case columns. Their migrations are versioned steps of `@bieberkit/auth` (ADR 0011).
4. **Column names.** Never name a column `<entity>_id` on the table of that entity. MikroORM reads such a column as the primary key. Better Auth's `account.accountId` is stored as `external_account_ref`, and the options map it: `account: { fields: { accountId: 'externalId' } }`.
5. **UUID type.** It must throw on a string that is not a UUID. Without that, MySQL stored `X''` for a non-UUID id and then failed on a duplicate key. The type must also accept a value that is already a `Buffer`, because the Kysely plugin can convert twice.
6. **Cookie (AUTH-01).** `advanced.cookies.session_token = { name: '__Host-bk_session', attributes: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } }`. Do not set `useSecureCookies`: it prepends `__Secure-` and gives `__Secure-__Host-bk_session`, which is not a `__Host-` cookie.
7. **Client IP (AUTH-10).** The HTTP pipeline resolves the IP through `TRUST_PROXY`, removes any incoming `x-bk-client-ip` and sets its own. Better Auth reads `advanced.ipAddress.ipAddressHeaders: ['x-bk-client-ip']`.
8. **Rate limit (AUTH-06, AUTH-10).** Counters live in `auth_rate_limits` (`rateLimit.storage: 'database'`) when Valkey is not configured. With Valkey they go to Better Auth's secondary storage, which was not tested.
9. **Drift check (AUTH-10).** A CI job runs `getAuthTables(options)` against the entities' metadata (property exists, nullability, unique) on every Better Auth upgrade and every options change.
10. **Telemetry** stays off (it is off by default and must not be enabled).

## Evidence

Spike on 2026-11-22, Node.js 26.13.1, Better Auth 1.7.27, MikroORM 7.2.11, PostgreSQL 15.20, MySQL 8.4.13 and SQLite 3.54.1. Sources are in `bieberkit-spikes/auth-spike`.

**Flows, all three dialects, option A.** Seven checks passed on each:

1. sign up (user, account and session rows, scrypt password hash);
2. sign in, session cookie `__Host-bk_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and no `Domain`, and `get-session` returning the user;
3. signup inside `em.transactional`, with an audit row and an outbox row, committed: all three rows present;
4. the same with a forced failure after signup: users, accounts, sessions, audit and outbox all unchanged;
5. email verification inside a transaction (consumes its token);
6. password reset inside a transaction, then sign in with the new password;
7. sign out removes the session.

**Extra checks, all three dialects:**

- Drift check: no difference on the real entities. After removing `session.token` and `account.password` and making `user.name` nullable it reported all three. After adding the `twoFactor` plugin it reported the missing `user.twoFactorEnabled` and the missing `twoFactor` entity.
- A request with `X-Forwarded-For: 6.6.6.6` and the trusted header `203.0.113.9` stored `203.0.113.9`.
- Five wrong sign-ins from one IP with a limit of 3 per 30 s gave 401, 401, 401, 429, 429, with the counter row in `auth_rate_limits`.

**What went wrong first, and the rule it produced:**

| Symptom                                                                    | Cause                                                           | Rule              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| Sign in said "User not found" although the user and account existed        | MikroORM returned the `account_id` column under the name `id`   | Decision 4        |
| Cookie was `__Secure-__Host-bk_session`                                    | `useSecureCookies: true`                                        | Decision 6        |
| MySQL: "calling the transaction method for a Transaction is not supported" | Adapter calls `db.transaction()` inside the request transaction | Decision 2        |
| SQLite: `s.replaceAll is not a function`                                   | UUID type got a `Buffer`                                        | Decision 5        |
| MySQL: duplicate entry `\x00`, PostgreSQL: invalid uuid                    | Config override dropped `generateId`, so ids were not UUIDs     | Decisions 3 and 5 |

**Option C:** `better-auth-mikro-orm` 0.5.0 installs only with `--legacy-peer-deps` (peer `@mikro-orm/core ^6`). With MikroORM 7.2.11 sign up and sign in returned 500 on both tries, with entity names `user` and `User`.

**Dependencies (P9):** `better-auth` 1.7.27 (MIT, modified 2026-11-20): 21 packages, all MIT, no install script. `@better-auth/kysely-adapter` is part of it. Telemetry is off unless `telemetry.enabled` or `BETTER_AUTH_TELEMETRY` is set. Maintainers are to be confirmed before acceptance.

**Not tested:** passkeys, TOTP, OAuth and OIDC, magic link, the organization plugin and the per-request active organization from the tenant (AUTH-10), session storage in Valkey (AUTH-02), Valkey as rate-limit store, `requireMfa` (AUTH-05), API keys (AUTH-07), the CSRF interaction, MariaDB, and option B. The proxy was used with one process and one EntityManager per request. Sessions are read on every request, so their cost with the request transaction and the cache is not measured.

## Consequences

- Easier: one transaction for signup, audit and outbox, with almost no adapter code. Auth tables follow the same naming, UUID and migration rules as every other table.
- Harder: we depend on two third-party behaviors, Better Auth's Kysely adapter and MikroORM's Kysely plugin. The drift check and the flow tests above must run in CI on every upgrade of either.
- Constraint: Better Auth's field and model names must match entity names and properties, with the mapping in decision 4.
- Ruled out: the community adapter, `useSecureCookies`, `X-Forwarded-For` as the IP source, and in-memory rate-limit counters.

## Spec changes

Made in spec 0.8.4, in the same pull request as these ADRs:

- AUTH-09: name the mechanism (Kysely adapter over `em.getKysely()` with a request-scoped proxy, nested transactions join) and say the spike passed on three dialects.
- AUTH-10: the `x-bk-client-ip` header, the column-name rule, the `generateId` and UUID type rule, and the drift check's exact comparison (property, nullability, unique).
- AUTH-01: cookie name and attributes, and no `useSecureCookies`.
- New AUTH-11: Better Auth is pinned exactly and telemetry stays off.

## Follow-ups

- Spike the organization plugin with the per-request tenant, and Valkey session and rate-limit storage, before M1.4.
- Compare against option B if a Better Auth upgrade breaks the proxy.
- The adapter is in the `@bieberkit/auth` package: a roadmap item for the proxy, the entities, the drift job and the flow tests once the spec has the IDs.
