<!--
  BieberKit

  @file        docs/modules/auth.md
  @description Module spec of @bieberkit/auth: slice A, authorization with roles as data, CASL abilities, the condition translator, row scope and field masks (M1.4).
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

# @bieberkit/auth

- Package: `@bieberkit/auth`
- Layer: contracts (it may import `@bieberkit/core`, `@bieberkit/data` and `@bieberkit/http`)
- Spec sections: 14 (authentication and authorization), 7.5, 21, ADR 0012, ADR 0013
- Status: **Slice A (authorization) is implemented on 2026-11-23**, on the branch `feat/auth-design`, after the maintainer delegated the open decisions to the engineer (all six points under "Found while writing the tests" were accepted). Slices B and C are not started.

## Purpose

Decides what a signed-in caller may do: which routes, which rows, which fields. Better Auth (who the caller is) is slice B of M1.4 and plugs in through the ports of `@bieberkit/http`. Slice A works with any `Authenticator`.

## Slicing of M1.4

| Slice                   | Content                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **A. Authorization**    | This document                                                                                        |
| B. Authentication       | Better Auth over the Kysely of the request, auth tables, cookie, client IP, rate limits, drift check |
| C. Strong auth and keys | TOTP, passkeys, magic link, `requireMfa`, API keys, `encrypted: true` fields, `pii` log redaction    |

## Public API (slice A)

```ts
// the permissions that the entities declare
buildPermissionRegistry(entities: readonly EntityDef<string>[]): PermissionRegistry
type Action = 'read' | 'create' | 'update' | 'delete' | `transition:${string}`
interface PermissionEntry { permission: string; subject: string; action: Action; field?: string; fieldAccess?: 'read' | 'update' }
interface PermissionRegistry { entries: readonly PermissionEntry[]; entriesOf(permission: string): readonly PermissionEntry[] }

// a permission that carries a condition (code, section 14.2)
interface ScopedPermission { subject: string; action: Action; when(user: AbilityUser): Condition }
type Condition = Record<string, unknown>         // CASL conditions of ADR 0013: eq, ne, in, nin, gt, gte, lt, lte
interface AbilityUser { id: string; tenantId?: string }

// the ability of one request
buildAbility(input: { registry; granted: ReadonlySet<string>; scoped?: Readonly<Record<string, ScopedPermission>>; user: AbilityUser }): Ability
interface Ability {
  has(permission: string): boolean                                  // the caller was granted this permission string
  access(entity: EntityShape, action: Action): AccessAnswer          // for a list, a get, an update: which rows and which fields
  allows(entity: EntityShape, action: Action, row: Row): boolean     // for a row in memory, for a create and for the new state of an update
}
interface EntityShape { name: string; properties: ReadonlySet<string>; fields: readonly string[] }
interface AccessAnswer { allowed: boolean; reason?: 'no-permission' | 'unsupported-condition'; scope?: Row; readable?: ReadonlySet<string>; writable?: ReadonlySet<string> }

// roles are data
AUTH_PLUGIN = '@bieberkit/auth'; NIL_TENANT                          // the roles of a request with no tenant belong to the nil UUID
authMigrationSteps: readonly PluginMigrationStep[]               // plugin '@bieberkit/auth': bk_auth_roles, bk_auth_role_permissions, bk_auth_user_roles
authEntities: readonly EntitySchema[]                              // the same tables for the ORM
AuthRole { id, tenant, name, system, requireMfa }; AuthRolePermission { roleId, permission }; AuthUserRole { tenant, userId, roleId }
loadGrants(db, tenantId: string | undefined, userId: string): Promise<{ permissions: Set<string>; roles: string[]; requireMfa: boolean }>

// the authorizer of the HTTP server
createAuthorizer(options: AuthorizerOptions): AccessAuthorizer
interface AuthorizerOptions { db: Database; entities: readonly EntityDef<string>[]; schemas: readonly OrmSchema[]; scoped?: Readonly<Record<string, ScopedPermission>>; grants?: GrantLoader }
interface AccessAuthorizer extends Authorizer { install(server: HttpServer): void }      // adds the hook that drops the ability of a request

// @bieberkit/auth/testing
permissionMatrix(entity: EntityDef<string>, options?: { scoped?; conditions?: { permission; inside(userId); outside(userId) }[] }): MatrixCase[]
interface MatrixCase { id: string; title: string; run(harness: MatrixHarness): Promise<void> }     // throws when the authorizer is wrong
interface MatrixHarness { entity; path; tenants: readonly [string, string]; sample(extra?): Row; valueOf(field): unknown;
  caller(permissions, options?: { tenant?; userId? }): Promise<MatrixCaller>; seed(tenant, rows): Promise<string[]>; stored(id, field): Promise<unknown> }
MUTANTS: readonly Mutant[]                                         // six faults: ignore-conditions, no-read-mask, no-write-mask, write-checks-read, unsupported-allows-all, tenant-blind-grants
interface Mutant { id; description; build(options: AuthorizerOptions, tenants: readonly [string, string]): AccessAuthorizer }
```

`@bieberkit/http` gains `Authorizer.access?(principal, entity, action, request): Promise<AccessAnswer>`, the type `AccessAnswer` (the one above, without the dependency on this package), and `ctx.access(entity, action)`. Without `access` a route answers as before (the route permission decides), and `ctx.access` is allowed with no scope and all fields. With an authorizer and no principal it is `{ allowed: false, reason: 'no-permission' }`. The `StageContext` of the hooks gains `status` (set at `onResponse`) and `code` (the code of the problem, when the answer is one), so the hook that audits a denial knows that the request failed and why. `@bieberkit/data/orm` gains `scope` on `listPage` and `aggregate`, `findScoped(em, schema, id, scope)` and `applyPluginMigrations(db, steps, options)` (the `runPluginMigrations` of a `Database`, so a package that has steps does not need the Kysely of the data layer). The generated tests and the mutants are the subpath `@bieberkit/auth/testing`, which has no dependency on a test runner. The helpers that the tests of this package use (the app, the dialects) stay in `src/testing` and are not published, until `@bieberkit/testing` (TST-02) exists.

## Rules

1. **Permission strings are opaque.** An entity may name its permissions anything (`sales.view`). The registry lists each entity's `read`, `create`, `update`, `delete` (default `<module>.<entity>.<action>` like `@bieberkit/http`), each transition (`transition:<name>`, the permission of the transition or `update`) and each masked field (`permissions.fields.<field>.read|update`). A permission that no entity declares is a plain capability such as `system.api-docs`, and `has` answers it by name.
2. **Roles are data and per tenant.** `bk_auth_roles (id, tenant_id, name, system, require_mfa)` with the name unique in its tenant, `bk_auth_role_permissions (role_id, permission)` and `bk_auth_user_roles (tenant_id, user_id, role_id)`, whose key `(tenant_id, role_id)` points at `bk_auth_roles` so that a role cannot be given in another tenant. Deleting a role deletes its permissions and its assignments. A request with no tenant uses the roles of the nil tenant. The caller's grants are the union of the permissions of the roles that he has in the tenant of the request. Roles of another tenant grant nothing. A role only grants.
3. **A condition is attached to a permission string in code, in `scoped`.** (This refines the plan, which keyed a function by a permission of the entity. A permission such as `crm.deal.read-own` is not one that the entity declares, so the subject and the action have to be given, and a role that has only this permission must still reach the route that asks for `crm.deal.read`: **a route permission passes when the caller has any granted permission with the same subject and action**, and the scope of the answer is what limits the rows.) `{ 'crm.deal.read-own': { subject: 'crm.Deal', action: 'read', when: (user) => ({ assignee: user.id }) } }`. The entity's own `read` has no condition, so a role that grants `crm.deal.read` sees every row and a role that grants `crm.deal.read-own` sees its own, and a caller with both sees every row (CASL combines them). A scoped permission whose subject and action disagree with the entity that declares the same string is refused when the ability is built. `defineEntity` is not changed. A module contributes `scoped` through the key `scopedPermissions` that this package adds to `ModuleContributions` (`permissions` is taken: a plugin lists its permission strings there).
4. **The condition language is small and fails closed (ADR 0013).** One operator per field from `eq` (also `null`), `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, on properties of the entity. `$or`, `$and` and `$not` do not appear in a condition, and a dotted path, an unknown field or any other operator makes the answer `{ allowed: false, reason: 'unsupported-condition' }` before a query runs. The tenant filter is added outside by the data layer and no scope can remove it. A condition names fields of the entity (`owner`), and a relation takes the id of the row.
5. **Default deny.** A subject and action that no granted permission covers is `{ allowed: false, reason: 'no-permission' }`. A masked field is readable only with its `read` permission and writable only with its `update` permission. A field without a mask follows the entity.
6. **One ability for one request (AUTHZ-01).** It is built from the grants of (user, tenant) the first time a request asks, kept under the request id, and dropped by a hook of the stage `onResponse`. Nothing is shared between requests, so a change of roles shows in the next request.
7. **The routes use the answer.** The list, the aggregate and the bulk route add `scope` to the query. A get, an update, a delete or a transition of a row outside the scope is 404, as if the row did not exist. A create, and the new state of an update, must pass `allows` for the data that is written, otherwise 403 `AUTHZ_DENIED`. A response has only the `readable` fields and the standard keys (`id`, `version`, dates), also the response of a write, so a caller who may update and not read gets `id` and `version`. A body with a field that is not `writable` is 403 `AUTHZ_FIELD_FORBIDDEN`, in a bulk call too (for the whole call, since the data is one for every item), and asking for a masked field that the caller may not read in `fields` is 403 `AUTHZ_FIELD_FORBIDDEN` (a masked field that was not asked for is just left out). A bulk item outside the scope is `not_found`, and one that the write would move out of the scope is `invalid`. A stale version of a row outside the scope is 404, not 412, so the row is not revealed. A transition is scoped like any other action: a scoped permission with `action: 'transition:close'`. `_meta` takes its visibility from the same answer.
8. **Audit (AUTHZ-05).** A denial (`authz.denied`), an unsupported condition (`authz.unsupported-condition`) and a write of a masked field (`authz.field-forbidden`) each write an `bk_audit_log` entry in a transaction of their own, because the request is failing. The entry is written by the `onResponse` hook, from what the request recorded (`status`, `code`, and the entity, action and permission that the authorizer saw), so a failing audit write never changes the answer. The data holds the permission, the entity, the action and the names of fields, never the values. A request with no principal (401) and a row outside the scope (404) write nothing: the first has no actor, the second is not a denial.
9. **Generated tests (section 21).** `permissionMatrix(entity)` returns the cases of ADR 0013 for the `permissions` block of an entity, and `MUTANTS` are six faults of the authorizer: conditions ignored, no read mask, no write mask, no action check on update, an unsupported condition that allows everything, and the tenant filter off. The cases are generated from the `permissions` block of the entity (default deny, read allowed, read does not give write, other permissions do not give read, mask hidden and shown, mask write rejected and accepted, tenant isolation of a list, of the roles and of an update, an update with an empty payload), plus the conditions and the scoped permissions that are given. A case judges the rows that it made, so the cases can share one database. The suite of the package runs the matrix on the three dialects against the real authorizer and against each mutant, and every mutant must fail at least one case. The `asSystem` audit case of ADR 0013 is covered by the tests of `@bieberkit/data` and is not repeated.

## Errors

| Code                          | Status | Fix                                                                      |
| ----------------------------- | ------ | ------------------------------------------------------------------------ |
| `AUTHZ_DENIED`                | 403    | The caller has no permission for this, or for this data                  |
| `AUTHZ_FIELD_FORBIDDEN`       | 403    | Remove the fields that the caller may not write                          |
| `AUTHZ_UNSUPPORTED_CONDITION` | 403    | A condition uses an operator that the language does not have (ADR 0013)  |
| `AUTHZ_PERMISSION_CONFLICT`   | 500    | A scoped permission names another subject or action than the entity does |

## Tests (red until the maintainer approves)

In `packages/auth/src`: `registry.test.ts`, `ability.test.ts` (with the language), `roles.dialects.test.ts`, `authorizer.dialects.test.ts` (can, access, the ability of a request, the audit of a denial), `entity-access.dialects.test.ts` (the routes with a real authorizer: scope, conditions of writes, masks, aggregate and bulk, fail closed), `matrix.dialects.test.ts` (the generated matrix and the six mutants). In `@bieberkit/data`: `scope.dialects.test.ts`. In `@bieberkit/http`: `access.test.ts`. The tests need the package to compile, so they are red until the code exists.

## Left out of slice A

- **Conditions through relations** (a dotted path). They need their own design (a join or a subquery) before they are allowed.
- **Deny rules and role inheritance.** A role grants. If a need appears it is an ADR.
- **The seeder of the administrator role** is M1.8, and `requireMfa` is enforced in slice C.
- **The `bieberkit check` rule** for conditions (AUTHZ-06) waits for the CLI of M1.8. The runtime refusal is the second line of ADR 0013.

## Found while writing and implementing slice A

- **`allows` is a port method too.** The routes need to judge a row that is not stored (a create, the new state of an update), and `@bieberkit/http` must not depend on CASL, so `Authorizer.allows?` and `ctx.allows` carry the question to `Ability.allows`. One matcher gives one answer for a list and for a write.
- **A route permission passes with `covers`.** `Ability.covers(permission)` is true when the permission was granted, or when another granted permission (a scoped one) has the same subject and action. The permission of a masked field must be granted itself.
- **The key is `scopedPermissions`.** `permissions` of `ModuleContributions` is the list of strings of a plugin, so the contribution of conditions has its own key.
- **A scope is written from the tree of CASL.** `rulesToAST` gives an `or` of conditions, or one condition, or an empty `and` (every row, no scope), or `null` (no rule). The translator merges the operators of one field into one object, writes equality as the plain value, and refuses a node that it does not know. An empty condition is refused too, because a function that returns `{}` by mistake must not open every row.
- **The roles tables need two flushes.** The tables point at each other by key and not by relation, so the ORM does not order the inserts. A service writes the role first. The migration steps make the keys: `(tenant_id, role_id)` of `bk_auth_user_roles` points at `bk_auth_roles`, so a role cannot be given in another tenant.
- **`@mikro-orm/core` is a dependency of this package.** The three tables are ORM schemas, like the framework tables of `@bieberkit/data`. It is the same version as `@bieberkit/data` (7.2.9), and no new third party library comes with it. `@casl/ability` 7.1.3 is the one that ADR 0013 and the P9 line name.
- **The matrix found a weak spot of the first design of the mutants.** The tenant fault cannot be a wrapper over the authorizer, because the tenant filter of the rows lives in the data layer. The sixth mutant is `tenant-blind-grants`: the roles of every tenant grant. The tenant filter of the rows has its own tests in `@bieberkit/data`. Each mutant is caught by the cases that are meant to catch it: `conditions:*`, `mask-hidden`, `mask-write-rejected`, `read-does-not-grant-write`, `unsupported-denies:*` and `tenant-isolation-roles`.
- **An empty update is a validation error for everyone.** The schema refuses `{}` before the permission is asked, so the case `update-empty-payload` of ADR 0013 is an update that names no masked field, by a caller who may only read.

## Slice B: authentication (implemented on 2026-11-23)

Who the caller is. Better Auth 1.7.25 (pinned exactly, AUTH-11) runs on the EntityManager of the request through its own Kysely adapter (ADR 0012), and plugs into the ports of `@bieberkit/http`. The plan is in the roadmap item M1.4. Passkeys, TOTP, magic link, API keys and `requireMfa` are slice C.

### Public API (slice B)

```ts
createAuth(options: CreateAuthOptions): AuthInstance          // betterAuth(...) with the fixed options of ADR 0012
interface CreateAuthOptions {
  db: Database; dialect: Dialect; secret: string /* 32 characters or more */; baseUrl: string; trustedOrigins?: readonly string[];
  limits?: AuthLimits; mail?: { sendVerification?(mail: AuthMail): Promise<void>; sendResetPassword?(mail: AuthMail): Promise<void> }
}
interface AuthMail { to: string; url: string; token: string }
interface AuthLimits { signIn?: Limit2; signUp?: Limit2; passwordReset?: Limit2 }   // Limit2 = { perIp?: Limit; perAccount?: Limit }; Limit = { window: number /* seconds */; max: number }

registerAuthRoutes(server: HttpServer, options: { auth: AuthInstance; db: Database }): void   // mounts /api/auth, one transaction per change, audit and outbox
createAuthenticator(auth: AuthInstance): Authenticator                                         // the cookie to a Principal { via: 'cookie', sessionId }
createTenantResolver(options: { db: Database }): TenantResolver                                // X-Tenant checked against the roles of the user (DATA-19)
checkAuthDrift(options: BetterAuthOptions, metadata: Record<string, DriftEntity>): string[]    // AUTH-10; [] when the entities and Better Auth agree
driftEntities(db: Database): Record<string, DriftEntity>

AuthUser, AuthSession, AuthAccount, AuthVerification, AuthRateLimit                           // ORM schemas of bk_auth_users, bk_auth_sessions, bk_auth_accounts, bk_auth_verifications, bk_auth_rate_limits
```

`@bieberkit/data/orm` gains `requestKysely(db)`. `@bieberkit/http` gains `HttpServer.mount({ prefix, handler })`, with `handler(request: Request): Promise<Response>`.

### Rules

1. **One Kysely for the request.** `requestKysely(db)` is a proxy whose every call goes to `em.getKysely(...)` of the EntityManager in the async context (a fork outside a request), with `tableNamingStrategy: 'entity'`, `columnNamingStrategy: 'property'`, `convertValues`, `processOnCreateHooks` and `processOnUpdateHooks`. Inside a transaction, `transaction()` returns an object whose `execute(cb)` calls `cb` with the same Kysely, so a nested transaction joins (ADR 0012, decision 2). Outside one it is a real transaction.
2. **Tables.** `authUser`, `authSession`, `authAccount`, `authVerification` and `authRateLimit` are the model names, `bk_auth_users` and the rest the tables, made by steps 0.2.0 of the plugin `@bieberkit/auth` and described by ORM schemas. Ids are UUIDv7 from `advanced.database.generateId`, the type refuses text that is not a UUID, `account.accountId` is the column `external_account_ref`, and deleting a user deletes its sessions and accounts.
3. **Cookie (AUTH-01).** `__Host-bk_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, and `useSecureCookies` is set to `false`: Better Auth turns it on by itself for an https base URL, and the name would become `__Secure-__Host-bk_session`.
4. **Client IP (AUTH-10).** The mount removes the `x-bk-client-ip` of the request, sets its own from the address that `TRUST_PROXY` resolved, and Better Auth reads only that header. An `X-Forwarded-For` that the proxy setting does not trust has no effect.
5. **A request is one unit.** A change (not a GET) under `/api/auth` runs in a unit of work with a transaction. A status below 400 commits it, together with the audit entry (`auth.user.signed-up`, `auth.session.created`, `auth.session.revoked`, `auth.password.reset`, `auth.email.verified`) and the outbox event of the same name. Any other status rolls everything back. A failed sign-in writes `auth.signin.failed` in a transaction of its own.
6. **Limits survive a rollback (AUTH-06).** The counters are written through a fork with no transaction. Per IP, Better Auth's rules for sign-in, sign-up and the password reset. Per account, a counter that is keyed by the hash of the address and the path, so the address is never stored in clear text. Over the limit is 429 with `Retry-After`. Defaults: sign-in 5 per 60 s per IP and 10 per 15 min per account, sign-up 5 per 60 s per IP, reset 3 per 15 min per IP and per account.
7. **The principal.** `createAuthenticator` reads the cookie with `getSession`, gives `{ id, kind: 'user', via: 'cookie', sessionId }`, and does not touch the database when there is no cookie. A missing, unknown, expired or revoked session is no principal.
8. **The tenant (DATA-19).** `X-Tenant` is taken only for a principal, must be a UUID (`AUTH_TENANT_INVALID`, 400), and the user must have a role in it (`AUTH_TENANT_FORBIDDEN`, 403). No header is no tenant. Nothing comes from the session.
9. **Passwords (AUTH-04).** 8 to 128 characters, no composition rules, scrypt as Better Auth hashes it. Verification and reset mails are the callbacks of `mail`, because the mail contract is M1.5. Sign-up does not sign the user in until the email is verified only when the project asks (`requireEmailVerification` is off by default).
10. **Configuration comes in.** `createAuth` reads no environment (P8). A `secret` of fewer than 32 characters is `AUTH_CONFIG_INVALID`. Telemetry is off, and a test fails if the option is missing.
11. **Drift (AUTH-10).** `checkAuthDrift` compares `getAuthTables(options)` with the ORM metadata: the property exists, nullability and unique agree. It runs as a test on every change of the options and of the Better Auth version.

### Errors of slice B

| Code                    | Status | Fix                                                         |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `AUTH_CONFIG_INVALID`   | 500    | The secret has 32 characters or more, the base URL is a URL |
| `AUTH_TENANT_INVALID`   | 400    | `X-Tenant` is the UUID of a tenant                          |
| `AUTH_TENANT_FORBIDDEN` | 403    | The user has no role in this tenant                         |

### Tests

`packages/data/src/orm/request-kysely.dialects.test.ts`, `packages/http/src/mount.test.ts`, and in `packages/auth/src`: `tables.dialects.test.ts`, `flows.dialects.test.ts`, `limits.dialects.test.ts`, `authenticator.dialects.test.ts`, `tenant.dialects.test.ts`, `end-to-end.dialects.test.ts`, `config.test.ts`, `drift.test.ts`.

### Left out of slice B

Organizations and teams (the plugin needs its spike), Valkey for sessions and counters (M1.5), the breached-password check, OAuth providers, and everything of slice C.

### Found while implementing slice B

- **`@better-auth/kysely-adapter` is a direct dependency.** `better-auth` does not export it, and pnpm does not let a package import a dependency of a dependency. It is pinned to the same version as `better-auth` (a test checks both). `kysely` 0.29.8 is a direct dependency too, for the counters of the limits (the same version as `@bieberkit/data`).
- **`useSecureCookies` must be `false`.** Better Auth turns it on by itself when the base URL is https, and the cookie is then `__Secure-__Host-bk_session`. ADR 0012 tested a `http://localhost` base URL, where it stays off. The attributes already make the cookie `Secure`.
- **Better Auth also asks for `connection()`.** Besides `transaction()`, the adapter calls `db.connection()` on PostgreSQL and MySQL, and Kysely refuses that on a transaction too. `requestKysely` joins both.
- **A single connection cannot hold a rolled back counter and a kept one.** SQLite has one connection, and a Kysely that is "outside" the transaction would wait for it forever. So the counters are written inside the transaction like everything else, and when the request is rolled back the routes count them again, outside the transaction (`capture` and `replay` of `limits.ts`). The check and the count are one statement (an upsert), so requests at the same time cannot all pass a stale read.
- **Better Auth 1.7.25 has an atomic rate limit storage.** `rateLimit.customStorage.consume(key, rule)` replaced `get` and `set`, so the table `bk_auth_rate_limits` has a unique `key` and the storage is one `insert ... on conflict`. MySQL has no `returning`, so it reads the count after the write.
- **A forged or expired cookie is no principal and no error.** `getSession` answers `null`, and the authenticator gives `undefined`.
- **A user with no role in any tenant is refused by the tenant resolver, not by the authorizer.** `X-Tenant` names a tenant, and the membership check is a role row, so such a request is 403 `AUTH_TENANT_FORBIDDEN` and writes no `authz.denied` entry. The denial of the authorizer is for a user who is a member and lacks the permission.

## The service of roles (AUTHZ-05)

```ts
createRole(db, { tenantId?, name, permissions?, requireMfa?, system? }): Promise<string>     // the id
setRolePermissions(db, roleId, permissions): Promise<boolean>                                // true when something changed
updateRole(db, roleId, { name?, requireMfa? }): Promise<boolean>
deleteRole(db, roleId): Promise<void>
assignRole(db, { tenantId?, userId, roleId }): Promise<boolean>                               // false when the user had it
revokeRole(db, { tenantId?, userId, roleId }): Promise<boolean>
```

- Each call is one transaction (`runInTransaction`): the change, its audit entry (`auth.role.created`, `auth.role.updated`, `auth.role.deleted`, `auth.role.assigned`, `auth.role.revoked`) and its outbox event of the same name are written together, or not at all. The entry has the actor of the request, the tenant of the role and the id of the role. Its data is the names and the permission strings that changed (`added` and `removed` for a change of permissions), never a value of a user.
- A change that changes nothing (the same permissions, the same name, a role that the user has already) leaves no entry and no event, and answers `false`.
- A system role (the administrator, made by the seeder of M1.8 with `system: true`) cannot be renamed, deleted or given another flag of networks or other permissions (`AUTH_ROLE_SYSTEM`, 409), but it can be given to a user. Its `requireMfa` can change: by a holder of the administrator role, and not onto oneself without a second factor (ROL-06, [admin-account.md](admin-account.md)).
- A role is given only in its own tenant, and a role that is not in the tenant is `AUTH_ROLE_NOT_FOUND` (404), as is an unknown id. A name that the tenant has is `AUTH_ROLE_EXISTS` (409). A blank name, a blank permission, a user or a tenant that is not a UUID and more than 500 permissions are `AUTH_ROLE_INVALID` (400).
- The routes and the screens that call it are the admin of M1.8 and later. The service checks no permission: the caller (a route with its own permission) does.

## Slice C1: TOTP, passkeys, magic link and MFA (implemented on 2026-11-23)

```ts
createAuth({ ..., methods: { totp: { issuer }, passkey: { rpName, rpId? }, magicLink: { send(mail), expiresIn? } }, previousSecrets: [...] })
AuthLimits += { magicLink?: Limit2; mfa?: Limit2 }
Principal += { mfa?: boolean }                       // @bieberkit/http, additive
AuthTwoFactor, AuthPasskey                           // ORM schemas of bk_auth_two_factors, bk_auth_passkeys; steps 0.3.0
```

### Rules

1. **A method is loaded when it is asked for.** Without `methods.totp` there is no two-factor plugin, no `twoFactorEnabled` in the answers, and no need of the table. The magic link needs no table of its own (it uses `bk_auth_verifications`). `@better-auth/passkey` is pinned to the same version as `better-auth` (a test checks it).
2. **Tables (steps 0.3.0).** `bk_auth_users.two_factor_enabled` (a nullable column), `bk_auth_two_factors` (the TOTP secret and the backup codes, both encrypted by Better Auth with the secret of the application, and a lockout) and `bk_auth_passkeys` (the public key, the credential id with a unique key, the counter). `bk_auth_verifications.id` is text, not a UUID: Better Auth names a single-use reservation by a digest, and it does so for a magic link (see "Found while implementing").
3. **Every cookie is a `__Host-` cookie.** The session, its cache, the "do not remember" flag, the pending second factor (`__Host-bk_two_factor`), the trusted device and the challenge of a passkey (`__Host-bk_passkey_challenge`) are `Secure`, `HttpOnly`, `Path=/`, with no `Domain`. `defaultCookieAttributes` makes a cookie that Better Auth adds later secure too. A test reads every `Set-Cookie` of the flows.
4. **The second factor makes the session (AUTH-05).** With TOTP on, a sign in with the password alone answers `twoFactorRedirect` and sets only the pending cookie. The session exists after `POST /api/auth/two-factor/verify-totp` (or `verify-backup-code`). The authenticator gives `mfa: true` when the user has TOTP on. A role flagged `requireMfa` makes the authorizer answer 403 `AUTH_MFA_REQUIRED` (`can`, `access` and `allows`) for a principal without it, and writes `authz.mfa-required`. The routes of `/api/auth` are not behind the authorizer, so the user can turn TOTP on and then pass. A passkey is not a second factor in this slice, because a session does not say how it began. For the same reason, turning TOTP on ends the other sessions of the account, and magic link stays off in a server: Better Auth asks for the code after a password sign in only (AUTH-03, AUTH-05).
5. **The magic link does not make an account.** `disableSignUp` is on, and no mail goes to an address that has none, with the same answer as for one that has. A link works once and expires.
6. **Audit and outbox.** `auth.mfa.enrolled` (the secret is made), `auth.mfa.verified` (a code is accepted, which also turns TOTP on), `auth.mfa.backup-code-used`, `auth.mfa.backup-codes-renewed`, `auth.mfa.disabled`, `auth.passkey.added`, `auth.passkey.removed`, and `auth.session.created` for a magic link and a passkey sign in. A refused code leaves `auth.mfa.failed` and a refused passkey `auth.signin.failed`, each in an entry of its own, with no code in it. `GET /magic-link/verify` writes, so it runs in the transaction like a POST.
7. **Limits (AUTH-06).** The request of a magic link: 5 per 60 s per address and 5 per 15 min per email. The use of a link: the same limit per address. A TOTP code, a backup code and a passkey answer: 10 per 60 s per address. Better Auth locks the account of the code itself.
8. **Rotation of the secret.** `createAuth` gives Better Auth `secrets` (the current first, then `previousSecrets`, each with a number that its own text makes, so the numbers do not move when the list does). What was encrypted with a secret in the list is read, and what is written uses the first. A test rotates and then drops the old secret.

### Found while implementing

- **The first answer of an enrolment replaces the session.** After `two-factor/verify-totp` confirms the enrolment, the session cookie that the user had is revoked and a new one comes with the answer. A client keeps the new one.
- **Better Auth sets cookies that no ADR named.** With TOTP it set `better-auth.two_factor` (not `Secure`, not `__Host-`) and with passkeys `better-auth.better-auth-passkey`. Each is now named in `advanced.cookies`.
- **A magic link failed with a 500 on the UUID type.** `reserveVerificationValue` writes a row whose id is the SHA-256 of the identifier in base64url, which is not a UUID, and `advanced.database.generateId: 'uuid'` is the only way that Better Auth makes a UUID of it (and then it gives up our UUIDv7 ids). The ids of `bk_auth_verifications` are text, and nothing refers to them.
- **Better Auth sends a magic link to an unknown address too**, and refuses only at the use of the link. The `send` callback of this package looks the address up first, so no mail leaves.
- **A cookie with no value is not a session.** Better Auth takes a cookie back with `name=; Max-Age=0`. The helpers of the tests skip it.

## Slice C2: API keys (implemented on 2026-11-23)

```ts
createAuth({ ..., apiKeys: { defaultExpiresInDays?, maxExpiresInDays?, rateLimit?: { window, max } } })
createApiKey(auth, db, { userId, tenantId?, name, permissions, expiresInDays? }): Promise<{ id, key, expiresAt }>
revokeApiKey(db, { id }): Promise<void>
Principal += { grants?: readonly string[]; tenantId?: string }          // @bieberkit/http, additive
AuthApiKey                                                               // ORM schema of bk_auth_api_keys; steps 0.4.0
```

### Rules

1. **Made by code.** A key is made by `createApiKey` and revoked by `revokeApiKey`, in one transaction each with an audit entry (`auth.apikey.created`, `auth.apikey.revoked`) and an outbox event of the same name. The entry has the name, the permissions, the expiry, the tenant and the owner, never the key. The routes of Better Auth for keys (`/api/auth/api-key/*`) answer 404: through them a signed in user could choose the permissions and the tenant of his key.
2. **Shown once, stored hashed.** The key (`bk_` and random characters) is in the answer of `createApiKey` and nowhere else. Better Auth stores its hash. A key lasts 1 to 365 days, 90 by default, and always ends.
3. **The permissions and the tenant are the key's own.** They are in its metadata, as opaque strings like every permission. The principal of a request that carries the key is `{ id: <key id>, kind: 'apiKey', via: 'token', grants, tenantId }`. The authorizer builds the ability from `grants` and from nothing else: the roles of the owner give the key nothing, and a role flag `requireMfa` does not apply to it. Scoped permissions see the key as the user, so `user.id` in a condition is the id of the key.
4. **The tenant.** `X-Tenant` for a key must be the tenant of the key (`AUTH_TENANT_FORBIDDEN` otherwise), and without the header the tenant is the one of the key. A key made with no tenant has none and refuses an `X-Tenant`.
5. **How a key is read.** `X-API-Key: bk_...`, or `Authorization: Bearer bk_...` when the token has the prefix of our keys, and a key wins over a cookie. A key that is wrong, expired, revoked or switched off is no principal (401 on a route that needs one). A key over its limit is 429 with `Retry-After`. Nothing is asked of the database when no key and no cookie come.
6. **No CSRF for a key.** The principal says `via: 'token'`, because no browser sends a key by itself (SEC-03).
7. **The owner.** A key is deleted with its owner by the foreign key.
8. **The limit of a key** is Better Auth's own, 600 requests in 60 s by default, in front of the limit of the address and of the pipeline.

### Found while implementing

- **A key made over HTTP would be an escalation.** With `enableMetadata` on, the create route of Better Auth takes a metadata from the client. So the routes are blocked and the one way to make a key is the function, which writes the metadata from its own arguments.
- **A key is a user for a condition.** The ability gets `{ id: principal.id }` as its user, which for a key is the id of the key. A project that wants rows "of this key" names it in the data.

## Leftovers of M1.4 settled on 2026-11-24

1. **Sessions on Valkey (AUTH-02).** `createAuth({ secondaryStorage })` takes the store of `redisSecondaryStorage({ url, prefix })` of `@bieberkit/cache/bentocache`: `get`, `set` with a lifetime in seconds, `delete`, `getAndDelete` (`GETDEL`) and `increment` (a counter that keeps the lifetime of its first call). With it, `session.storeSessionInDatabase` is on: **the database still holds every session**, so a Valkey that loses its data (a restart with no persistence) signs nobody out, and a sign out removes the session from both. Every web replica finds a session in one hop. The Valkey of sessions is `REDIS_URL`, the one with `maxmemory-policy noeviction` (a session that is evicted signs a user out), never the cache instance. The counters of the limits stay in the database (AUTH-10), through our own storage. Tests: `secondary-storage.dialects.test.ts` against a real Valkey on three dialects (written to both, read first from Valkey, another replica, a Valkey with nothing, sign out) and `secondary-storage.test.ts` in the cache package.
2. **The tenant and Better Auth (AUTH-10, ADR 0021).** The organization plugin is not loaded. The tenant is resolved for each request and `bk_auth_sessions` has no column for it. A test says so.
3. **Conditions at build time (AUTHZ-06).** `checkScopedPermissions(scoped, entities)` answers a list of findings for the scoped permissions of a project: the entity and the action exist, and the condition, for two sample users, is in the language of ADR 0013 (properties of the entity, no path, no `$or`, `$and` or `$not`, **one operator for each field**). `explainCondition` says why a condition is refused, and the ability at run time uses the same function (it still takes a range, so a condition that worked keeps working). The command `bieberkit check` of M1.8 calls it.
4. **Impersonation (AUTHZ-05).** The framework has no impersonation. A feature that adds it calls `recordImpersonationStart(em, { actorId, targetId, reason, tenantId? })` in the transaction that makes the session, and `recordImpersonationEnd` when it ends. The reason is required (1 to 500 characters), nobody impersonates themselves, the entry has both ids in its data (during the impersonation the request may speak for the target), and an outbox event goes with it.

## Disabled users and provider identity columns (S0, BPL-01, IDN-01)

`AuthUserRow` adds nullable `disabledAt`, `disabledReason`, `disabledBy` and `externalId`, plus non-null `source` with default `local`. Six one-statement expand steps at version 0.5.0 add the physical columns and the unique `(source, external_id)` index. Several null external ids are allowed. Better Auth declares the five fields through `additionalFields` with `input: false`, and the drift check verifies them.

The public services are `disableUser(db, { userId, reason, actorId })` and `enableUser(db, { userId, actorId })`, both returning whether state changed. Each uses one transaction and audits `users.user.disabled` / `users.user.enabled` against `authUser`; disabling also deletes all database sessions. Repeating a state change returns false and adds no audit entry. An unknown user is `USERS_NOT_FOUND` (404). The explicit actor is preserved in the audit, including a null system actor.

The session-create database hook and guarded adapter insert refuse disabled accounts for password, magic link, passkey and TOTP completion with `AUTH_USER_DISABLED` (403). Cookie and API-key authentication fetch the owner's current state through Better Auth's adapter, so a secondary-storage snapshot cannot keep a disabled user authenticated. Cookie authentication also checks the durable session row, including native auth endpoints when another API key is present. Session insertion holds the user row lock in the same service transaction, so a concurrent disable cannot leave a usable session. A revoked durable session resolves as unauthenticated even when secondary storage still has it. Enabling does not restore revoked sessions; the user signs in again.

Tests: `profile.dialects.test.ts`, the profile cases in `drift.test.ts` / `tables.dialects.test.ts`, and all 13 cases of `user-service.dialects.test.ts` on PostgreSQL, MySQL and SQLite. They include audit-failure rollback, the cached enabled-user snapshot, an issued magic link/passkey challenge, and disable between password and TOTP. Self-action, last-administrator and provider-managed edit guards belong to the later users/enterprise slices.

Authentication mail in a request transaction is recorded as a prepared `mail.send` outbox intent. The worker delivers it after commit; rollback sends nothing. Direct auth API calls outside a transaction use the mail contract normally.
