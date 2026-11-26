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

- Packages: `@bieberkit/plugin-users`, `-roles`, `-settings`, `-audit-log`, `-notifications`, `-media` (folders `plugins/<name>`). `auth-ui` joins them with the admin.
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

| Plugin                     | Tables                    | Routes                                                                                                                                                                                                                                                                                                        | Permissions                                                                                                                                 | Seed                                                                                                                                                                                                                          |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles`                    | none (the tables of auth) | `GET/POST /api/v1/roles/roles`, `GET/PATCH/DELETE .../:id` (`?reassignTo=`), `GET .../:id/members`, `POST .../:id/assign`, `.../:id/revoke` (batches of `userIds`), `.../:id/duplicate`, `GET /api/v1/roles/permissions` (ROL-01 to ROL-08)                                                                   | `roles.read`, `roles.manage`                                                                                                                | The role `admin` (a system role, with every permission of the project, and growing with it) and `staff` (every `*.read`)                                                                                                      |
| `users` (requires `roles`) | none (the tables of auth) | `GET/POST /api/v1/users/users`, `GET/PATCH/DELETE .../:id`, `POST .../:id/disable`, `.../enable`, `.../reset-password`, `.../resend-invite`, `.../mfa/reset`, `GET/DELETE .../:id/sessions`, `DELETE .../:id/sessions/:sessionId`, `GET .../:id/permissions`, `GET/PATCH /api/v1/users/me` (USR-01 to USR-12) | `users.read`, `users.manage`, `users.revoke-sessions`, `users.reset-mfa`                                                                    | The administrator account from `USERS_ADMIN_EMAIL` (default `admin@example.com`) and `USERS_ADMIN_PASSWORD`, with the role `admin`. No password, no account. `USERS_INVITE_TTL_DAYS` (default 7) is the life of an invitation |
| `settings`                 | `bk_settings`             | The entity routes of `settings.Setting`                                                                                                                                                                                                                                                                       | `settings.read`, `settings.manage`                                                                                                          | none                                                                                                                                                                                                                          |
| `audit-log`                | none (`bk_audit_log`)     | `GET /api/v1/audit-log/entries`, newest first, filters `action`, `entity`, `actorId`, `recordId`, keyset cursor                                                                                                                                                                                               | `audit-log.read`                                                                                                                            | none                                                                                                                                                                                                                          |
| `notifications`            | `bk_notifications`        | The entity routes of `notifications.Notification`                                                                                                                                                                                                                                                             | `notifications.read`, `.update`, `.manage`, and the scoped `notifications.read-own` and `.update-own` (`userId` is the user of the request) | none                                                                                                                                                                                                                          |
| `media`                    | `bk_media`                | The entity routes of `media.Media`, `POST .../:id/upload-url` (a signed URL, S-01) and `POST .../:id/confirm` (the storage checks the bytes and deletes a file that fails, S-02)                                                                                                                              | `media.read`, `.upload`, `.manage`                                                                                                          | none                                                                                                                                                                                                                          |

## Operations of users and roles (S1)

- Back up the auth tables (`bk_auth_*`): users, roles and memberships live there. A deleted user stays as an anonymized row so that audit actors and `created_by` ids stay valid.
- Audit actions: `users.user.created`, `.invited`, `.updated`, `.disabled`, `.enabled`, `.deleted`, `.sessions-revoked`, `.password-reset-sent`, `.mfa-reset`, and `auth.role.created`, `.updated`, `.deleted`, `.assigned`, `.revoked`; a refused escalation is `authz.denied`.
- The mails that an administrator sends for a user (reset, invitation, MFA reset) are limited to 3 per user and 20 per administrator in 15 minutes, in `bk_auth_rate_limits`.
- The last active holder of `admin` cannot be disabled, deleted or lose the role. To hand a project over, give `admin` to the new person first.

## Decisions

1. **The tables of a plugin entity are in the migrations of the project.** `migrate:make` diffs every entity of every module against the snapshot, so a plugin's tables arrive in the migration of the project that installs it, and `bieberkit remove` drops them in one (PLG-03). A plugin that must not own the table (users, roles and the audit log live in tables of the framework) gives routes over them and no entity.
2. **The administrator is a seed, not a migration.** The seed reads the password from the environment, makes the account through Better Auth (so the hash and the audit are the ones of a sign up), and gives the system role. `create` writes a random `USERS_ADMIN_PASSWORD` in `.env` (any key of a plugin that ends in `_PASSWORD`, `_SECRET`, `_TOKEN` or `_KEY` gets one), and `.env.example` never shows it (CFG-06).
3. **The administrator role grows with the project.** A system role cannot be changed through the role service. The seed of `roles` adds the permissions that a plugin brought since the last run, with an audit entry, so installing a plugin and running `db:seed` is enough.
4. **The manifest of each plugin is bundled in `create-bieberkit`.** H1 generates the `bieberkit` field of every first-party `package.json` and `packages/create/src/scaffold/plugin-index.ts` from the plugin definitions. Definitions read their authoritative package version. `pnpm manifests:write` generates both, `pnpm check:manifests` detects drift without writing, and `tools/templates.test.ts` checks the committed package metadata, index and graph. The scaffolder resolves the static index without importing plugin runtime code. A normal plugin build refreshes its own field; the repository build refreshes the full index. See `docs/modules/plugin-hardening.md` and the plugin build section of `docs/modules/cli.md`.

## Tests

One file for each plugin over `createTestApp` (the API as a user calls it, with roles), `tools/templates.test.ts` (the bundled index and the graph), and `packages/cli/src/blank.test.ts`, which is the test of the milestone: `migrate:make`, `migrate`, `db:seed`, a booted web role, the sign in of the administrator and the list of users.
