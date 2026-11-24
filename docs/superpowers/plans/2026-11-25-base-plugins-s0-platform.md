<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-25-base-plugins-s0-platform.md
  @description Implementation plan for slice S0 of the complete base plugins: disabled users, the profile columns, mail, queue and cache services, and outbox subscriptions.
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

# Base plugins, slice S0 (platform) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the six base plugins the platform they need: a user that can be disabled, the identity columns for later SSO and SCIM plugins, `mail`, `queue` and `cache` in the service registry of every role, and a way for a module to turn an outbox event into a job.

**Architecture:** Everything lands in `@bieberkit/auth` (a `user-service` next to `role-service`, a migration step, a Better Auth hook and an authenticator check), the three contract packages (a service type each), `@bieberkit/queue` (one new contribution key) and the wiring of `@bieberkit/server` and `@bieberkit/testing`. No plugin changes in this slice.

**Tech Stack:** TypeScript (erasable syntax), MikroORM 7 `EntitySchema`, Kysely migration steps, Better Auth 1.7.25 (`additionalFields`, `databaseHooks`), Vitest with `describeDialects`, pnpm.

**Spec:** `docs/modules/base-plugins-complete.md` (sections "Platform changes (slice S0)" and "Decisions of the maintainer").

## Global Constraints

- Maintainer-designed area (authentication). **Plan mode, tests shown first, never merged by an agent.** Each task stops at its `GATE` step, which shows the failing tests to the maintainer. Do not implement past a gate without their go-ahead.
- Work in the current checkout, on branch `feat/base-plugins-platform`. No git worktree (AGENTS.md, Workflow 8).
- Erasable syntax only: no `enum`, decorators, `namespace` or constructor parameter properties. Relative imports keep `.ts`. `import type` for types. Exported functions and constants declare their types (`isolatedDeclarations`). No `any`. ESM, no default exports in package source.
- Every new file starts with the project header (`bieberkit-file-headers`), with `@file` the repo-relative path and the year 2026.
- Throw `BkError` subclasses with a stable code (MOD-17); `authError(code, status, message, fix)` in `packages/auth/src/errors.ts` is the factory.
- Only services open transactions (MOD-16). Nothing external inside a transaction (no mail, queue push, cache write, HTTP).
- `process.env` is read only in `packages/core/src/config/` (P8).
- A step of `@bieberkit/auth` only adds (`kind: 'expand'`) and is one statement (`authStep` in `packages/auth/src/plugin.ts`), so a failed run on MySQL can be repeated (DATA-08, DATA-24).
- No new runtime dependency (P9). If one seems needed, stop and write an ADR line.
- Commits: Conventional Commits, `git commit -s`, no `Co-Authored-By` and no "Generated with" line.
- Tests are named after the requirement they prove, for example `it('BPL-01 ...')`, and run on three dialects through `describeDialects` where the database matters. Full local run: `sh tools/test-services.sh start`, then `BK_REQUIRE_DIALECTS=all pnpm test <path>`.
- Do not touch `.github/workflows/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/` or `pnpm-workspace.yaml`.

## Review Focus

1. A session that is still held in the Valkey secondary storage after its user is disabled must be refused (the database row is gone, but Better Auth reads the secondary storage first). Test in Task 2.
2. An API key of a disabled user must be refused, not only a cookie. Test in Task 2.
3. A user who passed the password step and is disabled before the TOTP step must get no session. Test in Task 2.
4. A reset request for an address with no account sends no mail and answers like one with an account (no enumeration, AUTH-06). Test in Task 3.
5. The web role boots, serves and stops cleanly with a queue that it does not run a worker for, on the `database` driver. Test in Task 3.

## Deviations from the design document

Found while reading the code, and applied to `docs/modules/base-plugins-complete.md` in Task 6:

- **BPL-03 needs no new code.** `definePlugin({ services })` and `registerModule` already register a named service, and a name used twice already fails with `CORE_SERVICE_DUPLICATE`. Task 5 only proves it and documents the declaration-merging pattern.
- **BPL-04 is split.** This slice gives the mechanism (a module key `subscriptions` that maps an outbox event to a job, Task 4). The job that deletes a media object belongs to the `media` slice (S4, MED-03). Nobody calls `queue.subscribe` today, so the mechanism is real work.
- **BPL-05 and BPL-06 are acceptance rules of each slice**, not code. Each of S1 to S5 tests them for its own routes. S0 adds no code for them.
- **Auth mail is not wired in a real boot.** `registerRuntimeServices` calls `createAuth` without `mail`, so reset and verification mails cannot be sent at all. Task 3 fixes it, because USR-04, USR-09 and USR-10 depend on it.

## File Structure

| File                                                               | Responsibility                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `packages/auth/src/tables.ts`                                      | `AuthUser` gains five properties; steps at version 0.5.0                        |
| `packages/auth/src/better-auth.ts`                                 | `user.additionalFields`, the session-create hook                                |
| `packages/auth/src/user-service.ts` (new)                          | `disableUser`, `enableUser` (S1 adds the rest)                                  |
| `packages/auth/src/authenticator.ts`                               | refuses a disabled user, for a cookie and for a key                             |
| `packages/mail`, `packages/queue`, `packages/cache` `src/index.ts` | `ServiceRegistry` declaration for `mail`, `queue`, `cache`                      |
| `packages/queue/src/subscriptions.ts` (new)                        | `QueueSubscription`, `applySubscriptions`                                       |
| `packages/server/src/services.ts`, `boot.ts`                       | register the three services for every role, wire auth mail, apply subscriptions |
| `packages/server/src/auth-mail.ts` (new)                           | the plain-text messages of reset and verification (templates are M2.4)          |
| `packages/testing/src/app.ts`                                      | the same services in memory, `mailbox`, `runOutbox()`                           |

---

### Task 1: Profile columns on `bk_auth_users` (BPL-01 schema, IDN-01)

**Files:**

- Modify: `packages/auth/src/tables.ts` (`AuthUserRow`, `AuthUser`, `authTableSteps`)
- Modify: `packages/auth/src/better-auth.ts` (`config.user`)
- Create: `packages/auth/src/profile.dialects.test.ts`
- Modify: `packages/auth/src/tables.dialects.test.ts`, `packages/auth/src/drift.test.ts`

**Interfaces:**

- Produces: `AuthUserRow` with `disabledAt?: Date | null`, `disabledReason?: string | null`, `disabledBy?: string | null`, `source: string`, `externalId?: string | null`. Columns `disabled_at`, `disabled_reason` (varchar 500), `disabled_by` (uuid), `source` (varchar 60, not null, default `'local'`), `external_id` (varchar 255), and the unique index `bk_auth_users_source_external_unique` on `(source, external_id)`. Better Auth returns the five fields on `session.user` and on the user of its adapter.

- [x] **Step 1: Write the failing tests** in `profile.dialects.test.ts` through `describeDialects`:
  - `it('BPL-01 the steps at 0.5.0 add the columns, and the ledger lists them')`: after `open([])`, `select disabled_at, disabled_reason, disabled_by, source, external_id from bk_auth_users where 1 = 0` returns `[]`, and `bk_plugin_migrations` has the six step ids of version `0.5.0`.
  - `it('IDN-01 a new user has source "local" and no external id')`.
  - `it('IDN-01 two users cannot share a source and an external id, and any number have none')`: two rows with `source: 'scim:okta'` and the same `externalId` fail with a unique violation; three rows with `externalId: null` succeed.
  - `it('BPL-01 Better Auth gives disabledAt and source on the session user')`: sign up with `auth.api.signUpEmail`, set `disabled_at` by SQL, `auth.api.getSession` with the cookie returns `user.disabledAt` as a `Date` and `user.source === 'local'`.
    In `drift.test.ts` add `it('AUTH-10 the drift check passes with the profile fields')` (the existing test with the new options must stay green; add the assertion that `checkAuthDrift` returns `[]`).

- [x] **Step 2: Run to verify it fails**

Run: `BK_REQUIRE_DIALECTS=all pnpm test packages/auth/src/profile.dialects.test.ts packages/auth/src/drift.test.ts`
Expected: FAIL (no such column `disabled_at`).

**Execution record (2026-11-25):** On `feat/base-plugins-platform`, the profile, table and drift tests ran with `BK_REQUIRE_DIALECTS=all` on PostgreSQL, MySQL and SQLite: **22 expected failures, 47 passes, no skips**. Failures name missing `disabled_at`/`source` columns, the absent 0.5.0 steps and missing Better Auth profile declarations. The tests also reject a nullable source and prove the drift checker must detect a missing `disabledAt` or nullable `source`. `pnpm check`, `pnpm typecheck`, `pnpm lint` and `git diff --check` passed. Gate 1 was approved by the maintainer ("ok"). The spike and schema implementation ran together because Better Auth needs the physical columns to round-trip them. After correcting the raw-SQL fixtures to select by email (UUIDs are binary on MySQL and SQLite), all 69 profile/table/drift tests and all 788 auth tests passed on the three dialects, with no skips. No side-table fallback is needed. The API report and auth changeset were brought forward from Task 6 to accompany the public row-type change. `pnpm changeset --empty` reported "No versionable packages found" because workspace packages are private; the changeset uses the existing repository format without changing package visibility.

- [x] **Step 3: GATE.** Show the maintainer the tests of this task and wait.

- [x] **Step 4: Spike the decision of the design (decision 1).** Add `user.additionalFields` to `createAuth` for the five fields (`input: false`; `source` is `required: true` with `defaultValue: 'local'` so the drift check sees a non-null column; the other four `required: false`). Run the tests on the three dialects. **If Better Auth cannot return the fields, or the drift check cannot be satisfied, stop**: the fallback is a side table `bk_auth_user_status`, and the design document is updated first.

- [x] **Step 5: Implement.** In `tables.ts` add the five properties to `AuthUserRow` and `AuthUser` (`fieldName` as above, `source` has `onCreate: () => 'local'`), a constant `PROFILE = '0.5.0'` and six `authStep(PROFILE, id, up)` steps, ids `users-disabled-at`, `users-disabled-reason`, `users-disabled-by`, `users-source`, `users-external-id`, `users-source-external-index`. Each is one `alterTable(...).addColumn(...)` (the last a unique `createIndex`). The `source` column is added `notNull` with `defaultTo('local')`, which is allowed on the three dialects. Append them to `authTableSteps`.

- [x] **Step 6: Run to verify it passes**

Run: `BK_REQUIRE_DIALECTS=all pnpm test packages/auth`
Expected: PASS on postgres, mysql and sqlite.

**Verification before the Task 1 commit:** `pnpm check`, `pnpm typecheck` and `pnpm lint` passed. The default suite (`pnpm test --maxWorkers=2 --testTimeout=15000`) passed: 3190 tests, 307 skipped. The optional whole-repository service run reported 4557 passes, 60 skips and four 5000 ms timeouts in limits, secondary storage and backup retention; the three affected files passed in isolated reruns with one worker and a 15000 ms timeout (83 + 15 tests). Assertions and repository timeout settings were unchanged. These runs collected the Task 1 tree before Task 2 was added. The full auth run on all three dialects remains 788 passing tests, no skips.

- [x] **Step 7: Commit**

```bash
git add packages/auth
git commit -s -m "feat(auth): add the disabled and identity columns to the users table"
```

---

### Task 2: Disabled users are refused everywhere (BPL-01)

**Files:**

- Create: `packages/auth/src/user-service.ts`, `packages/auth/src/user-service.dialects.test.ts`
- Modify: `packages/auth/src/better-auth.ts` (the session-create hook), `packages/auth/src/authenticator.ts`, `packages/auth/src/api-keys.ts` (`principalOfKey`), `packages/auth/src/index.ts` (exports), `packages/auth/src/errors.ts` only if a new class is needed (it is not: use `authError`)

**Interfaces:**

- Consumes: `AuthUser` with the Task 1 properties.
- Produces:
  - `export interface DisableUserInput { readonly userId: string; readonly reason: string; readonly actorId: string | null }`
  - `export function disableUser(db: Database, input: DisableUserInput): Promise<boolean>` returns `true` when the user changed state, `false` when already disabled. In one `runInTransaction`: set `disabledAt`, `disabledReason`, `disabledBy`; delete the user's rows in `AuthSession`; `recordAudit(em, { action: 'users.user.disabled', entity: 'authUser', recordId: userId, data: { reason } })`. An unknown user throws `authError('USERS_NOT_FOUND', 404, ...)`.
  - `export function enableUser(db: Database, input: { readonly userId: string; readonly actorId: string | null }): Promise<boolean>` clears the three fields, audits `users.user.enabled`.
  - A user of `disabledAt !== null` is refused with `authError('AUTH_USER_DISABLED', 403, 'The account is disabled.', 'Ask an administrator to enable it.')` on every path below.

- [x] **Step 1: Write the failing tests** in `user-service.dialects.test.ts`:
  - `it('BPL-01 disabling revokes every session in the same transaction')`: two sessions, then `disableUser`, both rows gone, one audit entry `users.user.disabled` with the reason.
  - `it('BPL-01 a disabled user cannot sign in with email and password')`: `signInEmail` answers 403 with `code: 'AUTH_USER_DISABLED'` and sets no cookie.
  - `it('BPL-01 a disabled user cannot sign in with a magic link')` (the `methods.magicLink` fixture of `methods.dialects.test.ts`).
  - `it('BPL-01 a user disabled between the password and the TOTP code gets no session')` (the fixture of `mfa.dialects.test.ts`).
  - `it('BPL-01 a session that the secondary storage still holds is refused after disable')` (the fixture of `secondary-storage.dialects.test.ts`; delete nothing from the fake Valkey).
  - `it('BPL-01 an API key of a disabled user is refused')` (the fixture of `api-keys.dialects.test.ts`).
  - `it('BPL-01 a request with the cookie of a disabled user answers 403 AUTH_USER_DISABLED')` through the real server of `packages/auth/src/testing/auth-server.ts`.
  - `it('BPL-01 enableUser lets the user sign in again and audits it')`.
  - `it('BPL-01 disabling twice changes nothing and audits once')`, and `it('BPL-01 an unknown user is USERS_NOT_FOUND')`.

- [x] **Step 2: Run to verify it fails**

Run: `BK_REQUIRE_DIALECTS=all pnpm test packages/auth/src/user-service.dialects.test.ts`
Expected: FAIL (`disableUser` is not exported).

**Execution record (2026-11-25):** The 13 test cases ran on PostgreSQL, MySQL and SQLite: **39 expected failures, no skips**. Service cases fail because `disableUser`/`enableUser` are not exported. Authentication cases seed disabled status directly so they reach the real HTTP path even before those services exist: password, magic link, passkey, TOTP, cookie and API key still succeed instead of returning 403 `AUTH_USER_DISABLED`. Extra cases prove audit-failure rollback, passkey refusal and no-op enabling. The secondary-store test retains the original enabled-user snapshot after session revocation; satisfying it requires reading current status rather than trusting the cached user. The namespace-export guards keep the RED phase typecheckable and will be replaced by direct imports when the public services exist. The maintainer approved Gate 2 ("Duyệt test Task 2, tiếp tục triển khai"); implementation is complete. The 39 cases are now green, and `BK_REQUIRE_DIALECTS=all pnpm test packages/auth packages/http --maxWorkers=2 --testTimeout=15000` passed **1239 tests across 48 files, no skips**. `pnpm check`, `pnpm typecheck` and `pnpm lint` passed. HTTP already maps the domain error to 403; no HTTP source change is needed. `user-status.ts` shares the status predicate and fresh owner read between cookie and API-key authentication; trusting the cached `session.user` would fail the retained-snapshot test. Better Auth 1.7.25 exposes `$context.internalAdapter.findUserById`, so no new authenticator option is needed. Services use conditional updates to preserve no-op behavior and keep the audit with explicit actor, status change and session deletion in one transaction. Direct public imports replaced the temporary RED guards. The auth build, generated API report and changeset were updated.

- [x] **Step 3: GATE.** Show the maintainer the tests and wait.

- [x] **Step 4: Implement `disableUser` and `enableUser`** in `user-service.ts` with `runInTransaction` and `recordAudit` from `@bieberkit/data/orm`, and export both with their types from `index.ts`.

- [x] **Step 5: Implement the three refusals.**
  - One choke point for sign in: `databaseHooks.session.create.before` in `createAuth` throws the Better Auth API error carrying `code: 'AUTH_USER_DISABLED'` and status 403 when the user is disabled. Every method (password, magic link, passkey, second factor) creates its session there.
  - `createAuthenticator`: after `getSession`, a user with `disabledAt` set throws `authError('AUTH_USER_DISABLED', ...)`. This covers a session that came from the secondary storage.
  - `principalOfKey`: after a valid key, read the owner through `auth.$context` (`internalAdapter.findUserById`) and refuse a disabled one. If `$context` is not available in Better Auth 1.7.25, give `createAuthenticator` a required `db` option and update its callers (`boot.ts`, `testing/auth-server.ts` and the tests of this package); the test decides.

- [x] **Step 6: Run to verify it passes, and that the HTTP pipeline maps the thrown error.**

Run: `BK_REQUIRE_DIALECTS=all pnpm test packages/auth packages/http`
Expected: PASS. If a thrown `AuthError` from `authenticate` becomes a 500, fix the mapping in `@bieberkit/http` (an `AuthError` is a `BkError` and carries its status) and add `it('BPL-01 the pipeline answers with the status of a BkError thrown by the authenticator')` there.

- [x] **Step 7: Commit**

```bash
git add packages/auth packages/http
git commit -s -m "feat(auth): refuse a disabled user on sign in, on a session and on an API key"
```

---

### Task 3: `mail`, `queue` and `cache` in every role (BPL-02)

**Files:**

- Modify: `packages/mail/src/index.ts`, `packages/queue/src/index.ts`, `packages/cache/src/index.ts` (declaration merging, as `packages/storage/src/index.ts` does for `storage`)
- Modify: `packages/server/src/services.ts`, `packages/server/src/boot.ts`
- Create: `packages/server/src/auth-mail.ts`
- Modify: `packages/testing/src/app.ts`
- Test: `packages/server/src/boot.test.ts`, `packages/testing/src/app.test.ts`, `packages/server/src/auth-mail.test.ts`

**Interfaces:**

- Produces:
  - `ServiceRegistry.mail: Mail` (the `over(queue)` of the mailer), `ServiceRegistry.queue: Queue`, `ServiceRegistry.cache: Cache`.
  - `registerRuntimeServices(container, input)` where `input` gains `queue: Queue`, `mail: Mail` and `cache: Cache`.
  - `authMessages(from: Mail): { sendResetPassword(mail: AuthMail): Promise<void>; sendVerification(mail: AuthMail): Promise<void> }` in `auth-mail.ts`: a subject and a plain-text body with the link, English only (M-02 templates are M2.4).
  - `TestApp.mailbox: readonly PreparedMessage[]` (read from `createMemoryTransport()`), and `TestApp.runOutbox(): Promise<number>` (one `dispatchOnce()` of `createOutboxDispatcher(db, { publisher: queue.publisher })`, the count of rows taken).

- [x] **Step 1: Write the failing tests:**
  - `boot.test.ts`: `it('BPL-02 the web role has the services mail, queue and cache')` and `it('BPL-02 the web role starts, serves and stops with the database queue and runs no worker')` (assert the shutdown closes the queue).
  - `app.test.ts`: `it('BPL-02 createTestApp registers mail, queue and cache in memory')`; `it('BPL-02 a password reset request sends one message with the link')` (sign up, `auth.api.requestPasswordReset`, `app.mailbox` has one message to that address whose text holds the link); `it('AUTH-06 a reset request for an unknown address sends no mail and answers the same')`.
  - `auth-mail.test.ts`: `it('BPL-02 the reset message names the link and has no line break in its subject')` (M-03).

- [x] **Step 2: Run to verify it fails**

Run: `pnpm test packages/server/src/boot.test.ts packages/testing/src/app.test.ts`
Expected: FAIL (`services.mail` is not registered).

**Execution record (2026-11-25):** The boot, auth-mail and test-app files ran with all three dialects: **16 expected failures, 43 passes, no skips**. The real web fixture reaches its route and fails on the missing runtime services. The test app reports unregistered `mail`, no `runOutbox`, and password reset disabled because the mail callbacks are unwired. The two auth-mail cases fail because `auth-mail.ts` does not exist yet. The database-queue case dispatches a real job, requires it to remain waiting through shutdown, and observes the real queue's `close()` through a wrapper; it does not replace the driver. Extra cases cover verification mail and consuming committed outbox rows once. Mail subjects reject line breaks; unknown-address reset must return the same answer with no additional mail. Fixture type errors and a missing route response schema were corrected before the final RED run. `pnpm check`, `pnpm typecheck`, `pnpm lint` and `git diff --check` passed. The maintainer approved Gate 3 ("Duyệt test Task 3, tiếp tục triển khai"). ADR 0028 records the two internal dependencies (`@bieberkit/mail`, `@bieberkit/cache`) of `@bieberkit/testing`; its status remains Proposed. The manifest and lockfile were updated by an offline pnpm install; no third-party library was added. The temporary RED lookups/guards were replaced by direct imports/properties.

- [x] **Step 3: GATE.** Show the maintainer the tests and wait.

- [x] **Step 4: Implement.**
  - Declaration merging in the three `index.ts` files, each with a one-line doc comment.
  - `boot.ts`: build the queue for **every** role (`createQueueFromConfig`, with `jobs` the contributed jobs plus `mailer.job`), build the mailer with `createMailerFromConfig(env, { logger, errorReporter })` and the cache with `createCacheFromConfig(env, { logger, tracer, metrics })`, pass `queue`, `mail: mailer.over(queue)` and `cache` to `registerRuntimeServices`, and add shutdown hooks that close what each contract can close (`queue.close()`, `mailer.close()`, `cache.close()`). The worker and the dispatcher still start only in the worker role.
  - `services.ts`: register the three services, and give `createAuth` `mail: authMessages(mail)`, declaring `deps: ['mail']` on the `auth` registration so the container orders them.
  - `app.ts`: register `mail` (`createMailer({ transport: memory }).over(queue)`), `queue` (the sync queue it already makes, with `mailer.job` among its jobs) and `cache` (`createCache({ engine: createMemoryEngine() })`), build `mailbox` and `runOutbox`.

- [x] **Step 5: Run to verify it passes**

Run: `BK_REQUIRE_DIALECTS=all pnpm test packages/server packages/testing packages/mail packages/queue packages/cache`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages
git commit -s -m "feat(server,testing): register mail, queue and cache for every role and send the mail of Better Auth"
```

---

**Task 3 GREEN record:** All 67 focused tests passed, including the added seeder case. The complete five-package command passed **707 tests, 27 skipped, across 37 files** on the configured services and three dialects. `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:api` and `git diff --check` passed. API reports and a changeset accompany the change.

**Ruling:** `seed()` is a second caller of `registerRuntimeServices` omitted by the plan's file list, and BPL-02 explicitly includes seed services. Add a RED→GREEN seeder test and share `createRuntimePlatform` in `services.ts` between boot and seed, with one resource owner. This adds two seed files to the task but avoids a caller with missing services. Web/worker/scheduler separation is unchanged. The web fixture now runs migration before boot, as deployment does; its first implementation run exposed `no such table: bk_jobs`. The reset-link assertion follows Better Auth's token-in-path URL rather than incorrectly requiring a `token` query parameter. Test-app mail callbacks capture the links through the memory mailer; server message wording is tested by `auth-mail.test.ts`, avoiding a testing-to-server layer dependency.

### Task 4: Outbox event to job, by contribution (BPL-04 mechanism)

**Files:**

- Create: `packages/queue/src/subscriptions.ts`, `packages/queue/src/subscriptions.test.ts`
- Modify: `packages/queue/src/index.ts` (the `subscriptions` key, exports), `packages/server/src/boot.ts`, `packages/testing/src/app.ts`
- Test: `packages/server/src/boot.test.ts`, `packages/testing/src/app.test.ts`

**Interfaces:**

- Consumes: `Queue.subscribe(event, job, map?)`, `OutboxMessage` (`@bieberkit/data/orm`), `contributed<T>(modules, key)` (`packages/server/src/modules.ts`), `TestApp.runOutbox()` (Task 3).
- Produces:
  - `export interface QueueSubscription<Input = unknown> { readonly event: string; readonly job: JobDef<Input>; readonly map?: (message: OutboxMessage) => Input }`
  - `export function applySubscriptions(queue: Queue, subscriptions: readonly QueueSubscription[]): void`
  - `ModuleContributions.subscriptions?: readonly QueueSubscription[]` (declaration merging in `packages/queue/src/index.ts`).

- [ ] **Step 1: Write the failing tests:**
  - `subscriptions.test.ts`: `it('BPL-04 applySubscriptions subscribes each event to its job')` and `it('BPL-04 a second subscription of one event to the same job is refused')` (the rule of `Queue.subscribe`; assert whatever error it throws, by its code).
  - `app.test.ts`: `it('BPL-04 an event written in a transaction runs its job after the commit, once')`: a fixture module with a job that records its input and a `subscriptions` entry; a route that calls `emitEvent(em, { name: 'fixture.thing.done', payload })` inside `runInTransaction`; after the request the job has not run; after `await app.runOutbox()` it has run once; a second `runOutbox()` runs nothing.
  - `app.test.ts`: `it('BPL-04 a failed transaction leaves no event, so the job never runs')`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test packages/queue/src/subscriptions.test.ts packages/testing/src/app.test.ts`
Expected: FAIL (no `subscriptions` export).

- [ ] **Step 3: GATE.** Show the maintainer the tests and wait.

- [ ] **Step 4: Implement** `applySubscriptions` as a loop over `queue.subscribe`, add the contribution key, and call it in `boot.ts` (`contributed<QueueSubscription>(modules, 'subscriptions')`, right after the queue is made) and in `createTestApp`.

- [ ] **Step 5: Run to verify it passes**

Run: `BK_REQUIRE_DIALECTS=all pnpm test packages/queue packages/server packages/testing`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages
git commit -s -m "feat(queue): let a module map an outbox event to a job"
```

---

### Task 5: A plugin contributes a service that another reads (BPL-03)

**Files:**

- Test: `packages/testing/src/app.test.ts`

**Interfaces:**

- Consumes: `definePlugin({ services })`, `registerModule`, `createTestApp({ modules })`.

- [ ] **Step 1: Write the test** `it('BPL-03 a plugin contributes a named service that another plugin reads from the registry')`: a fixture plugin declares `declare module '@bieberkit/core' { interface ServiceRegistry { fixtureGreeter: { hello(): string } } }` and registers `fixtureGreeter`; a second fixture plugin has a route that returns `ctx.services.fixtureGreeter.hello()`; the route answers it. And `it('BPL-03 a service name taken by two plugins fails at boot with CORE_SERVICE_DUPLICATE')`.

- [ ] **Step 2: Run it.**

Run: `pnpm test packages/testing/src/app.test.ts`
Expected: PASS with no change to the source. If it fails, stop: the design assumed the mechanism exists, and the cause goes to the maintainer.

- [ ] **Step 3: Commit**

```bash
git add packages/testing
git commit -s -m "test(testing): prove that a plugin contributes a named service"
```

---

### Task 6: Spec, roadmap, docs and changeset

**Files:**

- Modify: `docs/spec/SPEC.md` (add BPL-01 to BPL-06 and IDN-01 to IDN-03 as in the design document, bump the version history), `docs/ROADMAP.md` (milestone M1.11 with S0 to S6 as items, S0 ticked only for what landed), `docs/modules/base-plugins-complete.md` (the three deviations above, BPL-04 split), `docs/modules/auth.md`, `docs/modules/plugins.md` (the services table gains `mail`, `queue`, `cache`), `docs/modules/queue.md` (`subscriptions`)
- Create: changesets by `pnpm changeset` for `@bieberkit/auth`, `@bieberkit/queue`, `@bieberkit/mail`, `@bieberkit/cache`, `@bieberkit/server`, `@bieberkit/testing`

- [ ] **Step 1: Edit the documents.** The spec gains only the requirements of S0 now (the other slices add theirs). The roadmap item for each S0 requirement is ticked with its evidence (a test name), and the milestone stays open.
- [ ] **Step 2: Add the changesets** (`pnpm changeset`, minor, one line each) and run `pnpm api:update` for the packages whose public API changed, then `pnpm check:api`.
- [ ] **Step 3: Commit**

```bash
git add docs .changeset packages/*/api
git commit -s -m "docs: add the platform requirements of the base plugins to the spec and the roadmap"
```

---

### Task 7: Verify and hand over

- [ ] **Step 1: Run the four commands, in this order, and read the output.**

```bash
pnpm check && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass. Then the full dialect run: `sh tools/test-services.sh start` and `BK_REQUIRE_DIALECTS=all pnpm test`. Report any failure with its output; do not claim success before this.

- [ ] **Step 2: Request review** with `superpowers:requesting-code-review` on the branch.
- [ ] **Step 3: Finish** with `superpowers:finishing-a-development-branch`: keep the branch or open a pull request. Never merge, never push to `main`.
