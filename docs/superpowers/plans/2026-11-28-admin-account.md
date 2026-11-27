<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-28-admin-account.md
  @description Plan of the account screens of the admin (UI-26): password links, the second factor, the client, the screens and their tests.
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

# Account screens (UI-26) Implementation Plan

Approved by the maintainer on 2026-11-28. One delivery: all tests, one stop for the maintainer, then all the code. Behavior 17 of the spec was added with this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A person of a `blank` project does everything with their own account in the admin.

**Architecture:** The server turns TOTP on and points password links at the admin. Logic is in `@bieberkit/admin-core`, screens are lazy chunks of `@bieberkit/admin-antd`, and they call the Better Auth routes directly.

**Tech Stack:** Better Auth 1.7.25, Ant Design 6.7.1 (`QRCode`), TanStack Router and Query, Vitest, Playwright. No new dependency.

**Spec:** `docs/modules/admin-account.md`

## Global Constraints

- No new runtime dependency, env variable or config key.
- Issuer of TOTP: `admin.brand.name`, else `name` of the config.
- Password: 8 to 128 characters (`string.length`, no trim), 15 or more recommended, no composition rules.
- Passkeys and magic link stay off.
- `en`, `vi`, `zh`; 360 px; no axe violation light and dark; initial JS under 400,000 bytes gzip.
- Password, TOTP secret, backup codes, reset token: memory only. Never storage, drafts, logs or error reports.
- File header on every new file. Erasable TypeScript, `.ts` imports, no `any`, no default export.
- `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` before saying done.

## Review Focus

1. A reset link opened while somebody else is signed in: the password of the token's account changes, the other person stays signed in and lands on the home page. (Task 7)
2. The pending second factor expired: the screen returns to the password step with a sentence, and does not repeat the code step forever. (Tasks 4, 7)
3. A code typed as `123 456`: spaces are removed before it is sent. (Task 4)
4. The page reloaded in the middle of enrolment: enabling again replaces the unverified secret, and the new one works. (Task 1)
5. A password with leading or trailing spaces: it is sent as typed and counted as the server counts. (Task 4)

## Phases

- **Phase A:** the test steps of Tasks 1 to 7, run them, see them fail for the right reason, make the mockups. **STOP for the maintainer.** Commit the tests only after approval.
- **Phase B:** the code steps of Tasks 1 to 8.

First action after approval: save this plan to `docs/superpowers/plans/2026-11-28-admin-account.md` with the file header, and update the spec doc (behavior 17, the signature of `updateRole`).

---

### Task 1: Password links and sessions (`@bieberkit/auth`)

**Files:** `packages/auth/src/better-auth.ts`, `user-service.ts` (`resetLink`, `sendInvite`), `routes.ts`, `testing/auth-server.ts` (option `pages`). Test: new `packages/auth/src/account.dialects.test.ts`.

**Produces:** `CreateAuthOptions.pages?: { readonly resetPassword: string }`, `pagesOf(auth)` beside `mailOf`.

- [ ] Tests (three dialects):
  - `USR-10 the link of an invitation comes back to the reset page of the admin, marked invite=1`: with `pages.resetPassword = BASE_URL + '/admin/reset-password'`, following `invite.url` answers 302 to a URL with that path, `token=<token>` and `invite=1`.
  - `USR-09 the link of a reset by an administrator comes back to the same page without invite`.
  - `USR-10 without pages the link comes back to /reset-password of the origin` (today).
  - `UI-26 an expired link comes back with error=INVALID_TOKEN`.
  - `AUTH-06 a password set through a link ends every session of the account`: two cookies; after `POST /reset-password`, `/get-session` has no user for both.
  - `AUTH-05 confirming the second factor ends the other sessions of the account`: cookies A and B; enrol with A; B has no user, the cookie from the confirmation has one.
  - `AUTH-05 a later code does not end sessions`: two TOTP sign ins both stay.
  - `AUTH-03 enabling again before confirming replaces the secret`: enable twice, the code of the second secret confirms.
- [ ] Run `pnpm test packages/auth/src/account.dialects.test.ts`. Expected: FAIL on the link address and on surviving sessions.
- [ ] Code: `pages` stored per instance; `resetLink(userId, ttl, { invite })`; `emailAndPassword.revokeSessionsOnPasswordReset: true`; in `registerAuthRoutes` or an after hook, on a successful `/two-factor/verify-totp` that turned the flag on (user had `twoFactorEnabled` false before), delete the other sessions in the same transaction (database and secondary storage, through `internalAdapter`).
- [ ] Run again: PASS. Also `user-lifecycle.dialects.test.ts` and `methods.dialects.test.ts`. Commit `feat(auth): ...`.

### Task 2: Requiring the factor (`auth`, `plugin-roles`, `plugin-users`)

**Files:** `packages/auth/src/role-service.ts` (`updateRole`), `plugins/users/src/routes.ts` (`GET /users/me`). Tests: `role-lifecycle.dialects.test.ts`, `role-service.dialects.test.ts:199` (changes with the spec), `plugins/users/src/index.test.ts`, `plugins/roles/src/index.test.ts`.

**Produces:** `updateRole` unchanged in signature; code `ROLES_SELF_LOCKOUT` (409); `me.mfaRequired: boolean`.

- [ ] Tests:
  - `ROL-06 a holder of the administrator role turns requireMfa of a system role on and off` (with a factor), audited `auth.role.updated`.
  - `ROL-06 the name, ipRestricted and permissions of a system role stay AUTH_ROLE_SYSTEM`, also in one change together with `requireMfa`: nothing is written.
  - `ROL-06 somebody with roles.manage who does not hold the role gets ROLES_ESCALATION, audited authz.denied`.
  - `POL-05 turning it on for a system role that one holds without a factor is ROLES_SELF_LOCKOUT`; turning it off is not refused.
  - `ROL-06 the system (no actor) is not limited`.
  - `AUTH-05 the seed leaves requireMfa off on the administrator role`.
  - `USR-12 /users/me says mfaRequired` false by default, true with a role with `requireMfa`, true with `security.mfa.required-for-all`.
- [ ] Run, expected FAIL (`AUTH_ROLE_SYSTEM`, no `mfaRequired`).
- [ ] Code: in `updateRole`, a system role accepts a change only of `requireMfa`; holder check with `holdersQuery`/`isAdminRole` of `admin-guard.ts` and `actorOf()`; refusal audited as `refuseEscalation` does. `/me` adds `loadGrants(...).requireMfa || (await settingsPolicyReader(...).read({})).mfa.requiredForAll`.
- [ ] PASS, commit.

### Task 3: Server wiring (`@bieberkit/server`)

**Files:** `services.ts` (`registerRuntimeServices` gains `root: string`), `boot.ts`, `seed.ts` and other callers. Test: new `packages/server/src/account.test.ts`.

**Consumes:** `CreateAuthOptions.pages`; `adminDirectory(root)`, `adminLocation` of `admin.ts`.

- [ ] Tests: `AUTH-03 a booted project serves the TOTP routes` (enable answers 200 and the URI starts `otpauth://totp/<name>`; the brand name wins over the config name); `USR-10 with the admin installed the invitation leads to <admin>/reset-password`, for the default path, a path of `ADMIN_URL` and the root of a host of its own; `USR-10 without the admin it leads to /reset-password`.
- [ ] FAIL (404 on `/api/auth/two-factor/enable`).
- [ ] Code: `methods: { totp: { issuer } }`; `pages` only when `adminDirectory(root)` is defined.
- [ ] PASS, commit.

### Task 4: Client and rules (`@bieberkit/admin-core`)

**Files:** `client.ts` (`AdminApiError` gains `retryAfter?: number` from `Retry-After`/`X-Retry-After`), new `account.ts`, `index.ts`, `messages/{en,vi,zh}.ts`, `fixtures/text-adapter.ts` if it uses `signIn`. Test: new `account.test.ts`, `client.test.ts`.

**Produces:**

```ts
type SignInResult = { kind: 'signedIn'; user: SessionUser } | { kind: 'secondFactor' };
type CodeKind = 'totp' | 'backup';
interface AdminSession { token: string; userAgent: string; ip: string; createdAt: string; lastUsedAt: string; current: boolean }
interface Me { id: string; name: string; email: string; mfaEnabled: boolean; mfaRequired: boolean; mfaEnrolBy?: string }
// AdminClient
signIn(email, password): Promise<SignInResult>
verifySecondFactor(code: string, kind: CodeKind): Promise<SessionUser>
requestPasswordReset(email: string, redirectTo: string): Promise<void>
resetPassword(token: string, password: string): Promise<void>
changePassword(input: { current: string; next: string; signOutOthers: boolean }): Promise<void>
hasPassword(): Promise<boolean>                       // /list-accounts has providerId 'credential'
enableTotp(password: string): Promise<{ uri: string; backupCodes: readonly string[] }>
disableTotp(password: string): Promise<void>
renewBackupCodes(password: string): Promise<readonly string[]>
sessions(): Promise<readonly AdminSession[]>
revokeSession(token: string): Promise<void>
revokeOtherSessions(): Promise<void>
me(): Promise<Me | undefined>                          // 404 (no users plugin) is undefined
renameMe(name: string): Promise<void>
// pure
normalizeCode(text: string, kind: CodeKind): string
passwordProblem(text: string): 'tooShort' | 'tooLong' | undefined
passwordIsShort(text: string): boolean                // under 15: show the advice
secretOfUri(uri: string): string
enrolmentNeeded(error: unknown): boolean              // AUTH_MFA_REQUIRED, AUTH_MFA_ENROL_REQUIRED
stepExpired(error: unknown): boolean                  // INVALID_TWO_FACTOR_COOKIE, TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE
authMessageKey(error: AdminApiError): MessageKey | undefined
resetSearchOf(search: string): { token?: string; invite: boolean; invalid: boolean }
```

- [ ] Tests: one per method with the fake fetch of `client.test.ts` (method, path, body; `signIn` gives `secondFactor` for `{ twoFactorRedirect: true }`; verify paths `/two-factor/verify-totp` and `/two-factor/verify-backup-code`, never `trustDevice`); `normalizeCode(' 123 456 ', 'totp') === '123456'`, a backup code keeps its dash and case; `passwordProblem` at 7, 8, 128, 129, with `'  abcdef'` counted as 8; `authMessageKey` for `INVALID_EMAIL_OR_PASSWORD`, `INVALID_CODE`, `INVALID_BACKUP_CODE`, `INVALID_PASSWORD`, `INVALID_TOKEN`, `AUTH_USER_DISABLED`, `AUTH_NETWORK_DENIED`, `ACCOUNT_TEMPORARILY_LOCKED`, status 429, `stepExpired` codes, and `undefined` for another; `resetSearchOf` for `token`, `invite=1`, `error=INVALID_TOKEN`, empty.
- [ ] FAIL, then (Phase B) code and dictionaries (`i18n.test.ts` holds the three equal), PASS, commit.

### Task 5: Browser tests and mockups (Phase A only, with Tasks 6 and 7)

**Files:** new `e2e/account.spec.ts`, `e2e/support.ts`, `e2e/serve.mjs`, `e2e/playwright.config.ts` (add the spec to `chromium`).

- Sign in allows 5 tries a minute for each address. Set `TRUST_PROXY` in `serve.mjs` and give each test context its own `X-Forwarded-For`. Each test makes its own user through the API as the administrator, so no test changes the account that other specs use.
- A TOTP code comes from the secret shown on the screen (`packages/auth/src/testing/totp.ts`). Mail links are read from the log of the `log` mail driver, or from the queued message in the database.
- [ ] Tests: enrol from My account (QR and secret, ten codes, confirm), sign out, sign in with a code, with a backup code, with a wrong code (translated sentence); forgot password (same sentence for a known and an unknown address); reset through the link, then sign in; invitation through the link (invite heading); a used link offers a new one; the token leaves the address bar; Review Focus 1; forced enrolment for a role with `requireMfa`, then the admin opens; grace notice with the date; the four tabs (rename, change password, end a session, turn off hidden when required); each new screen with axe, light and dark, wide and 360 px; the session of an English person requests no other language.
- [ ] Mockups of: code step, forgot, reset, enrolment (three steps), My account. Shown to the maintainer at the stop.

### Task 6: Sign in and password pages (`@bieberkit/admin-antd`)

**Files:** `app/Login.tsx` (code step; the shell of two sides moves to `app/AuthShell.tsx`), new `app/ForgotPassword.tsx`, `app/ResetPassword.tsx`, `app/PasswordField.tsx`, `app/authError.ts`, `App.tsx` (lazy routes `forgot-password`, `reset-password`), `Gate.tsx` (those two paths render without a session and without the frame).

**Consumes:** Task 4.

- [ ] Code. The token is read into state, then removed with a history replace. `redirectTo` is `origin + adminBase() + '/reset-password'`.

### Task 7: Enrolment and My account (`@bieberkit/admin-antd`)

**Files:** new `app/TwoFactorSetup.tsx` (the three steps, used twice), `app/EnrolScreen.tsx`, `app/Account.tsx` with tabs in `app/account/{Profile,Password,TwoFactor,Sessions}.tsx`, `app/GraceNotice.tsx`; `Gate.tsx` (when `enrolmentNeeded(meta.error)` show `EnrolScreen` lazily; menu item "My account"), `App.tsx` (lazy route `account`), `app.css`.

- [ ] Code. `QRCode` with `type="svg"` on a white quiet zone, so it scans in dark mode. A person without a password sees the sentence of the provider and no action.
- [ ] `pnpm build && pnpm check:admin-size && pnpm test:e2e`: all pass, no policy violation. Commit.

### Task 8: Spec, docs, changeset, roadmap

**Files:** `docs/spec/SPEC.md` (AUTH-03, AUTH-05, AUTH-06, ROL-06, USR-10, USR-12, UI-26, history), `docs/modules/{admin-account,admin,auth}.md`, `.changeset/m2-2-admin-account.md` (minor: auth, server, admin-core, admin-antd, plugin-roles, plugin-users; says that `signIn` changed its answer, that a reset ends sessions, and that TOTP is on), `docs/ROADMAP.md` (tick UI-26 with evidence).

- [ ] `pnpm check && pnpm typecheck && pnpm lint && pnpm test`, with the service containers of the full battery for the three dialects. Report any failure or skip as it is. Commit.

## Verification

Besides the commands above: run a project made by `create` through the e2e server, invite a user, follow the mailed link, enrol a TOTP, sign in with the code. Save screenshots with `E2E_SHOTS` for the maintainer. Not covered: a scan by a real authenticator app and a real mail server.
