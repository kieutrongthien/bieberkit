<!--
  BieberKit

  @file        docs/modules/testing.md
  @description Module spec of @bieberkit/testing: the test app, factories, callers with roles and tenants, the generated contract tests and the guard on the network.
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

# @bieberkit/testing

- Package: `@bieberkit/testing`
- Layer: product (it may import every contract package)
- Spec sections: 21 (TST-01, TST-02, TST-03), AUTHZ-01, DATA-18
- Status: **Prepared on 2026-11-24.** The permission tests that this package generates for an entity are `permissionMatrix` of `@bieberkit/auth/testing` (M1.4), which this package does not copy.

## Purpose

Lets a project test its modules the way a client uses them: boot the modules over a real database, call the API as a user with roles in a tenant, make rows that are valid without writing their fields, and get the validation and pagination tests of every entity without writing them. A test that reaches outside the machine fails.

## Public API

```ts
createTestApp({ modules?, entities?, roles?, open?, tenant? }): Promise<TestApp>
interface TestApp {
  db; server; queue; schemas; entities; authorizer; logger; tenant
  newUser(): TestUser                                  // { id }
  actingAs(user: TestUser | string, roles?: string[]): Promise<Client>
  anonymous(): Client
  withTenant(tenant: string): TestApp                  // the same app, callers and factories in another tenant
  factory(entity): Factory                             // build(overrides?), create(overrides?), createMany(n, overrides?)
  close(): Promise<void>
}
interface Client { get, post, patch(url, body, version), delete(url, version) }   // each answers { status, headers, body }

describeEntityContracts({ modules, open?, values?, only? })   // registers the validation and pagination tests
describeDialects(name, ({ dialect, open }) => { ... })        // SQLite, and PostgreSQL and MySQL when their URLs are provided
openMemoryDatabase                                            // the default `open`
installNetworkGuard({ allow? }): () => void                   // TST-03; the repository installs it for every test file
// module contributions added by the packages: entities (data), routes (http)
```

## Rules

1. **The app is the real thing.** `createTestApp` compiles the entities of the modules, makes the framework tables and the auth tables with their migration steps and the tables of the entities from the schema, boots the HTTP server with the real authorizer, registers the routes of the entities and of the modules, and makes a queue on the `sync` driver for the jobs of the modules. The only fakes are the ones that put a user and a tenant in a request: two headers that the test authenticator and tenant resolver read. The audit goes to the table, so a test can read it.
2. **Roles are real.** `actingAs(user, ['sales'])` makes the role `sales` in the tenant of the view once, from `options.roles`, with `createRole` and `assignRole` of auth, and gives it to the user. `admin` exists in every app and holds every permission that the entities declare. A role that is not declared is `TEST_ROLE_UNKNOWN`, and its fix lists the roles that are. A user with no roles gets 403 where a permission is needed, and an anonymous caller gets 401.
3. **A tenant is a view.** `withTenant(id)` is the same database and server, and its callers, its factories and its roles are those of `id`. The same user is a different caller there, with the roles that were given in that tenant. `app.withTenant(app.tenant)` is `app`.
4. **A factory makes valid rows.** `build` is a body that the create schema of the entity accepts, for every kind of field, with values that differ at each call so that unique fields do not collide. A field that may be left out (optional, with a default, or filled by the server) is left out, and an override wins. A relation is not in `build`, because its parent has to be stored first. `create` stores the row through the ORM in the tenant of the view, makes the required parents with their own factories, and answers the row as the API shows it. A `custom` field has no sample, and the error names the override that is needed.
5. **Generated tests (section 21).** `describeEntityContracts` registers, for each entity of the modules that has an API: the sample body is accepted (so a refusal is the fault of its change), an unknown field is refused, each field refuses what its definition forbids (missing, null, too long, too short, under the minimum, over the maximum, the wrong type, a value that is not listed, an address that is not one, a day that does not exist...), what the server fills cannot be set, an update refuses the same and an empty body, and a list gives 25 rows and a cursor, follows the cursor to the end without a gap or a repeat, cuts a page size above 100, and refuses a page size of 0, a negative one, a fraction, text, an empty one, a page before the first, a cursor that is not one, a page with a cursor, and a page deeper than 10 000 rows. The cases come from the definition (`invalidCasesOf`), so a new field gets its tests with no edit.
6. **Every dialect (TST-03).** `describeDialects` runs a suite on SQLite always and on PostgreSQL and MySQL when `dialectUrls` is provided by the vitest config. With `BK_REQUIRE_DIALECTS=all` a missing URL fails the run, so a CI that forgot its services cannot pass. The servers are containers that the project starts (`tools/test-services.sh` here, `services` in CI), and the helper makes one database for each test and drops it after the suite.
7. **No network outside the machine (TST-03).** `installNetworkGuard` replaces `net.Socket#connect`, which `fetch`, `http`, `https`, the database drivers and the Redis client all use, so a connection to a host that is not `localhost`, `127.0.0.0/8` or `::1` fails with `TEST_NETWORK_BLOCKED` before a name is looked up. A path (a local socket) is let through. Hosts of a CI network are named in the allow list (`TEST_NETWORK_ALLOW` for this repository). The newest guard decides alone.
8. **Quiet.** The app logs to `app.logger.lines`, so a run prints nothing and a test can read what was logged.
9. **Out of scope.** Playwright and the browser tests (M1.8), generated tests of tenant isolation beyond the permission matrix, a test clock, and a mock of the mail transport (the memory transport of `@bieberkit/mail` does that).

## Tests

`factory.test.ts` (values valid for every kind of field, uniqueness, parents, tenants, the custom field, an unknown entity), `app.test.ts` on every dialect (boot, roles, `admin`, tenants, conditions, the quiet logger), `contract.test.ts` (the generated tests of the sample module, 147 cases, and the cases that they are made of), `network-guard.test.ts` (a call outside the machine fails, the machine and a local socket are let through, the allow list, taking the guard away).
