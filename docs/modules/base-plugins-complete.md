<!--
  BieberKit

  @file        docs/modules/base-plugins-complete.md
  @description Design of the work that takes the six base plugins from a thin slice to a complete, production-ready set, with proposed requirement IDs and slices.
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

# The base plugins, complete

- Packages: `@bieberkit/plugin-users`, `-roles`, `-settings`, `-audit-log`, `-notifications`, `-media`, and the changes they need in `@bieberkit/auth`, `@bieberkit/server` and `bieberkit` (CLI).
- Layer: plugins, with the platform changes in the product and tools layers. Imports keep pointing downward (PKG-01).
- Spec sections: 11, 12, 14, 15, OBS-05, AUTH-01 to AUTH-06, AUTHZ-01, AUTHZ-05, S-01 to S-06, DATA-13, DATA-25, IO-04.
- Status: **Approved in outline by the maintainer on 2026-11-25** (approach 2, and the recommendations of the open questions, which are now decisions below). The maintainer asked for a result that serves a single person and an enterprise equally. Section "Who it is for" and section "Enterprise controls" carry that. S0 implements BPL-01 to BPL-04 and IDN-01, S1 implements USR-01 to USR-12 and ROL-01 to ROL-08 (tests approved by the maintainer on 2026-11-26), and S2 implements SET-01 to SET-07 (ADR 0030), with the normative requirements in `docs/spec/SPEC.md` sections 12.1 to 12.3 and milestone M1.11 in the roadmap. The remaining IDs are proposals for S3 to S6; the full milestone remains open.
- Builds on: `docs/modules/plugins.md` (the thin slice of M1.8). This file replaces its "what a plugin does" tables slice by slice; `plugins.md` is updated as each slice lands.

## Purpose

Every project made from `blank` carries these six plugins. M1.8 made them enough to sign an administrator in and manage a few records. A project that goes to production with real users needs the whole life of an account, a role, a setting, a notification, a file and an audit entry. This work closes that gap on the **API and service side**, so that the admin screens (M2.2) and the other templates (M2.5) build on a finished surface and not on a thin one.

## Who it is for

One code path serves both. There is **no edition flag and no paid tier** (P1): the difference is the value of a policy, not a different program.

- **A person or a small team** runs `create bieberkit` and changes nothing. The defaults are safe and need no setup: one tenant, local accounts, the `local` or S3 disk, mail through `log` or SMTP, and the settings of section "Enterprise controls" at their default values. Nothing in this work may add a mandatory step to that path.
- **An enterprise** raises the same policies (sessions, MFA, networks, retention), turns on the audit mirror, keeps several tenants, and attaches an identity provider through a plugin. It must not need a fork or a patch for any of that. What an enterprise needs and this work does not build (SSO, SCIM, a SIEM connector) has a **defined hook** here, so the plugin that adds it changes no table and no API of these six.

A feature that only an enterprise needs is acceptable here only when it is a policy with a safe default, an extension point, or a CLI command. It is not acceptable as a second code path.

## Goals, non-goals, anti-goals

Goals:

- Each plugin covers the lifecycle that a management app needs, with audit, tenant checks and permissions on every write.
- Logic that more than one plugin or the CLI needs lives in a service, not in a route handler (the pattern of `role-service`).
- Every behavior has a requirement ID and a test named after it, on the three dialects.

Non-goals (each has its own milestone or needs its own design):

- Admin screens for these plugins (M2.2, with UI-04).
- Impersonation, and the OAuth, OIDC, SAML and SCIM providers themselves (an own design, `[D]`). The hooks that they will plug into are in this work (IDN-01 to IDN-03).
- Realtime push of notifications (M2.4, RT-01 to RT-03). This work only emits the event.
- `privacy` features: consent, data requests, crypto-shredded audit (M2.4, PDP).
- Image variants and `srcset` (M2.3, SEO-08), and any image library (P9 needs an ADR).
- A hash chain over the audit log (parking lot). The mirror of AUD-07 gives an enterprise an immutable copy outside the database in the meantime.
- Bulk operations on users, and forced password rotation or password history. OWASP ASVS 5.0 advises against both, and AUTH-04 follows it.
- Four-eyes approval of sensitive actions (granting the administrator role). It waits for the `workflows` of M2.4.

Anti-goals (a failure even if the tests pass):

- A second way to do one thing (P1): for example both an entity route and a service route to write a setting.
- A feature that needs a runtime dependency without an ADR line (P9).
- A write that calls mail, queue or storage inside a transaction (AGENTS.md). Everything external goes through the outbox.
- The Better Auth `admin` plugin. It brings its own role model, which conflicts with AUTHZ-01.

## Constraints

- Areas the maintainer designs by hand: authentication and authorization. Slices S0 and S1 touch both, so they run in plan mode, show their tests first and are never merged by an agent.
- The application database role has only `INSERT` and `SELECT` on `bk_audit_log` (DATA-25). No plugin code deletes audit rows.
- Plugins read config only through validated services (P8) and throw `BkError` subclasses with a stable code (MOD-17). Only services open transactions (MOD-16).
- Nothing is released yet, so a route of the thin slice may change shape when its replacement lands. The change goes in the changeset.

## Approaches

| Approach                                                                      | Trade-off                                                                                                                                     | Decision                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1. Each plugin owns its logic in its route handlers                           | Fast, few packages touched. The checks (tenant, last administrator, audit) repeat in every plugin, and `saas` invitations would copy `users`. | Rejected                     |
| 2. A service per concern, plugins are thin routes (pattern of `role-service`) | Audit and checks in one place, reusable by the CLI and other plugins. Changes `@bieberkit/auth`, so the maintainer reviews it.                | **Chosen by the maintainer** |
| 3. Better Auth `admin` plugin for ban, sessions and roles                     | Least code. Adds a second role model, extra tables and a drift against ADR 0012. Needs a spike and an ADR first.                              | Rejected                     |

## Platform changes (slice S0)

These come first, because the plugins below depend on them.

- **BPL-01** A user can be disabled. `bk_auth_users` gains `disabled_at`, `disabled_reason` and `disabled_by`, as a versioned step of `@bieberkit/auth`. A disabled user cannot sign in, and a request that carries a session of a disabled user is refused with `AUTH_USER_DISABLED` (403). Disabling revokes every session of the user in the same transaction.
- **BPL-02** The service registry of plugins (`RouteContext.services`, the seed services, the test app) gains `mail`, `queue` and `cache`, with the types of the contracts. `createTestApp` registers the in-memory versions.
- **BPL-03** The existing `definePlugin({ services })` and module container already let a plugin contribute a named service of its own (`settings`, `notifier`) that other plugins read from the registry with an inferred type. A service name taken twice fails at boot (the rule of the container, §7.3).
- **BPL-04** S0 provides `subscriptions` contributions and `applySubscriptions` to map committed outbox events to jobs, optionally mapping the message to job input. Boot, seed and test-app wiring apply them; each queue driver rejects a second mapping for an event with `QUEUE_SUBSCRIPTION_DUPLICATE`. The media slice S4 applies this mechanism to `media.file.deleted`: the worker removes the object after commit, retries failures and reports a final failure (MED-03).
- **BPL-05** Acceptance rule for each of S1 to S5, not new S0 code: every mutation of the six plugins writes its audit entry in the same transaction (AUTHZ-05) with a stable action name `<plugin>.<noun>.<verb>`.
- **BPL-06** Acceptance rule for each of S1 to S5, not new S0 code: every list route of the six plugins uses a keyset cursor and a limit of at most 100, and takes `withTotal` where the entity routes do (DATA-06, DATA-11).

Auth reset and verification mail is now wired to the queued mail service in real boots and seeders. The test app captures those links in its memory mailbox; unknown-address reset returns the same answer and sends no additional message (AUTH-06). The type additions to `ServiceRegistry` reuse the mail, queue and cache contracts; ADR 0028 records the internal dependency edges of the test app.

## `users` (slice S1, `[D]`)

The logic is a `user-service` in `@bieberkit/auth`, next to `role-service`. The routes in the plugin call it.

- **USR-01** `GET /api/v1/users/users` filters by `q` (a prefix of the name or of the email, so that an index serves it on a table of a million rows; free text search is the `search` contract of M2.4), `role`, `status` (`active`, `disabled`, `invited`), `emailVerified` and a `createdAt` range, and sorts by `createdAt`, `name` or `email`. Each row carries `status`, `roles` (id and name), `mfaEnabled` and `lastSignInAt`.
- **USR-02** `GET /api/v1/users/users/:id` returns the same row plus the number of active sessions.
- **USR-03** `POST /api/v1/users/users` takes `roles: uuid[]` and assigns them in the same transaction. The message of a rejected password states the real policy of AUTH-04 (it must not say 12 characters).
- **USR-04** `PATCH .../:id` changes the name and the email. A changed email is marked unverified and a verification mail goes out through the queue. The password is never changed by this route.
- **USR-05** `POST .../:id/disable` (with a `reason`) and `POST .../:id/enable`, both audited. `status` is `invited` for an account that has never signed in and has no verified email.
- **USR-06** `DELETE .../:id` removes the user, the sessions, the memberships and the second factors in one transaction. Audit rows stay and keep the actor id. Rows of other entities keep their `created_by` and `updated_by` as plain ids (see the open question on deletion).
- **USR-07** Invariants, enforced by the service and not by the route: nobody disables, deletes or removes the administrator role from **themselves**, and the **last active holder of the administrator role** cannot be disabled, deleted or revoked. Error `USERS_LAST_ADMIN` (409) and `USERS_SELF_ACTION` (409).
- **USR-08** Sessions: `GET .../:id/sessions` (device, IP, created, last used), `DELETE .../:id/sessions/:sessionId` and `DELETE .../:id/sessions` (all). Permission `users.revoke-sessions`.
- **USR-09** `POST .../:id/reset-password` sends a reset link by mail through the queue. An administrator never sets or sees another person's password. Limited per target user and per administrator (AUTH-06).
- **USR-10** Invitation: `POST /api/v1/users/users` with `invite: true` (and no `password`) makes the account with an unusable password and sends a mail with a link to set one. `POST .../:id/resend-invite` sends it again, and an invitation link expires after 7 days. This is the only invitation path (P1); `saas` invitations to a tenant build on it.
- **USR-11** `POST .../:id/mfa/reset` removes the TOTP secret and the passkeys of a user who lost them, and revokes the sessions. Permission `users.reset-mfa`, never on oneself, always audited, and the user is told by mail.
- **USR-12** `GET /api/v1/users/me` and `PATCH .../me` for the signed-in person. Changing the password, the second factor and one's own sessions stay on the Better Auth endpoints that `auth-ui` already uses; the plugin does not copy them (P1).

Permissions: `users.read`, `users.manage`, `users.revoke-sessions`, `users.reset-mfa`. The seed adds them to the administrator role.

## `roles` (slice S1, `[D]`)

- **ROL-01** `GET .../roles/:id` returns the role with its `memberCount`. `GET .../roles/:id/members` lists the holders, paged.
- **ROL-02** `POST .../roles/:id/assign` and `.../revoke` take `userIds` (up to 100) in place of one `userId`, with a result for each id (the style of API-14).
- **ROL-03** `POST .../roles/:id/duplicate` makes a new, non-system role with the same permissions and a name that the caller gives.
- **ROL-04** `GET /api/v1/roles/permissions` returns each permission with its `module`, `resource` and `action`, derived from its name, so a client can group them. No change to `definePlugin`.
- **ROL-05** `GET /api/v1/users/users/:id/permissions` returns the effective permissions of a user, each with the roles that grant it and, for a scoped permission, the explained condition (`explainCondition`). It is the answer to "why can this person not do that".
- **ROL-06** `DELETE .../roles/:id` is refused with `ROLES_IN_USE` (409) and the member count when the role has members, unless the call names a `reassignTo` role. System roles stay unchangeable.
- **ROL-07** A role with `requireMfa` cannot be assigned to a user who has no second factor without a warning field in the response; the user is asked to enrol at the next sign in (AUTH-05).

Permissions: `roles.read`, `roles.manage`.

## `settings` (slice S2, `[D]` for the declaration)

- **SET-01** A setting is declared before it is used: key, `type` (`string`, `number`, `boolean`, `enum`, `json`), a JSON Schema for `json`, `default`, `label`, `description`, `group`, `scope` (`global` or `tenant`), `secret` and `public`. An undeclared key is refused with `SETTINGS_UNKNOWN_KEY` (404). _How the declaration reaches the plugin is an open question._
- **SET-02** One way to write: `GET /api/v1/settings/settings`, `GET .../:key`, `PUT .../:key` (validated against the declaration) and `DELETE .../:key` (back to the default). The generated entity routes of `settings.Setting` are removed (P1).
- **SET-03** A `secret` value is stored with the `encrypted` machinery (SEC-08), is never returned (reads show `"********"` and `hasValue: true`) and never appears in the audit data. Writing it needs `settings.manage`; nobody can read it back through the API.
- **SET-04** A `tenant` setting has a value per tenant, falls back to the global value and then to the default.
- **SET-05** Services read through `settings.get(key)` with a typed result. A read goes through the cache contract with a tag, invalidated after commit (DATA-13), and falls back to the default if the cache is down.
- **SET-06** A change writes an audit entry with the old and the new value (the key only, for a secret).
- **SET-07** `GET /api/v1/settings/public` returns the settings declared `public` without a session, cacheable (API-09), for the login screen and the site (name, locale, logo).

Permissions: `settings.read`, `settings.manage`.

## `notifications` (slice S3)

- **NTF-01** A service `notifier.send({ to, title, body, level, category, link, data, channels, dedupeKey })` writes the notification in the caller's transaction. `to` is a user id, a list of ids or a role name. A role with more than 100 holders is expanded by a queued job.
- **NTF-02** The columns of a notification gain `level` (`info`, `success`, `warning`, `error`), `category`, `link`, `data` (JSON), `dedupeKey` (unique per user) and `expiresAt`. A second `send` with the same `dedupeKey` is a no-op.
- **NTF-03** The routes of the signed-in person: `GET .../notifications/me` (filter `unread`, `category`), `GET .../me/unread-count`, `POST .../me/:id/read`, `POST .../me/read-all` and `DELETE .../me/:id`. They use the scoped permissions `notifications.read-own`, `.update-own` and a new `.delete-own`, so nobody reads another person's.
- **NTF-04** Preferences: `GET` and `PUT .../me/preferences` for each `category` and `channel` (`in-app`, `mail`). A table `bk_notification_preferences`. The default is on. A `mail` channel is sent through the queue (M-01) and only if the preference allows it.
- **NTF-05** A scheduled job deletes read notifications older than `NOTIFICATIONS_RETENTION_DAYS` (default 90) and every expired one.
- **NTF-06** Each send emits the event `notifications.created` on the bus, so the realtime layer of M2.4 can push it. Until then clients poll `unread-count` (RT-02).
- **NTF-07** The entity routes keep only `list`, `get` and `delete` for `notifications.manage` (support). Creating goes through the service route `POST .../notifications/send` with `notifications.manage` (P1).

## `media` (slice S4)

- **MED-01** `visibility` (`private` or `public`, default `private`) is fixed when the record is made, and is the key prefix of S-05. Changing it is a new upload (see the open question).
- **MED-02** `GET .../media/:id/url` returns a signed URL for a private file and the public URL for a public one. On the `local` disk, where there are no signed URLs, `GET .../media/:id/content` streams the file after the permission check.
- **MED-03** Deleting a record deletes its object after commit (BPL-04). A record that is still `pending` after `MEDIA_PENDING_TTL` (default 24 hours) is deleted with its object by a scheduled job.
- **MED-04** Metadata: `alt`, `description`, `folderId` and `checksum` (SHA-256, computed on confirm when the disk can read the object). `PATCH` changes `alt`, `description` and `folderId` only, never the file.
- **MED-05** Folders: `bk_media_folders` with a parent, a name unique inside its parent and a depth of at most 8. A folder with files or children cannot be deleted (`MEDIA_FOLDER_NOT_EMPTY`, 409). Tags use the `tags` feature (MOD-13).
- **MED-06** List filters: `q` (a prefix of the filename), `kind` (`image`, `video`, `audio`, `document`, `other`, from the sniffed type), `folderId`, `status`, `visibility`, a size range and a `createdAt` range.
- **MED-07** Limits from config: `MEDIA_MAX_SIZE_MB`, `MEDIA_ALLOWED_TYPES` (default: a safe list of images, PDF, text and office formats) and an optional `MEDIA_TENANT_QUOTA_MB`. Over a limit: `MEDIA_TOO_LARGE`, `MEDIA_TYPE_REFUSED` or `MEDIA_QUOTA_EXCEEDED` (413 or 422), checked before a signed URL is given.
- **MED-08** Confirm emits `media.file.confirmed` with the id and the path, so a virus scanner (S-02, MAY) subscribes without a change here. Statuses are `pending`, `ready`, and `rejected` (a file that fails the sniffing, kept as a record for the audit).

Permissions: `media.read`, `media.upload`, `media.manage`.

## `audit-log` (slice S5)

- **AUD-01** Filters: `from` and `to`, `action` (exact or a prefix ending in `*`), `entity`, `recordId`, `actorId`, `requestId`. The list stays newest first with a keyset cursor.
- **AUD-02** `GET .../entries/:id` returns one entry. The list and the entry carry `actor` (`id`, `name`, `email`, or `null` for the system) read from the auth tables.
- **AUD-03** `GET /api/v1/audit-log/export?format=csv|ndjson` takes the same filters, streams the result by keyset pages and stops at `AUDIT_EXPORT_MAX_ROWS` (default 100 000) with a header that says it was cut. Permission `audit-log.export`. Cells that start with `=`, `+`, `-` or `@` are escaped (IO-04). The export is itself an audit entry.
- **AUD-04** `GET .../audit-log/actions` returns the distinct actions, cached for 60 seconds, for a filter control.
- **AUD-05** Reads follow the tenant of the request. A system administrator without a tenant sees every tenant. _To verify: the thin slice has no tenant filter._
- **AUD-06** Retention is the command `bieberkit audit:prune --before <date>` in the CLI, which runs with `MIGRATE_DATABASE_URL` (DATA-25), prints the count first, needs `--yes`, and writes its own entry. No route and no job of the application role deletes audit rows.

Permissions: `audit-log.read`, `audit-log.export`.

## Enterprise controls (slice S6, `[D]`)

Everything here is a policy with a safe default, an extension point or a CLI command. A policy is a setting of the `settings` plugin (group `security`, declared by `@bieberkit/auth`), changed in the admin without a restart. Controls that live inside Better Auth and need a restart (rate limits, the password rules of AUTH-04) stay in the boot config and are documented as such.

Policies (the default is in brackets, and is the value a single person gets):

- **POL-01** Sessions: `security.session.idleMinutes` (off), `security.session.absoluteHours` (the Better Auth lifetime), `security.session.maxConcurrent` (off; when set, the oldest session is revoked at sign in). Each can be overridden per role, and the strictest value of a user's roles wins. BieberKit enforces them itself in the authenticator, so a change takes effect on the next request.
- **POL-02** MFA: `security.mfa.requiredForAll` (off) on top of `requireMfa` of a role (AUTH-05), and `security.mfa.graceDays` (7): a user without a second factor may sign in for that many days after the policy starts, then must enrol. A user who is in grace sees `mfaEnrolBy` in `GET /users/me`.
- **POL-03** Network: `security.network.adminAllowlist` (empty, meaning no limit), a list of CIDR ranges. A role flagged `ipRestricted` can use a session only from those ranges. The client address is the trusted one of `TRUST_PROXY` (AUTH-10), and the check fails closed when no address is known. A refusal is audited (`AUTHZ-05`) as `auth.network.denied`.
- **POL-04** Sign-in notice: `security.signIn.notifyNewDevice` (on). A sign in from a device or country not seen for that user sends a notification and a mail (NTF-01) with the device and a link to revoke the session.
- **POL-05** Every policy has a validated range (for example a lifetime of at most 365 days), and a change that would lock out the person who makes it (an allowlist that excludes their own address, an MFA rule they do not meet) is refused with `SETTINGS_SELF_LOCKOUT` (409).

Identity hooks, so that SSO and SCIM plugins need no change here:

- **IDN-01** `bk_auth_users` gains `source` (`local` by default, or `sso:<provider>`, `scim:<provider>`) and `external_id`, unique per `source`, in the same step as BPL-01.
- **IDN-02** A user whose `source` is not `local` is managed by that provider: name, email, disabled state and role claims come from it. The `users` routes refuse to change them with `USERS_MANAGED_EXTERNALLY` (409), unless the call carries the permission `users.override-external`. Local roles can still be added.
- **IDN-03** The `user-service` exposes `upsertExternalUser` and `setExternalDisabled` for provider plugins. They write the same audit entries as a local change, with the provider as the actor.

Audit for an enterprise:

- **AUD-07** Mirror: `AUDIT_LOG_MIRROR=true` writes every audit entry, after commit, as one structured log line with `audit: true` through the logger (OBS-01, personal data redacted by SEC-09), so a log shipper delivers it to a SIEM or to storage that the database administrator cannot change. It rides the outbox, never the request.
- **AUD-08** Pull: `GET /api/v1/audit-log/entries?after=<id>` and the export of AUD-03 accept a resume cursor, so a SIEM that polls reads each entry once and in order.
- **AUD-09** Legal hold: `POST` and `DELETE /api/v1/audit-log/holds` (permission `audit-log.hold`) record a hold on an entity, a record or an actor, with a reason. `audit:prune` never deletes a row under a hold, and says how many it kept.

Delegated administration:

- **ROL-08** No privilege escalation: a person can create a role, change a role or assign a role only with permissions that they hold themselves. `roles.manage` is not enough on its own. Error `ROLES_ESCALATION` (403), audited as a failed authorization. The administrator role may do anything, and a system role is never assigned by anybody else.
- **ROL-09** `users.manage` can be given with a **scope**, for example only the users of one department. The scope is a scoped permission (`scopedPermissions`) over a `department` or `groupId` value that the project sets, so the plugin ships the hook and no organization model.

Operations for an enterprise:

- **OPS-01** Every route of the six plugins that sends mail or removes data accepts `Idempotency-Key` (§13.1).
- **OPS-02** Sensitive actions are rate limited per actor as well as per IP (AUTH-06): invites, resets, MFA reset, export and prune.
- **OPS-03** Settings can be exported and imported as JSON, `GET /api/v1/settings/export` and `POST .../import?dryRun=true`, so that a staging setup is reviewed and applied to production. A secret is exported as a hole and never as a value. This is the way settings follow the code through environments.
- **OPS-04** Media: the path of an object includes the tenant (`<visibility>/<tenant>/media/<id>/<name>`), so a tenant's files can be listed, exported, retained or deleted by prefix, and an access rule on the bucket can follow it. Downloads of private files are audited when `MEDIA_AUDIT_DOWNLOADS=true` (off).
- **OPS-05** Scale: each list route is tested with 100 000 rows (`USR`, `MED`, `AUD`) and its query plan must use an index (DATA-07). No route runs `COUNT(*)` unless `withTotal` is asked for.
- **OPS-06** Each plugin gets an operations section in `docs/modules/plugins.md`: what to back up, what each policy does, the audit action names, the retention knobs and how to run `audit:prune`.

## Errors

New stable codes (MOD-17), each with a one-line fix in the message: `AUTH_USER_DISABLED`, `USERS_LAST_ADMIN`, `USERS_SELF_ACTION`, `USERS_NOT_FOUND`, `USERS_CREATE_REFUSED` (kept), `ROLES_IN_USE`, `SETTINGS_UNKNOWN_KEY`, `SETTINGS_INVALID_VALUE`, `MEDIA_NOT_FOUND` (kept), `MEDIA_TOO_LARGE`, `MEDIA_TYPE_REFUSED`, `MEDIA_QUOTA_EXCEEDED`, `MEDIA_FOLDER_NOT_EMPTY`, `NOTIFICATIONS_NOT_FOUND`, `AUDIT_EXPORT_TOO_LARGE`, `ROLES_ESCALATION`, `USERS_MANAGED_EXTERNALLY`, `SETTINGS_SELF_LOCKOUT`, `AUTH_NETWORK_DENIED`, `AUTH_SESSION_EXPIRED`, `AUTH_MFA_ENROL_REQUIRED`.

## Configuration

New keys, declared by the plugins and validated at boot (CFG-01): `NOTIFICATIONS_RETENTION_DAYS` (90), `MEDIA_PENDING_TTL` (24h), `MEDIA_MAX_SIZE_MB`, `MEDIA_ALLOWED_TYPES`, `MEDIA_TENANT_QUOTA_MB` (optional), `AUDIT_EXPORT_MAX_ROWS` (100000), `USERS_INVITE_TTL` (7d), `AUDIT_LOG_MIRROR` (false), `MEDIA_AUDIT_DOWNLOADS` (false). The `security.*` policies are settings, not env keys, and the table of defaults is in `docs/modules/plugins.md` when S6 lands. New permissions of S6: `users.override-external`, `audit-log.hold`.

## Slices and order

| Slice | Content                          | Gate                                |
| ----- | -------------------------------- | ----------------------------------- |
| S0    | BPL-01 to BPL-04, IDN-01         | `[D]`: plan mode, tests shown first |
| S1    | `users`, `roles`, `user-service` | `[D]`: plan mode, tests shown first |
| S2    | `settings`                       | `[D]` only for the declaration      |
| S3    | `notifications`                  | none                                |
| S4    | `media`                          | none                                |
| S5    | `audit-log` and `audit:prune`    | none                                |

S3, S4 and S5 depend only on S0 and can run in any order after it. **S6** (the enterprise controls: POL, IDN, AUD-07 to AUD-09, ROL-08, ROL-09, OPS) depends on S1, S2 and S5, and is `[D]` like S1. IDN-01 is the exception: its columns go in the same migration step as BPL-01, so S0 carries it. ROL-08 is a security property of the role routes and is built with S1; S6 only adds its tests to the generated suite. Each slice is its own pull request with its own changeset.

## Tests

One test per requirement ID, named after it (`it('USR-07 refuses to disable the last administrator')`), through `createTestApp` with a real role, on PostgreSQL, MySQL and SQLite (`describeDialects`). On top of that:

- The generated permission and tenant tests of ADR 0013 cover every new route.
- `drift.test.ts` covers the new auth columns (BPL-01).
- A test for each invariant that is a security property: USR-07, SET-03 (a secret never leaves the API and never reaches the audit data), AUD-05, AUD-06, MED-02 (a private file has no public URL).
- A test that no write of these plugins calls mail, queue or storage inside its transaction.
- A test for each policy in both states: the default (a single person notices nothing) and a strict value (POL-01 to POL-05), including the lockout guard and a fail-closed check when the client address is unknown.
- OPS-05 at 100 000 rows on the three dialects, asserting the plan and a time bound that is generous enough for CI.
- A fixture "provider plugin" in the tests that calls `upsertExternalUser`, to prove IDN-01 to IDN-03 without writing SSO.
- The coverage gate of 80% for plugins stays, and the new `user-service` follows the 90% of `@bieberkit/auth`.

## Decisions of the maintainer

Taken on 2026-11-25 by accepting the recommendations of the first draft. Each is a decision of this design, and the two marked ADR need one before their code.

1. **BPL-01 and IDN-01 columns:** added to `bk_auth_users` through Better Auth's `additionalFields`. The S0 spike passed all 69 profile/table/drift cases and all 788 auth cases on three dialects, proving both the fields and drift checks work. The side-table fallback was not needed.
2. **SET-01 declaration:** a `settings` contribution key with `defineSetting` in `@bieberkit/core`, a `Parser` for `json` values and a typed read by the declaration object. Decided in [ADR 0030](../adr/0030-setting-declarations.md), accepted on 2026-11-26.
3. **Users and tenants:** in a tenant the list shows only the holders of a role in that tenant. A system administrator without a tenant sees all users.
4. **USR-06:** deleting a user **anonymizes** the row (`deleted-<id>@invalid`, name removed, `source` cleared) and removes the sessions, memberships and second factors, so foreign keys stay valid and the email is free again.
5. **MED-01:** visibility is fixed when the record is made.
6. **ROL-06:** deleting a role in use is refused, unless the call names a `reassignTo` role.
7. **Policy store (POL):** BieberKit enforces session, MFA and network policy in its own authenticator and reads it from `settings`, so no restart is needed. Rate limits and password rules stay in the boot config. It needs its **own ADR** in slice S6 (one decision for each ADR), because it makes `@bieberkit/auth` read `settings` through a port and not through the plugin.

## Decisions of slice S1

Taken by the maintainer on 2026-11-26, with the tests of S1:

1. `bk_auth_users` gains `last_sign_in_at` and `deleted_at` (auth 0.6.0). Sessions are deleted on revoke and expiry, so they cannot tell the last sign in.
2. The administrator role of USR-07 is the system role `admin`, counted in each tenant that has it.
3. `q` is a prefix of `lower(name)` or of the email, with an expression index on `lower(name)` on the three dialects.
4. The invitation is a link of Better Auth's own reset page, so there is one way to set a password (P1); using it verifies the email.
5. In role-service the actor comes from the request context; without one it is the system. In user-service the actor is an explicit `actorId`, as in S0.
6. The list sorts and filters by creation on the UUIDv7 id, because SQLite keeps the dates of Better Auth as text and those of MikroORM as numbers.
7. `ROLES_IN_USE` and `USERS_RATE_LIMITED` are `HttpError`s, so `memberCount` and `Retry-After` reach the answer. New codes besides the list above: `USERS_EMAIL_TAKEN`, `USERS_NOT_INVITED`, `USERS_RATE_LIMITED`, `USERS_MAIL_UNAVAILABLE`, `USERS_QUERY_INVALID`.
8. `/api/v1/users/me` is a public route that refuses an anonymous caller itself (API-02 asks for a permission or `public`).

## Left to the builder

The exact shape of the `user-service` functions, page size defaults, names of audit actions, whether `lastSignInAt` comes from the session table or a new column, how the policy port caches a read for the length of one request, and the wording of every message (each states what to do, AI-02).
