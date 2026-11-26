<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-26-base-plugins-s1-users-roles.md
  @description Implementation plan for slice S1 of the complete base plugins: the users and roles plugins over the user and role services, tests first behind the maintainer gate.
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

# M1.11 slice S1: users and roles (USR-01..12, ROL-01..08)

## Context

M1.11 S0 is merged: disabled users, the identity columns, mail/queue/cache in the service registry, and outbox subscriptions. S1 is the next roadmap item. It turns the thin `users` and `roles` plugins of M1.8 into the full lifecycle of an account and a role, on the API and service side. The design is `docs/modules/base-plugins-complete.md` (sections `users`, `roles`, ROL-08 under Enterprise controls, and Decisions 3 and 4). S1 is `[D]` and touches authentication and authorization, so the work **stops after the failing tests (GATE)**. The maintainer reviews them, and only then is anything implemented. Agents never merge.

Decisions taken in this session (maintainer, 2026-11-26):

- **Two new columns** on `bk_auth_users`: `last_sign_in_at` (written by the existing session-create hook) and `deleted_at`. Auth migration version 0.6.0, one statement per step, `kind: 'expand'`. `invited` = not disabled, not deleted, `lastSignInAt` null and `emailVerified` false. Lists and lookups leave out deleted rows.
- **Administrator role** for USR-07 = the system role (`system: true`) named `admin`, counted per tenant that has it. The check lives in the services (user-service: disable, delete, MFA reset of self; role-service: revoke, delete, batch revoke), never in a route.
- **Name search**: `q` matches `lower(name) LIKE 'q%'` or `email LIKE 'q%'` (q lowercased; emails are stored lowercased). A new expression index on `lower(name)` on all three dialects (MySQL 8 functional index). Plan proof at 100 000 rows stays with OPS-05 in S6.

Choices left to the builder by the design, proposed here for the review:

- **Invitation (USR-10)** reuses the one set-password path that exists: the service writes a `reset-password:<token>` row in `bk_auth_verifications` with a 7-day expiry (`USERS_INVITE_TTL`) and the user gets the link of Better Auth's own `/reset-password/:token`. An invited user has **no credential account** (that is the unusable password); Better Auth's `resetCredentialPassword` creates it. The `onPasswordReset` hook marks the email verified, because the link proved the mailbox. `resend-invite` deletes the old token rows of the user and writes a new one. No new endpoint (P1).
- **Mail** uses the callbacks that `createAuth({ mail })` already takes (`sendResetPassword`, `sendVerification`), with two more: `sendInvite` and `sendMfaReset`. The services find them through the auth instance. The wiring that exists (`packages/server/src/auth-mail.ts`, `createTestApp`) writes a `mail.send` outbox intent when it runs inside a transaction (BPL-02), so nothing external runs inside one. `@bieberkit/auth` does not import `@bieberkit/mail` (same layer).
- **Service shape**: `createUserService({ db, auth, inviteTtlSeconds?, limits? })` returns the user operations. The guarded `disableUser` and `enableUser` of S0 stay the one implementation, and the service delegates to them (P1).
- **USR-06 delete** (Decision 4): one transaction sets `deletedAt`, `email = deleted-<id>@invalid`, `name = ''`, `image = null`, `source = 'local'`, `externalId = null`, and deletes sessions, accounts, role memberships, two-factor rows, passkeys, API keys and verifications of the user. Audit rows stay. Action `users.user.deleted`.
- **USR-07 actor**: services take `actorId: string | null` explicitly (as `disableUser` does). `null` is the system (a seeder, the CLI) and skips the self check, never the last-admin check.
- **ROL-02 batch**: up to 100 `userIds`, **one transaction**, a result per id (`assigned` | `unchanged` | `not_found` | `refused` with a code). The last-admin and escalation checks run per id; a refused id does not roll back the others (API-14 style, no 202 path because the limit is 100).
- **ROL-08 escalation** is built here (the design says so); S6 only adds it to the generated suite. Creating, changing, duplicating or assigning a role needs the caller to hold every permission of that role. A holder of the `admin` system role may do anything. Nobody assigns a system role through the API except a holder of that role. `ROLES_ESCALATION` (403), audited as a failed authorization (AUTHZ-05).
- **ROL-07**: assigning a `requireMfa` role to a user with `twoFactorEnabled` not true still assigns, and the per-id result carries `warning: 'MFA_ENROL_REQUIRED'`.
- **USR-09 / USR-10 / USR-11 limits** (AUTH-06): through the existing `RateStorage.consume` of `packages/auth/src/limits.ts` with two keys, per target user (3 per 15 min) and per actor (20 per 15 min). Over the limit: `USERS_RATE_LIMITED` (429) with `retryAfter`.
- **Pagination**: `encodeCursor`/`decodeCursor`/`pageSize` from `@bieberkit/data` (`packages/data/src/query/page.ts`), keyset on `(sortValue, id)`, `withTotal` like the entity routes (BPL-06).
- **Tenant** (Decision 3): with a request tenant, lists and lookups see only users with a role membership in that tenant; without a tenant (system administrator) all users. A user outside the tenant is `USERS_NOT_FOUND`, never 403 (no existence leak).

## Branch

`feat/base-plugins-users-roles` from `main`, in the current checkout (no worktree). Plan copied to `docs/superpowers/plans/2026-11-26-base-plugins-s1-users-roles.md` with the file header as the first commit.

## Files

| File                                                                                       | Change                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/auth/src/tables.ts`                                                              | `lastSignInAt`, `deletedAt` on `AuthUser`; steps 0.6.0 (two columns, `lower(name)` index)                                                                                                                                                  |
| `packages/auth/src/better-auth.ts`                                                         | `additionalFields` for the two columns; session-create hook writes `lastSignInAt`; deleted users refused like disabled; `onPasswordReset` marks email verified                                                                             |
| `packages/auth/src/user-service.ts`                                                        | `listUsers`, `getUser`, `createUser` (password or invite, with roles), `updateUser`, `deleteUser`, `listSessions`, `revokeSession(s)`, `sendPasswordReset`, `resendInvite`, `resetMfa`, `effectivePermissions`; last-admin and self guards |
| `packages/auth/src/role-service.ts`                                                        | `getRole` + `memberCount`, `listMembers`, `assignRoles`/`revokeRoles` (batch), `duplicateRole`, `deleteRole({ reassignTo })`, last-admin guard on revoke/delete, escalation guard                                                          |
| `packages/auth/src/errors.ts` codes                                                        | `USERS_LAST_ADMIN`, `USERS_SELF_ACTION`, `USERS_RATE_LIMITED`, `ROLES_IN_USE`, `ROLES_ESCALATION`                                                                                                                                          |
| `packages/auth/src/better-auth.ts` (`AuthMailOptions`), `packages/server/src/auth-mail.ts` | `sendInvite`, `sendMfaReset` messages                                                                                                                                                                                                      |
| `packages/testing/src/app.ts`, `packages/auth/src/testing/auth-server.ts`                  | the same two callbacks (mailbox sees the invites)                                                                                                                                                                                          |
| `plugins/users/src/index.ts` → split into `routes.ts` + `index.ts`                         | thin routes over the service; permissions `users.read`, `.manage`, `.revoke-sessions`, `.reset-mfa`; env `USERS_INVITE_TTL`                                                                                                                |
| `plugins/roles/src/routes.ts`                                                              | ROL-01..07 routes; `GET /permissions` returns `{ name, module, resource, action }`                                                                                                                                                         |
| `docs/spec/SPEC.md`                                                                        | USR-01..12, ROL-01..08, BPL-05/06 for these two plugins as normative text; changelog row                                                                                                                                                   |
| `docs/modules/base-plugins-complete.md`, `docs/modules/plugins.md`                         | decisions above; the users/roles tables replaced                                                                                                                                                                                           |
| `.changeset/*.md`                                                                          | auth, server, testing, plugin-users, plugin-roles (the list route changes shape)                                                                                                                                                           |

## Tasks

Every test is named after its ID and runs on PostgreSQL, MySQL and SQLite: service tests through `describeDialects` + `authServer` (`packages/auth/src/testing/`), route tests through `describeDialects` + `createTestApp({ database: open })` with real roles.

### Task 1 — Tests (RED), then GATE

1. `packages/auth/src/profile.dialects.test.ts`, `drift.test.ts`: `USR-01 lastSignInAt is set at sign in`, the 0.6.0 columns and index, drift passes.
2. `packages/auth/src/user-service.dialects.test.ts` (extend) and a new `user-lifecycle.dialects.test.ts`:
   - `USR-03 a user is made with roles in one transaction; a refused role rolls back the user`
   - `USR-03 the message of a refused password states the AUTH-04 policy (8 characters)`
   - `USR-04 a changed email is unverified and a verification mail is queued after commit`; `USR-04 the password is never changed`
   - `USR-05 status is invited, active or disabled`
   - `USR-06 delete anonymizes the row, frees the email, removes sessions, accounts, memberships, second factors, passkeys and keys, and keeps the audit rows`
   - `USR-07 nobody disables, deletes or revokes admin from themselves (USERS_SELF_ACTION)`; `USR-07 the last active admin cannot be disabled, deleted or revoked (USERS_LAST_ADMIN)`; `USR-07 a disabled admin does not count as active`; `USR-07 two concurrent revokes of the last two admins leave one` (row lock / SQLite writer)
   - `USR-09 reset mail is queued, the admin never sees a token, and the limit per target and per actor is 429`
   - `USR-10 invite makes a user with no credential account, mails a 7-day link, the link sets the password and verifies the email, an expired link is refused, resend replaces the old link`
   - `USR-11 MFA reset removes TOTP and passkeys, revokes sessions, mails the user, is refused on oneself`
   - `BPL-05 each mutation writes its users.user.<verb> audit in the same transaction` (rollback case with a dropped audit table, as in S0)
   - `no write calls mail or queue inside its transaction` (mailbox empty until `runOutbox()`)
3. `packages/auth/src/role-service.dialects.test.ts` (extend): `ROL-01 memberCount and members paged`, `ROL-02 batch assign/revoke with a result per id`, `ROL-03 duplicate`, `ROL-06 delete in use is ROLES_IN_USE unless reassignTo`, `ROL-07 warning for a requireMfa role`, `ROL-08 no escalation on create, change, duplicate, assign; admin may; a system role is assigned only by its holder`.
4. `plugins/users/src/index.test.ts` (rewrite with `describeDialects`): `USR-01` filters (`q`, `role`, `status`, `emailVerified`, `createdAt` range), the three sorts with a stable cursor, row shape; `USR-02` session count; `USR-08` sessions list and revoke one/all; `USR-12` me and patch me (name only; email through USR-04 rules); `BPL-06` limit above 100 is clamped, `withTotal`; Decision 3 tenant scoping (`USERS_NOT_FOUND` across tenants); `AUTHZ-01` 403 for each permission.
5. `plugins/roles/src/index.test.ts`: `ROL-04` permission catalogue shape, `ROL-05` effective permissions with granting roles and an explained condition, route wiring of ROL-01..03/06/07.

**GATE:** run the new tests, show the RED output and the test list to the maintainer, and stop. Commit only the plan and the tests on the branch (`test(auth): ...`).

### Task 2 — Schema and Better Auth wiring (after GATE)

Columns, steps 0.6.0, `additionalFields`, the hook, `onPasswordReset`, deleted-user refusal. Tests of item 1 go green.

### Task 3 — user-service

Functions in the Files table, the guards, the two mail callbacks, rate limits. Tests of item 2 go green.

### Task 4 — role-service

Batch, duplicate, reassign, escalation, MFA warning. Tests of item 3 go green.

### Task 5 — Plugin routes and wiring

Thin routes in both plugins, server/testing wiring of the two mail callbacks, the seed gives the new permissions to admin. Tests of items 4 and 5 go green.

### Task 6 — Spec, docs, roadmap, changeset

SPEC.md entries and changelog row, the two module docs, tick **S1** in `docs/ROADMAP.md` only when every test above passes; BPL-05/06 stays open until S2–S5.

## Verification

1. `sh tools/test-services.sh start`, then `BK_REQUIRE_DIALECTS=all pnpm test packages/auth plugins/users plugins/roles packages/testing packages/server` (recipe in memory `reference-test-battery`).
2. `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, output read in the session.
3. Coverage: `user-service` ≥ 90 % (auth gate), plugins ≥ 80 %.
4. `superpowers:requesting-code-review`, then keep the branch or open a PR. Never merge.
