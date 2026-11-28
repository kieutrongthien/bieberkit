<!--
  BieberKit

  @file        docs/modules/plugins.md
  @description Module spec of the base plugins of the blank template: users, roles, settings, audit-log, notifications and media, and the services that they read from the container.
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

# The base plugins

- Packages: `@bieberkit/plugin-users`, `-roles`, `-settings`, `-audit-log`, `-notifications`, `-media` (folders `plugins/<name>`). There is no `auth-ui` plugin: the account screens belong to `users`. Each plugin gets an admin part, `src/admin/`, exported as `./admin` ([plugin-admin.md](plugin-admin.md), ADR 0040).
- Layer: plugins (they may import every other layer, and nothing imports them)
- Spec sections: 11, 12, AUTH-01, AUTH-04, AUTHZ-01, AUTHZ-05, OBS-05, S-01, S-02, DATA-24
- Status: **Done in M1.8.**

## Purpose

The base that every management app needs, so that `create bieberkit` gives a project that signs an administrator in and manages users, roles, settings, notifications and files from the first run. A plugin is a dependency of the project and is never copied into it (PLG-01). Each plugin is one `definePlugin` as the default export of its main file.

## What the plugins read

A route handler and a seed read what they need from the container, never from the process (P8). The server registers these services for every role, and `createTestApp` registers the same ones in memory:

| Service       | Type                      | What it is                                                                                   |
| ------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `config`      | `CoreEnv`                 | The validated environment of core                                                            |
| `pluginEnv`   | `Record<string, unknown>` | The validated values of the env keys that plugins declare (`USERS_ADMIN_EMAIL`)              |
| `database`    | `Database`                | The connection of the application, with its tenant filter, audit and outbox                  |
| `auth`        | `AuthInstance`            | Better Auth over that database (`signUpEmail`, sessions)                                     |
| `permissions` | `readonly string[]`       | Every permission of the entities, the routes, the plugins and the scoped permissions, sorted |
| `storage`     | `Storage`                 | The disk of `STORAGE_DISK` behind the policy of S-01 and S-02                                |
| `mail`        | `Mail`                    | Queued mail through the configured transport; memory transport in the test app               |
| `queue`       | `Queue`                   | Job dispatch for every role; only worker/dev starts a worker and outbox loop                 |
| `cache`       | `Cache`                   | The configured cache; memory engine in the test app                                          |

`RouteContext.services` is the same registry, so a route handler writes `ctx.services.database`. A plugin contributes its own through `services`, as any module does. The steps of a plugin go through the module key `migrations` (DATA-24), and `check plugin-steps` reads them.

## Platform services and contributions (S0)

`definePlugin({ services })` already uses the module container. A plugin declares its service type by augmenting `ServiceRegistry` from `@bieberkit/core`, registers a singleton with `services: { greeter: { scope: 'singleton', create: () => value } }`, and a consumer reads `ctx.services.greeter`. No new `definePlugin` API is needed. Two owners of the same service name fail at boot with `CORE_SERVICE_DUPLICATE` (BPL-03).

A module contributes both `jobs` and `subscriptions` from `@bieberkit/queue`. Each subscription names an event and its job, with an optional `map(message)`; duplicate event mappings fail rather than overwrite one another. Only worker/dev starts the dispatcher, while web can enqueue without running work. Seeders get the same services. `createTestApp` uses a sync queue, `mailbox` and explicit `runOutbox()` calls for deterministic tests (BPL-02, BPL-04).

The complete plugin behavior is tracked separately in [base-plugins-complete.md](base-plugins-complete.md) and M1.11; this platform slice does not mark those later slices complete.

## The plugins

| Plugin                     | Tables                                            | Routes                                                                                                                                                                                                                                                                                                                                                                                                      | Permissions                                                                                         | Seed                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles`                    | none (the tables of auth)                         | `GET/POST /api/v1/roles/roles`, `GET/PATCH/DELETE .../:id` (`?reassignTo=`), `GET .../:id/members`, `POST .../:id/assign`, `.../:id/revoke` (batches of `userIds`), `.../:id/duplicate`, `GET /api/v1/roles/permissions` (ROL-01 to ROL-08)                                                                                                                                                                 | `roles.read`, `roles.manage`                                                                        | The role `admin` (a system role, with every permission of the project, and growing with it) and `staff` (every `*.read`)                                                                                                                                 |
| `users` (requires `roles`) | none (the tables of auth)                         | `GET/POST /api/v1/users/users`, `GET/PATCH/DELETE .../:id`, `POST .../:id/disable`, `.../enable`, `.../reset-password`, `.../resend-invite`, `.../mfa/reset`, `GET/DELETE .../:id/sessions`, `DELETE .../:id/sessions/:sessionId`, `GET .../:id/permissions`, `PUT .../:id/groups`, `GET/PATCH /api/v1/users/me` (USR-01 to USR-12, ROL-09)                                                                 | `users.read`, `users.manage`, `users.revoke-sessions`, `users.reset-mfa`, `users.override-external` | The administrator account from `USERS_ADMIN_EMAIL` (default `admin@example.com`) and `USERS_ADMIN_PASSWORD`, with the role `admin`. No password, no account. `USERS_INVITE_TTL_DAYS` (default 7) is the life of an invitation                            |
| `settings`                 | `bk_settings` (one value for each scope and key)  | `GET /api/v1/settings/settings`, `GET/PUT/DELETE .../settings/:key`, `GET /api/v1/settings/public`, `GET /api/v1/settings/export`, `POST .../import` (SET-01 to SET-07, OPS-03); no entity routes                                                                                                                                                                                                           | `settings.read`, `settings.manage`                                                                  | none. It declares `settings.site.name`, `.locale` and `.logo` (public) and serves the `settings` service                                                                                                                                                 |
| `audit-log`                | none (`bk_audit_log`, `bk_audit_holds`)           | `GET /api/v1/audit-log/entries` (filters `from`, `to`, `action` exact or `prefix*`, `entity`, `recordId`, `actorId`, `requestId`; keyset), `GET .../entries/:id` (with `actor`), `GET .../export?format=csv\|ndjson`, `GET .../actions` (AUD-01 to AUD-05), `after=` for a SIEM, `GET/POST /api/v1/audit-log/holds`, `DELETE .../holds/:id` (AUD-08, AUD-09); retention is `bieberkit audit:prune` (AUD-06) | `audit-log.read`, `.export`, `.hold`                                                                | none. It reads `AUDIT_LOG_EXPORT_MAX_ROWS` (default 100 000) and `AUDIT_LOG_MIRROR` (default off), and runs the job `audit-log.mirror`                                                                                                                   |
| `notifications`            | `bk_notifications`, `bk_notification_preferences` | `GET/DELETE /api/v1/notifications/notifications` (support), `POST /api/v1/notifications/send`, `GET /api/v1/notifications/me`, `.../me/unread-count`, `POST .../me/:id/read`, `.../me/read-all`, `DELETE .../me/:id`, `GET/PUT .../me/preferences` (NTF-01 to NTF-07)                                                                                                                                       | `notifications.read`, `.manage`, `.send`, and the scoped `.read-own`, `.update-own`, `.delete-own`  | none. It serves the `notifier` service, the jobs `notifications.expand` and `notifications.prune`, and `NOTIFICATIONS_RETENTION_DAYS` (default 90)                                                                                                       |
| `media`                    | `bk_media`, `bk_media_folders`                    | `GET/POST /api/v1/media/media`, `GET/PATCH/DELETE .../:id`, `POST .../:id/upload-url`, `.../:id/confirm`, `GET .../:id/url`, `.../:id/content`, `GET/POST /api/v1/media/folders`, `PATCH/DELETE .../folders/:id` (MED-01 to MED-08); no entity routes                                                                                                                                                       | `media.read`, `.upload`, `.manage`                                                                  | none. It serves the `media` service, the jobs `media.delete-object` and `media.prune-pending`, and `MEDIA_MAX_SIZE_MB` (25), `MEDIA_ALLOWED_TYPES`, `MEDIA_TENANT_QUOTA_MB` (optional), `MEDIA_PENDING_TTL_HOURS` (24) and `MEDIA_AUDIT_DOWNLOADS` (off) |

## Operations of users and roles (S1)

- Back up the auth tables (`bk_auth_*`): users, roles and memberships live there. A deleted user stays as an anonymized row so that audit actors and `created_by` ids stay valid.
- Audit actions: `users.user.created`, `.invited`, `.updated`, `.disabled`, `.enabled`, `.deleted`, `.sessions-revoked`, `.password-reset-sent`, `.mfa-reset`, and `auth.role.created`, `.updated`, `.deleted`, `.assigned`, `.revoked`; a refused escalation is `authz.denied`.
- The mails that an administrator sends for a user (reset, invitation, MFA reset) are limited to 3 per user and 20 per administrator in 15 minutes, in `bk_auth_rate_limits`.
- The last active holder of `admin` cannot be disabled, deleted or lose the role. To hand a project over, give `admin` to the new person first.

## Settings (S2)

- A setting is declared with `defineSetting` of `@bieberkit/core` and contributed as `settings: [...]` by a plugin or a module (ADR 0030). A plugin's keys start with its short name and a dot.
- Code reads a value with `services.settings.get(def, { tenantId })`, typed by the declaration. Reads are cached under the tag `settings` and flushed after commit. A secret is never cached, never returned by the routes and never put in audit data.
- A `tenant` setting falls back to the global value, then to the default. A `global` setting is changed only outside a tenant (`SETTINGS_SCOPE_REFUSED`).
- Back up `bk_settings` with the database. Secret values are encrypted with `APP_KEY`; keep `APP_KEY_PREVIOUS` through a rotation.
- Audit actions are `settings.setting.updated` and `settings.setting.reset`.

## Notifications (S3)

- Other plugins send with `services.notifier.send(...)`, inside their own transaction, so a notification commits with the write it is about.
- Give users a role with `notifications.read-own`, `.update-own` and `.delete-own` so they reach `/me`. Support needs `notifications.send` to send, and `notifications.manage` to delete.
- The scheduler role runs `notifications.prune` daily at 03:17 UTC; the retention is `NOTIFICATIONS_RETENTION_DAYS`.
- Audit actions are `notifications.notification.sent`, `.read`, `.read-all`, `.deleted`, `.pruned`, and `notifications.preferences.updated`.

## Security policies (S6)

The policies are settings of the group `security`, declared by `@bieberkit/auth`, changed in `PUT /api/v1/settings/settings/:key` or the admin, and read by the authenticator within two seconds, with no restart (ADR 0031). Rate limits and the password rules stay in the boot config. The default is what a single person gets.

| Key                                  | Default                  | What it does                                                                                                                                           |
| ------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `security.session.idle-minutes`      | 0 (off)                  | Ends a session with no request for this long (`AUTH_SESSION_EXPIRED`)                                                                                  |
| `security.session.absolute-hours`    | 0 (Better Auth lifetime) | Ends a session this long after sign in, at most 8760                                                                                                   |
| `security.session.max-concurrent`    | 0 (off)                  | At sign in the oldest sessions beyond this number are revoked                                                                                          |
| `security.mfa.required-for-all`      | off                      | Every user needs a second factor, on top of `requireMfa` of a role. Turning it on stamps `security.mfa.required-since`                                 |
| `security.mfa.grace-days`            | 7                        | Days to enrol after the rule starts; `GET /users/me` shows `mfaEnrolBy`; then `AUTH_MFA_ENROL_REQUIRED`                                                |
| `security.network.admin-allowlist`   | empty (no limit)         | CIDR ranges that a role flagged `ipRestricted` may use. An unknown client address is refused (`AUTH_NETWORK_DENIED`, audited as `auth.network.denied`) |
| `security.sign-in.notify-new-device` | on                       | Mails a user when their account is used from a device that is new to them                                                                              |

- A change that would lock the person out is refused with `SETTINGS_SELF_LOCKOUT`: an allowlist without their address, or the rule for everyone while they have no second factor. Behind a proxy set `TRUST_PROXY`, or every request looks like the proxy.
- A role is flagged with `ipRestricted` on `POST` and `PATCH /api/v1/roles/roles`. The administrator role should not be flagged until the allowlist is tested.
- Back up `bk_auth_known_devices` with the auth tables; losing it only makes every device new once.

## Managed identities and groups (S6)

- A provider plugin calls `upsertExternalUser` and `setExternalDisabled` of the user service. A user with `source` other than `local` cannot be renamed, re-mailed, disabled or enabled through the routes (`USERS_MANAGED_EXTERNALLY`) unless the caller holds `users.override-external`. Give that permission to the few people who repair accounts.
- Groups: `PUT /api/v1/users/users/:id/groups` or `groups` when a user is made. Give a role for one group with `groupId` on `POST /api/v1/roles/roles/:id/assign`. A manager whose roles are all limited to groups reaches the users of those groups only. To change the scope of an assignment, revoke the role and assign it again.
- Audit actions: `users.user.groups-changed`, and for providers the same `users.user.created`, `.updated`, `.disabled`, `.enabled` with `data.provider`.

## Audit for an enterprise (S6)

- `AUDIT_LOG_MIRROR=true` copies every entry to the log, after commit, as one line with `audit: true` (the worker job `audit-log.mirror`). Point a log shipper at lines with that field. Entries already have personal data masked.
- A SIEM polls `GET /api/v1/audit-log/entries?after=<id>` or the export with `after`, and resumes from `meta.nextAfter`.
- Legal holds: `POST /api/v1/audit-log/holds` with `entity`, `recordId` or `actorId` and a `reason`; `DELETE .../holds/:id` releases. `bieberkit audit:prune --before <date>` keeps held entries and prints how many. At most 200 active holds. Back up `bk_audit_holds` with `bk_audit_log`; the application role needs `select`, `insert` and `update` on it, which the deploy grants give as for any other table.
- Audit actions: `audit-log.hold.placed`, `.released`, `audit-log.entries.exported`, `audit.pruned` (with `kept`).
- Exports are limited to 10 per person in 15 minutes (`AUTH_ACTION_LIMITED`).

## Operations of settings, media and lists (S6)

- Settings follow the code through environments: `GET /api/v1/settings/export` on staging, review the file, `POST /api/v1/settings/import?dryRun=true` on production, then without `dryRun`. A secret is a hole in the file and is never imported; any invalid entry refuses all of it (`SETTINGS_IMPORT_INVALID`).
- Media objects live at `<visibility>/<tenant>/media/<id>/<name>`, so a tenant's files can be listed, exported, retained or deleted by prefix. `MEDIA_AUDIT_DOWNLOADS=true` writes `media.file.downloaded` when a private file is read (default off).
- Mail and delete routes of the plugins take `Idempotency-Key`. Invitations are limited per administrator (20 in 15 minutes).
- The lists of users, media and the audit log are tested at 100 000 rows on the three dialects: the plan of each filter must not read the whole table, and no list runs `COUNT(*)` unless `withTotal` is asked for. After a bulk load run `ANALYZE` so that the planner knows the size.

## Decisions

1. **The tables of a plugin entity are in the migrations of the project.** `migrate:make` diffs every entity of every module against the snapshot, so a plugin's tables arrive in the migration of the project that installs it, and `bieberkit remove` drops them in one (PLG-03). A plugin that must not own the table (users, roles and the audit log live in tables of the framework) gives routes over them and no entity.
2. **The administrator is a seed, not a migration.** The seed reads the password from the environment, makes the account through Better Auth (so the hash and the audit are the ones of a sign up), and gives the system role. `create` writes a random `USERS_ADMIN_PASSWORD` in `.env` (any key of a plugin that ends in `_PASSWORD`, `_SECRET`, `_TOKEN` or `_KEY` gets one), and `.env.example` never shows it (CFG-06).
3. **The administrator role grows with the project.** A system role cannot be changed through the role service. The seed of `roles` adds the permissions that a plugin brought since the last run, with an audit entry, so installing a plugin and running `db:seed` is enough.
4. **The manifest of each plugin is bundled in `create-bieberkit`.** H1 generates the `bieberkit` field of every first-party `package.json` and `packages/create/src/scaffold/plugin-index.ts` from the plugin definitions. Definitions read their authoritative package version. `pnpm manifests:write` generates both, `pnpm check:manifests` detects drift without writing, and `tools/templates.test.ts` checks the committed package metadata, index and graph. The scaffolder resolves the static index without importing plugin runtime code. A normal plugin build refreshes its own field; the repository build refreshes the full index. See `docs/modules/plugin-hardening.md` and the plugin build section of `docs/modules/cli.md`.

## Tests

One file for each plugin over `createTestApp` (the API as a user calls it, with roles), `tools/templates.test.ts` (the bundled index and the graph), and `packages/cli/src/blank.test.ts`, which is the test of the milestone: `migrate:make`, `migrate`, `db:seed`, a booted web role, the sign in of the administrator and the list of users.
