<!--
  BieberKit

  @file        docs/modules/admin-account.md
  @description Module spec of the account screens of the admin: sign in with a second factor, password links, enrolment, own profile and sessions, and the server wiring they need (UI-26).
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

# The account screens of the admin

- Packages: `@bieberkit/auth`, `@bieberkit/server`, `@bieberkit/admin-core`, `@bieberkit/admin-antd`, `@bieberkit/plugin-roles`, `@bieberkit/plugin-users`
- Layer: contracts and product
- Spec sections: UI-26, UI-25, AUTH-01, AUTH-03 to AUTH-06, USR-09, USR-10, USR-12, ROL-06, ROL-07, POL-02, POL-05
- Status: **Implemented on 2026-11-28, in the wrong packages.** The behaviors below stand. The screens and their calls move to the `users` plugin (ADR 0040, [plugin-admin.md](plugin-admin.md)). A second factor is optional, and a person must set one up only when an administrator requires it (decided on 2026-11-27).

## Purpose

A person of a `blank` project can do everything with their own account in the admin: sign in with a second factor, get back a lost password, accept an invitation, set up and remove a second factor, change their name and password, and end their sessions. Nothing has to be configured. The screens of other people's accounts are not here (UI-27), and neither are the screens of roles (UI-28) or of the security policies (UI-29).

Passkeys and magic link are not turned on by this change (see "Later").

## What is there today

Read from the code on 2026-11-27, before this change.

| Subject                    | Today                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Second factor              | `createAuth` supports TOTP, and its tests cover it. The server passes no `methods`, so a booted project has no TOTP route |
| Sign in screen             | It expects a user in the answer. For `twoFactorRedirect` it shows an error                                                |
| Invitation and admin reset | The link comes back to `<origin of APP_URL>/reset-password`. No page or route is there                                    |
| Password reset             | It does not end the sessions of the account                                                                               |
| Requiring a second factor  | A custom role can have `requireMfa`, and `security.mfa.required-for-all` asks everyone. A system role cannot be changed   |
| AUTH-05                    | It says that the administrator role has `requireMfa`. The seed does not set it                                            |

## Approaches

Where the screens live was decided again on 2026-11-28. The first version of this document put them in `admin-core` and `admin-antd`, ruled out a plugin because the mechanism of ADR 0037 cannot draw a page without a session, and called `auth-ui` a name and not a package. The maintainer was not asked to pick between those approaches on their own, and the limit of a mechanism was no reason to rule the plugin out. The decision is now [ADR 0040](../adr/0040-plugin-owned-admin.md): the screens belong to the `users` plugin, and there is no `auth-ui` plugin.

What stays from the first version: the screens call the routes of Better Auth directly, so no route is copied (USR-12, P1), and the server renders no page of its own.

## Behavior

### Turning the second factor on (AUTH-03, AUTH-05)

1. The server always turns TOTP on. There is no key to turn it off, because a person who does not set it up sees no difference. The name that an authenticator app shows is `admin.brand.name`, or the `name` of the config.
2. Nobody must set up a second factor by default. No role has `requireMfa` after the seed, and `security.mfa.required-for-all` is off.
3. **A holder of the administrator role may turn `requireMfa` of a system role on and off.** The name and the permissions of a system role stay unchangeable. Anyone else gets `ROLES_ESCALATION` (403), audited, so `roles.manage` alone cannot lower the protection of the administrators.
4. A person who has no second factor and turns it on for a system role that they hold gets `ROLES_SELF_LOCKOUT` (409), as POL-05 does for the rule for everyone. The CLI and a seeder are not limited.

### Password links (USR-09, USR-10)

5. A link of an invitation and of a reset by an administrator comes back to `<admin>/reset-password`, where `<admin>` is the address of `ADMIN_URL`. The link of an invitation also carries `invite=1`. It is still a link of `/reset-password` of Better Auth, so its lifetime and single use do not change. A project without the admin keeps today's address, for a front end of its own.
6. A password that is set through a link ends every session of the account. This follows OWASP ASVS 5.0.

### Sign in (UI-26)

7. After a right password, an account with a second factor sees a step that asks for the code of six digits, with a way to type a backup code in its place and a way back. No session exists before the code is accepted (AUTH-05). Nothing offers to remember the device.
8. A refusal is shown in the language of the person for the codes that the screens know (wrong password, wrong code, expired step, disabled account, refused network, too many requests with the time to wait), and with the text of the server for any other.
9. "Forgot password?" opens `/forgot-password`. It sends `/request-password-reset` with the reset page of the admin as `redirectTo`, and shows the same sentence for an address with and without an account (AUTH-06).
10. `/reset-password?token=…` asks for the new password twice. It checks 8 to 128 characters, recommends 15 or more, and has no composition rules (AUTH-04). With `invite=1` it speaks of choosing a first password. With `error=INVALID_TOKEN`, or without a token, it says that the link is used or too old and offers a new one. After success it goes to sign in.
11. The two pages open without a session, and also with one. The admin takes the token out of the address bar when it has read it, and never puts it in a log, a draft or an error report (UI-21).

### Enrolment when it is required (AUTH-05, ROL-07, POL-02)

12. When the API answers `AUTH_MFA_REQUIRED` or `AUTH_MFA_ENROL_REQUIRED` to a signed-in person, the admin shows a full screen that sets up the second factor, with a way to sign out, in place of an error. After it, the admin opens as usual.
13. While `GET /api/v1/users/me` carries `mfaEnrolBy` (the days of grace of POL-02), the frame shows that date and a link to set it up. The notice can be closed until the next load.
14. Setting up has three steps: type the password; scan the QR code (`QRCode` of Ant Design, so no new dependency) or type the secret shown as text, then type a code; save the ten backup codes (copy or download) and confirm that they are saved. The codes are shown once. The password, the secret and the codes are held in memory only.

### My account (UI-26, USR-12)

15. The account menu has "My account", which opens `/account` with four tabs. An address of one segment cannot be the list of an entity, which has two.

| Tab                | What a person does                                                                                                  | Route                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Profile            | Read the email, change the name. Without the `users` plugin the name is read only                                   | `GET`, `PATCH /api/v1/users/me`                               |
| Password           | Give the current password and a new one. "Sign out other sessions" is on by default                                 | `/change-password`                                            |
| Two-factor sign in | Set it up, make new backup codes, turn it off. Each asks for the password. A required one cannot be turned off here | `/two-factor/enable`, `…/generate-backup-codes`, `…/disable`  |
| Sessions           | See device, address, start and last use, with this one marked. End one, or all others                               | `/list-sessions`, `/revoke-session`, `/revoke-other-sessions` |

`GET /api/v1/users/me` gains `mfaRequired`: true when a role of the person has `requireMfa` or the rule for everyone is on. No route says this today. Where it is true, "turn off" is not offered and a sentence says why. This is a matter of the screen only: the server stays the authority, and after a factor is turned off it refuses as AUTH-05 and POL-02 say.

An account without a password (made by an identity provider, IDN-02) is told that the provider manages its password and second factor, and the two tabs offer no action.

### One factor, every session (AUTH-05)

17. Turning the second factor on ends every other session of the account. The factor is a mark of the account and not of a session, so a session that was made with the password alone would otherwise count as one that gave a code. A later sign in with a code ends nothing.

### Rules of every screen (UI-25)

16. Each screen is a lazy chunk (the code step of the sign in is part of the sign in), is in `en`, `vi` and `zh`, works at 360 px, has no axe violation in light and dark, and keeps the budget of section 18.1.

```
Sign in, step 2              My account
+-----------+------------+   +--------+---------------------------------+
| brand     | Enter the  |   | menu   | My account                      |
| side      | code       |   |        | [Profile][Password][2FA][Sess.] |
|           | [ ______ ] |   |        | Two-factor sign in      On      |
|           | (Verify)   |   |        | (New backup codes) (Turn off)   |
|           | Use backup |   |        |                                 |
|           | code  Back |   |        |                                 |
+-----------+------------+   +--------+---------------------------------+
```

Pictures of each screen go to the maintainer before the screens are implemented.

## Public API

Names are proposals. The tests fix them.

The calls and the rules are in the admin part of the `users` plugin (`plugins/users/src/admin/api.ts` and `rules.ts`), over `AdminClient.request` of `admin-core`, which keeps the session and the sign out. They are not exported by a shared package (UI-34).

```ts
// plugins/users/src/admin
type SignInResult = { kind: 'signedIn'; user: SessionUser } | { kind: 'secondFactor' }
signIn(email, password): Promise<SignInResult>
verifySecondFactor(code, kind: 'totp' | 'backup'): Promise<SessionUser>
requestPasswordReset(email, redirectTo): Promise<void>
resetPassword(token, password): Promise<void>
changePassword(input): Promise<void>
enableTotp(password): Promise<{ uri: string; backupCodes: readonly string[] }>
disableTotp(password): Promise<void>
renewBackupCodes(password): Promise<readonly string[]>
sessions(), revokeSession(token), revokeOtherSessions()
me(), renameMe(name)
// pure: passwordProblem(text), secretOfUri(uri), enrolmentNeeded(error), authMessageKey(error)

// @bieberkit/auth
createAuth({ …, pages?: { resetPassword: string } })           // behavior 5
updateRole(db, roleId, changes)                        // behaviors 3 and 4; the actor is the one of the request

// @bieberkit/http
Principal.mfaForAll?: true                             // the rule for everyone is on, for GET /users/me
```

`signIn` and these calls left `AdminClient`, so the change has a changeset that says so.

## Errors

| Code                 | Status | When                                                               | Fix                                    |
| -------------------- | ------ | ------------------------------------------------------------------ | -------------------------------------- |
| `ROLES_SELF_LOCKOUT` | 409    | Requiring a factor for a system role that one holds without having | Set up your own second factor first    |
| `ROLES_ESCALATION`   | 403    | `requireMfa` of a system role by somebody who is not a holder      | Ask a holder of the administrator role |
| `AUTH_ROLE_SYSTEM`   | 409    | A change of the name or permissions of a system role, as today     | Make a new role instead                |

## Configuration

No new environment variable and no new config key. The reset page comes from `APP_URL` and `ADMIN_URL`.

## Delivery

One branch: all tests first, a stop for the maintainer, then all the code. The roadmap item UI-26 is ticked with it.

## Spec changes

In `docs/spec/SPEC.md` 0.8.39: AUTH-03, AUTH-05, AUTH-06, ROL-06, USR-10, USR-12 and UI-26. [auth.md](auth.md) says the same of the system role.

## Tests

| Requirement                                                              | Where                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| AUTH-03, USR-09, USR-10, and the end of sessions, on the three dialects  | `auth/src/*.dialects.test.ts`, `server/src/boot.test.ts`    |
| AUTH-05, ROL-06, the system role, escalation and lockout, three dialects | `auth/src/role-lifecycle.dialects.test.ts`, `plugins/roles` |
| UI-26 client calls, results and pure functions                           | `admin-core/src/account.test.ts`, `client.test.ts`          |
| UI-26, UI-25 in the browser with axe, both widths and both palettes      | `e2e/account.spec.ts`                                       |

The browser tests make TOTP codes from the secret on the screen, as `auth/src/testing/totp.ts` does. Sign in allows 5 tries a minute for each address, so the spec reuses a signed-in page. Not covered by a test: a scan by a real authenticator app, and delivery by a real mail server.

## Later

- **Passkeys and magic link** need a config key, and their own design. **Magic link must not be turned on before this is solved:** Better Auth 1.7.25 asks for the second factor only after `/sign-in/email`, `/sign-in/username` and `/sign-in/phone-number`, while the authenticator sets `mfa: true` for every session of a user who has TOTP on. A session from a magic link would pass `requireMfa` without a code. This comes from reading both sources, and no test shows it yet.
- The mails stay in English until M-02 (M2.4).

## Found while building

- **Colors of Ant Design.** The background that it derives for a "success" tag from the green of the theme reads at 2.7:1. The tag of the state of the factor and the one of this device use the colors of the theme.
- **Four tabs at 360 px.** Ant Design adds a button for the tabs that do not fit, inside the list of tabs, which ARIA does not allow. The tabs of the account wrap.
- **Sizes.** The initial JavaScript of the admin is 330.5 kB compressed, of 400 kB.

## Open questions

- The hover color that Ant Design derives for a default button reads at 3.77:1 on white (the button "Add filter" of a list). This is older than this change, and it is a decision of the theme (UI-23).
- A reset through a link while somebody else is signed in at the same browser writes `auth.password.reset` with the id of the signed-in person. This is older than this change (the audit takes the actor of the request when the answer names no user), and the page of the admin now makes the case easier to reach.
