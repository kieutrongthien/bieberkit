<!--
  BieberKit

  @file        docs/adr/0021-tenants-are-ours.md
  @description ADR 0021: tenants and their members are ours, and the organization plugin of Better Auth is not loaded; the tenant is resolved for each request and never kept in the session.
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

# 0021. Tenants and their members are ours: no organization plugin

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and this one follows the requirements and the evidence above.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: AUTH-10, DATA-19, DATA-18, AUTHZ-01, AUTHZ-05

## Context

AUTH-10 says that "Better Auth's active organization is set per request from the resolved tenant (DATA-19) and never persisted in the session". The roadmap kept it open "until the spike of the organization plugin". The spike is a reading of what the plugin brings (`better-auth` 1.7.25, `dist/plugins/organization`) against what the project already has.

The plugin adds five tables (`organization`, `member`, `invitation`, `team`, `teamMember`), its own roles and its own access control, and `activeOrganizationId` on the session: the "active" organization is a field that the session keeps, and `setActiveOrganization` writes it.

The project already has:

- tenants as a column that the data layer filters and writes (DATA-18, `runAsTenant`, the tenant filter), and a tenant resolved once for each request from `X-Tenant`, the API key or the domain, checked against the memberships of the user (DATA-19, `createTenantResolver`);
- the memberships and the roles of a user as data of ours, one set for each tenant: `auth_roles`, `auth_role_permissions` and `auth_user_roles` (AUTHZ-01), with a service that audits every change (AUTHZ-05).

## Options

| Option                                                        | For                                                                        | Against                                                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. No organization plugin. The tenant is ours and per request | One source of truth for tenants, members and roles. Nothing in the session | Invitations and a screen of members are ours to write, on the role service                                                                                                                                 |
| B. The plugin as the store of tenants and members             | Invitations and member routes come with it                                 | A second set of tables for what `auth_user_roles` already says, and two sets of roles. Its active organization is in the session, which is the thing that AUTH-10 and DATA-19 forbid: two tabs would cross |
| C. The plugin for invitations only                            | Less code for invitations                                                  | It cannot be used without its `organization` and `member` tables, so it is B                                                                                                                               |

## Decision

Option A. Better Auth does not load the organization plugin. A tenant is a row that the data layer filters, and a member of a tenant is a user with a role in it (`auth_user_roles`). The resolved tenant is a property of the request and is never written to the session: `auth_sessions` has no column for a tenant or an organization, and a test says so. The intent of AUTH-10 is met without the plugin: nothing is "active" for a session, so there is nothing to persist.

Invitations and the list of members are features of the `auth` plugin built on the role service (they send a mail through `@bieberkit/mail` and call `assignRole`), and they belong to the admin of M1.8 and to Phase 2.

## Consequences

- Easier: one model of tenants, one of roles, and nothing that can disagree with the other. No table of the plugin to keep in step with Better Auth upgrades, and the drift check has less to compare.
- Harder: invitations are ours to write. A project that wants the organization features of Better Auth would have to write the adapter between its tables and ours, and this ADR would be superseded.
- Ruled out: an "active tenant" kept in a session or a cookie.

## Spec changes

- AUTH-10: the sentence about the active organization says that no organization plugin is loaded and that the tenant is resolved for each request (DATA-19). Done in this series.
