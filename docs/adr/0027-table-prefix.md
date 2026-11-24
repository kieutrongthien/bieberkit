<!--
  BieberKit

  @file        docs/adr/0027-table-prefix.md
  @description ADR 0027: one prefix, bk_, for every table that the framework and its first-party plugins own, and the names that changed.
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

# 0027. One prefix for every table of the framework: `bk_`

- Status: Accepted
- Accepted: 2026-11-24, by the maintainer, who asked for it.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: DATA-28 (new), DATA-24, PKG-01

## Context

The tables that the framework and its plugins make had three styles: `bieberkit_` (the migrations, the outbox, the sequences, the features), none (`audit_log`, `auth_users`, and `settings_settings`, `media_media`, `notifications_notifications` of the plugins), and `bk_` (`bk_jobs`, `bk_locks`). A person who reads a database could not tell whose table it was, and a project that named a module `auth` or `audit` could collide with the framework.

## Decision

Every table that the framework or a first-party plugin owns starts with `bk_`, and so do its indexes, keys and constraints. The tables of a project keep the name of their module (`crm_deals`). Nothing is released yet, so there is no migration of data: the steps and the schemas say the new names, and a database that was made by a development build is made again.

| Before                                                                                                                                                                                                   | After                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `bieberkit_migrations`, `bieberkit_plugin_migrations`, `bieberkit_migration_lock`                                                                                                                        | `bk_migrations`, `bk_plugin_migrations`, `bk_migration_lock` |
| `bieberkit_outbox`, `bieberkit_outbox_processed`                                                                                                                                                         | `bk_outbox`, `bk_outbox_processed`                           |
| `bieberkit_sequences`                                                                                                                                                                                    | `bk_sequences`                                               |
| `bieberkit_comments`, `bieberkit_attachments`, `bieberkit_timeline`, `bieberkit_tags`                                                                                                                    | `bk_comments`, `bk_attachments`, `bk_timeline`, `bk_tags`    |
| `audit_log`                                                                                                                                                                                              | `bk_audit_log`                                               |
| `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, `auth_two_factors`, `auth_passkeys`, `auth_api_keys`, `auth_rate_limits`, `auth_roles`, `auth_role_permissions`, `auth_user_roles` | the same names after `bk_auth_` instead of `auth_`           |
| `settings_settings`, `notifications_notifications`, `media_media`                                                                                                                                        | `bk_settings`, `bk_notifications`, `bk_media`                |
| `bk_jobs`, `bk_locks`                                                                                                                                                                                    | unchanged                                                    |

The names of the entities of the framework (`bieberkit.AuthRole`, `bieberkit.OutboxEntry`) are not table names and do not change.

## Options

| Option                                                       | For                                                                      | Against                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A. `bk_` for everything that is not the project's            | One rule, short, already used by the queue, the metrics and the API keys | A rename now, in about 50 files                                                           |
| B. Keep `bieberkit_` for the core and no prefix for the rest | No change                                                                | Three styles, and a table that is not marked                                              |
| C. `bieberkit_` for everything                               | Spelled out                                                              | Long: the indexes of `bieberkit_outbox_processed` reach the limit of 63 characters sooner |

## Consequences

- The earlier ADRs (0008 to 0013) and the changesets that name the old tables are left as they were written: an accepted ADR is not edited. Their names map to the table above.
- `bk_` is now reserved for the framework and its plugins in the spec (DATA-28). A project entity that uses it is not refused yet. A rule of `bieberkit check` can do that when it matters.
- A project made with a development build has to be made again, or have its tables renamed by hand.

## Spec changes

- Section 9: DATA-28 is new, and the names of the tables in the text follow the table above.
