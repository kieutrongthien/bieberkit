<!--
  BieberKit

  @file        docs/modules/http.md
  @description Module spec of @bieberkit/http: the Fastify server, the request pipeline, RFC 9457 errors, route rules, health and shutdown (M1.3, slice 1).
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

# @bieberkit/http

- Package: `@bieberkit/http`
- Layer: contracts (it may import `@bieberkit/core` and `@bieberkit/data`)
- Spec sections: 13 (HTTP API), 19.3 and 19.4 (health, shutdown), 7.5 (write path), ADR 0003 (logging), ADR 0009 (schemas)
- Status: Slice 1 is designed on 2026-11-23. None of M1.3 is tagged **[D]**, but the pipeline has stages for authentication, tenant resolution and authorization. This package only defines the ports for them (see Rules), so the maintainer-only design of M1.4 stays in `@bieberkit/auth`.

## Purpose

The one HTTP server of a project: a Fastify 5 instance whose every request passes the same 12 stages in the same order (§13.4), with errors as RFC 9457 problems, routes that must declare their schemas and their permission, and the health and shutdown behavior that the deployment needs. Entity routes, OpenAPI, `_meta` and the security headers are built on it in later slices.

It does not authenticate anyone, decide who may do what, or resolve a tenant. `@bieberkit/auth` does, and plugs in through ports.

## Slicing

| Slice               | Content                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation       | Server, pipeline and named stages, ports, RFC 9457 errors, request id and trace context, route rules, body limit, timeouts, health, shutdown |
| 2. Entity routes    | List, get, create, update, delete from `api`, filter, sort, `include`, `fields`, ETag and `If-Match`, the one-query-per-row test (PERF-04)   |
| 3. Actions and bulk | `POST .../actions/<name>`, bulk, aggregate, `Idempotency-Key`, `Deprecation` and `Sunset`                                                    |
| 4. Description      | OpenAPI 3.1, `/api/v1/_meta`                                                                                                                 |
| 5. Security         | Security headers, CORS allowlist, CSRF, `http.fetch` with the SSRF guard, timeouts and circuit breaker                                       |

## Public API (slice 1)

```ts
createHttpServer(env: HttpEnv, options?: HttpServerOptions): HttpServer
interface HttpEnv { APP_ENV: 'development' | 'test' | 'production'; APP_PORT: number; TRUST_PROXY: boolean | number }
interface HttpServerOptions {
  logger?: Logger                       // the kernel logger; Fastify logs through it (ADR 0003)
  authenticator?: Authenticator         // stage 3
  tenantResolver?: TenantResolver       // stage 5
  authorizer?: Authorizer               // stage 8
  ipLimiter?: RateLimiter               // stage 2
  userLimiter?: RateLimiter             // stage 4
  bodyLimit?: number                    // bytes, default 1 MiB (API-03)
  requestTimeoutMs?: number             // default 30 000 (API-05)
  keepAliveTimeoutMs?: number           // default 65 000, above a 60 s load balancer idle time
  onError?: (error: unknown, request: ErrorContext) => void      // reports a 500 (OBS-06)
}
interface HttpServer {
  route(route: RouteDef): void                    // refuses a route that breaks API-01 or API-02
  stage(name: 'afterAuth' | 'beforeHandler' | 'afterHandler' | 'onResponse', hook: StageHook): void   // REQ-01
  inject(request: InjectOptions): Promise<InjectResponse>      // for tests
  listen(options?: { port?: number; host?: string }): Promise<{ address: string; port: number }>
  markReady(): void                               // /health/startup turns 200
  stop(options?: { drainMs?: number; timeoutMs?: number }): Promise<{ timedOut: boolean }>    // spec 19.4
  readonly settings: Readonly<{ bodyLimit: number; requestTimeoutMs: number; keepAliveTimeoutMs: number }>
}

defineRoute(route: RouteDef): RouteDef          // identity at run time, checks types
interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  permission?: string                           // exactly one of permission and public
  public?: true
  schema: { params?: JsonSchema; query?: JsonSchema; body?: JsonSchema; response: Record<number, JsonSchema> }
  handler(ctx: RouteContext): Promise<unknown> | unknown
}
interface RouteContext { params; query; body; principal: Principal | undefined; tenantId: string | undefined; requestId: string; traceId: string; log: Logger; status(code: number): void }

// ports, implemented by @bieberkit/auth and the observability package
interface Principal { id: string; kind: 'user' | 'apiKey' | 'service' }
interface Authenticator { authenticate(request: RequestInfo): Promise<Principal | undefined> }
interface TenantResolver { resolve(request: RequestInfo, principal: Principal | undefined): Promise<string | undefined> }
interface Authorizer { can(principal: Principal, permission: string, request: RequestInfo): Promise<boolean> }
interface RateLimiter { hit(key: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> }
interface RequestInfo { method; path; headers; ip; cookies?: never }
```

## Behavior

### The stages (§13.4)

Core hooks are registered when the server is made, before any route and before any plugin hook, so Fastify runs them in this order and no route can skip one.

| Stage           | Where it runs                             | What it does                                                                                                             |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1               | `onRequest`                               | Request id, trace context, and the request context of core (`AsyncLocalStorage`) for everything that follows             |
| 2               | `onRequest`                               | `ipLimiter.hit(ip)`. A refusal is 429                                                                                    |
| 3               | `onRequest`                               | `authenticator.authenticate`. No principal is not an error yet, because a public route does not need one                 |
| 4               | `onRequest`                               | `userLimiter.hit(principal id)` when there is a principal                                                                |
| 5               | `onRequest`                               | `tenantResolver.resolve`. The tenant and the user go into the request context, where the data layer reads them (DATA-19) |
| 6               | `onRequest`                               | CSRF (slice 5). A named place that does nothing yet                                                                      |
| `afterAuth`     | `onRequest`, after 6                      | The hooks that plugins registered for this stage                                                                         |
| 7               | `preParsing`, `preValidation`, validation | Body parsing within `bodyLimit`, then Ajv validation of params, query and body                                           |
| 8               | `preHandler`                              | A route with `permission` needs a principal (401) that the authorizer allows (403). A `public` route skips it            |
| `beforeHandler` | `preHandler`, after 8                     | Plugin hooks                                                                                                             |
| 9               | the handler                               | The route handler                                                                                                        |
| `afterHandler`  | `preSerialization`                        | Plugin hooks, with the value that the handler returned                                                                   |
| 10              | serialization                             | Through the response schema of the status. A field that is not in it is dropped (API-01)                                 |
| 11              | `onSend`                                  | ETag and cache headers (slice 2). A named place that does nothing yet                                                    |
| 12              | `onResponse`                              | One log line, then the plugin hooks of `onResponse`                                                                      |

A failure at any stage stops the pipeline and the response is a problem (REQ-02). The hooks that plugins add cannot reorder or remove a stage, because `stage()` only appends to its own list and has no other name.

### Errors (MOD-17, SEC-07)

Every error response is `application/problem+json`:

```json
{
  "type": "urn:bieberkit:error:DATA_VERSION_STALE",
  "title": "Precondition Failed",
  "status": 412,
  "detail": "The record was changed by someone else since it was read.",
  "code": "DATA_VERSION_STALE",
  "traceId": "0af7651916cd43dd8448eb211c80319c",
  "instance": "/api/v1/crm/customers/…"
}
```

- A `BkError` gives its `status`, `code` and `safeMessage` (as `detail`). Its `message` and `cause` never leave the server.
- Anything else is a 500 with the code `HTTP_INTERNAL` and the detail "Something went wrong.". It is logged with its cause and passed to `onError` (OBS-06).
- `fix` is added as `fix` only when `APP_ENV` is not `production`, because the fix text of many errors is written for the developer.
- A validation failure is 400 `HTTP_VALIDATION_FAILED` with `errors: [{ path, code, message }]`, where `path` starts with where the value was (`body.name`, `query.pageSize`, `params.id`) and `code` is the rule that failed (`required`, `minLength`, `additionalProperties`).
- The errors of Fastify map to stable codes: invalid JSON `HTTP_BODY_INVALID` (400), a body over the limit `HTTP_BODY_TOO_LARGE` (413), another content type `HTTP_UNSUPPORTED_MEDIA_TYPE` (415), no route `HTTP_NOT_FOUND` (404), a request that took too long `HTTP_REQUEST_TIMEOUT` (408), a limiter's refusal `HTTP_TOO_MANY_REQUESTS` (429, with `Retry-After`), no principal `HTTP_UNAUTHENTICATED` (401), a principal without the permission `HTTP_FORBIDDEN` (403).

### Request id and trace (API-04)

An incoming `x-request-id` is kept when it has 1 to 128 characters of letters, digits, `-`, `_`, `.` and `:`, and replaced by a UUIDv7 otherwise. A valid `traceparent` gives the trace id and the parent span (W3C); a missing or invalid one gives a new random trace id. Both go into the request context (`requestId`, `traceId`, `spanId`) and the response carries `x-request-id`, also on errors and on a 404.

### Routes (API-01, API-02)

`server.route` throws `HTTP_ROUTE_INVALID` at boot, with the route named, when:

- it has neither `permission` nor `public: true`, or both (API-02);
- it has no response schema for a 2xx status (API-01), or a response schema that is not an object, array or primitive schema;
- the same method and url were registered before, or the method is not one of the five;
- a schema is not valid JSON Schema 2020-12 under the strict Ajv of `@bieberkit/data/build`.

The validator of Fastify is replaced by that Ajv (`createAjv`), so a route is checked by the same rules as an entity (SCH-03). Params, query and headers are coerced (`?pageSize=10` is the number 10), and a body is not: a body of `{ "n": "10" }` is refused for an integer. Unknown fields in a body are refused when the schema says `additionalProperties: false`, as the entity schemas do (SEC-04).

### Ports and the default

With no `authenticator` nothing is authenticated, so every route that needs a permission answers 401, and the server is safe before `@bieberkit/auth` exists. With no `authorizer` a principal is allowed nothing: 403. With no limiter nothing is limited, and with no tenant resolver the tenant is not set (a tenant entity then fails closed in the data layer, DATA-19).

### Health and shutdown (§19.3, §19.4)

`/health/live` answers 200 while the event loop does. `/health/ready` answers 200 until `stop()` begins, and 503 after. `/health/startup` answers 503 until `markReady()` and 200 after. They are public, and they need no schema from the caller.

`stop()` does the steps of 19.4: ready turns 503, it waits `drainMs` (5 s), stops accepting connections and closes idle keep-alive ones, waits for requests in progress up to `timeoutMs` (20 s), and returns `{ timedOut }`, which the caller turns into the exit code with `exitCode` of core. `registerHttp(lifecycle, server, options)` puts `listen` in the boot hooks and `stop` in the shutdown hooks of the lifecycle.

### Logging (ADR 0003)

Fastify gets the kernel logger through a small adapter, because Fastify calls `log.info(object, message)` and the logger of core takes `(message, fields)`. Fastify's own request log is off. At stage 12 one line is written with `method`, `path` without the query (it may hold a token), `status`, `durationMs` and the request id. A 5xx is logged at `error` level and the rest at `info`.

## Errors

| Code                          | Status | Fix                                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `HTTP_ROUTE_INVALID`          | 500    | A route needs one of permission or public, and a response schema                     |
| `HTTP_CONFIG_INVALID`         | 500    | A limit is not a positive number                                                     |
| `HTTP_NOT_READY`              | 503    | The server is starting or shutting down                                              |
| `HTTP_STAGE_INVALID`          | 500    | A plugin can hook `afterAuth`, `beforeHandler`, `afterHandler` and `onResponse` only |
| `HTTP_VALIDATION_FAILED`      | 400    | The input does not match the schema. See `errors`                                    |
| `HTTP_BODY_INVALID`           | 400    | The body is not valid JSON                                                           |
| `HTTP_BODY_TOO_LARGE`         | 413    | Send less. Files go straight to storage                                              |
| `HTTP_UNSUPPORTED_MEDIA_TYPE` | 415    | Send `application/json`                                                              |
| `HTTP_NOT_FOUND`              | 404    | No such route                                                                        |
| `HTTP_REQUEST_TIMEOUT`        | 408    | The request took longer than the limit                                               |
| `HTTP_TOO_MANY_REQUESTS`      | 429    | Wait for `Retry-After`                                                               |
| `HTTP_UNAUTHENTICATED`        | 401    | Sign in                                                                              |
| `HTTP_FORBIDDEN`              | 403    | The user does not have the permission of the route                                   |
| `HTTP_INTERNAL`               | 500    | A bug. The trace id finds it in the logs                                             |

## Configuration

Reads `APP_ENV`, `APP_PORT` and `TRUST_PROXY` through `CoreEnv`. It reads no environment variable itself (P8). `TRUST_PROXY` goes to Fastify's `trustProxy`, so `request.ip` is the client when a proxy is trusted and the socket address when it is not.

## Tests

`vitest` with `server.inject` for everything except shutdown, which listens on port 0. Each rule above has a test named after its requirement, and one test checks the order of the 12 stages by recording each of them.

## Decisions

1. **A facade over Fastify, no escape hatch.** Plugin authors see `route`, `stage` and the context, not Fastify's types, so a later change of server library touches this package only. The cost is that a Fastify plugin cannot be used as it is. Anything that a project needs is added here, as a stage or a port (P1).
2. **Ports, not auth.** The stages 3, 5 and 8 call interfaces. The maintainer designs authentication and authorization in M1.4, and an HTTP package that decided them would decide them first.
3. **Validation before authorization** follows §13.4 (stage 7, then 8). A body that is invalid is 400 even for a user who may not call the route. The authentication of stage 3 still comes first, so the anonymous get 401 before they learn anything about the shape.
4. **`type` is a URN.** There is no documentation site yet to link to, and `urn:bieberkit:error:<code>` is stable and unique. A later change to a URL is an additive change, because `code` is the field that clients read.
5. **Routes are checked at boot.** A missing permission is found when the server starts and not when someone calls the route. `bieberkit check` repeats the same rule on the source (API-02).
6. **`afterAuth` is after stage 6.** It runs once the principal, the tenant and the CSRF check are done, so a plugin hook can rely on all three.

## Found while implementing slice 1

- **Fastify validates one part at a time.** It stops at the first part that fails, so a request with a bad id and a bad body would list only the id. The server does not hand the input schemas to Fastify. It checks params, query and body itself in `preValidation`, after Fastify has parsed the body, and lists every problem.
- **Fastify reads `text/plain` by default.** The parser is removed, so that the content type answers 415 and not a confusing 400.
- **`TRUST_PROXY` as a number** is a count of proxies, which Fastify takes as a function of the hop.
- **A connection that goes idle after `close()` stays open** until its keep-alive timeout, so the shutdown waits 65 s. While the server drains, every answer carries `Connection: close`, and the idle connections are swept every 50 ms until the close is done.
- **Stage 3 answers 401 at once** for a route that needs a permission, before the body is read. The authorizer of stage 8 only decides between 200 and 403.
- **`onResponse` runs for failures too**, so the log line and the metrics of stage 12 see every request.
- **A status without a response schema is a 500.** Fastify would write such a body with `JSON.stringify`, which leaks what the schema was meant to drop.
- **A test run uses the built `dist` of the packages that a package imports**, not their sources, in spite of the `@bieberkit/source` condition in `vitest.config.ts`. A stale build of `@bieberkit/data` failed the first run of this package with "issuesOf is not a function". Run `pnpm build` before the tests, as CI does.

## Open questions

None for slice 1.

## Slice 2: entity routes

Designed on 2026-11-23. None of it is maintainer-designed (§13.1, §10.2, API-08, API-13 and DATA-06 to DATA-11 decide it). Slice 1 was merged into `main` before it started.

### Public API

```ts
registerEntityRoutes(server: HttpServer, schemas: readonly OrmSchema[], options: { db: Database }): void
entityRoutes(schema: OrmSchema, context: EntityRoutesContext): RouteDef[]     // the routes of one entity, for tests and for the OpenAPI document
// RouteContext gains: headers (the request headers), header(name, value) (a header of the answer)
// RouteSchema gains nothing. A route that answers 204 declares { 204: { type: 'null' } }.
// @bieberkit/data/orm gains: ListOptions.offset, entityEventName(entity, verb)
```

`schemas` are the compiled schemas of the project (`compileEntities`). A relation is included only when the schema of its target is in the list.

### The routes

An entity gets the routes that its `api` options turn on. `<module>` is the part of the name before the dot, and `<resource>` is the table without the `<module>_` prefix, with hyphens: `crm.Customer` on `crm_customers` is `/api/v1/crm/customers`.

| Option   | Route                    | Permission | Answer                                      |
| -------- | ------------------------ | ---------- | ------------------------------------------- |
| `list`   | `GET /<resource>`        | read       | 200 `{ data: [row], meta }`                 |
| `get`    | `GET /<resource>/:id`    | read       | 200 `{ data: row }`, `ETag: W/"<version>"`  |
| `create` | `POST /<resource>`       | create     | 201 `{ data: row }`, `Location`             |
| `update` | `PATCH /<resource>/:id`  | update     | 200 `{ data: row }`. `If-Match` is required |
| `delete` | `DELETE /<resource>/:id` | delete     | 204. `If-Match` is required                 |

The permission is `permissions.<action>` of the entity, and when it is missing `<module>.<entity in snake case>.<action>`, such as `crm.customer.read`. List and get share `read`. An `api` without options has no routes.

### Rules

- **Writes use the data layer and write like §7.5.** A create, update or delete runs in `runInUnitOfWork`. The service loads the row, checks `If-Match` with `expectVersion`, changes it with `toOrmData`, adds an outbox event (`crm.customer.created`, `.updated`, `.deleted`) and an audit entry (`crm.Customer.create`, `.update`, `.delete`), and flushes once. So the data, the event and the audit entry are one transaction, and a stale row fails the flush as 412 (API-13).
- **`If-Match` is required on update and delete.** A request without it is 428 `HTTP_PRECONDITION_REQUIRED`. A value that is not a version is 400. A stale version is 412 `DATA_VERSION_STALE` with the current row in the problem as `current`, so the client can show the conflict (API-13).
- **A delete is a soft delete when the entity has `softDelete`**, and a removal of the row otherwise.
- **The body is normalized to NFC before it is validated**, for every route, so lengths and uniqueness count composed text (SCH-05). The create and update schemas of the entity are the body schemas, and an unknown field is refused (SEC-04).
- **Lists (§13.1).** Query parameters: `pageSize` (25, at most 100), `page` or `cursor`, `sort=-createdAt,name`, `filter[field][op]=value`, `include=owner`, `fields=code,name`, `locale=vi`, `withTotal=true`. Any other parameter is a validation error. `page` is an offset (`page` times `pageSize` is at most 10 000, and a deeper page is 400 `HTTP_PAGE_TOO_DEEP` that says to use a cursor), and `cursor` is the keyset of DATA-06. Both together are refused. The answer is `{ data, meta: { pageSize, page?, nextCursor, total? } }`.
- **Filters and sorts are only on indexed fields** (DATA-07): the data layer decides and answers `DATA_FIELD_NOT_INDEXED`. Operators are `eq`, `ne`, `in` (comma separated), `lt`, `lte`, `gt`, `gte` and `null` (`true` or `false`). A value is read as the type of the field: a number for `int`, `true` or `false` for `boolean`, and text otherwise. A field of a kind that cannot be filtered (money, decimal) is a validation error. A relation is filtered by `ownerId`.
- **`fields` and `include`.** `fields` lists the keys of the answer besides `id` and `version`, which are always there. A key that is not in the read shape is 400 `HTTP_FIELDS_INVALID`. `include` names to-one relations. Each is loaded with one extra query for the whole page, and the answer has the related row under the relation name (`owner`), as its own read shape without its relations. The row shape in a response schema has no `required` list, so a row with fewer fields is valid, and the schema still names every field that may leave the server (API-01).
- **One query per relation, never per row (PERF-04).** The list route reads through `listPage`, which uses `select-in`. A test counts the queries for 5 rows and for 30 and they are equal.
- **ETag (API-08), stage 11.** A `GET` that answers 200 and has no ETag gets a weak one made from the body, and `If-None-Match` that matches answers 304 with no body. The get route sets `W/"<version>"` itself, which is what a client sends back as `If-Match`. Every GET has `Cache-Control: private, no-cache` unless the route set one (public caching is slice 3).
- **Tenants, soft delete and field masks are the data layer's and the ability's.** The routes add nothing: a row of another tenant is a 404, and field masks arrive with CASL in M1.4.

### Errors of slice 2

| Code                         | Status | Fix                                                            |
| ---------------------------- | ------ | -------------------------------------------------------------- |
| `HTTP_PRECONDITION_REQUIRED` | 428    | Send `If-Match` with the version that you read                 |
| `HTTP_PAGE_TOO_DEEP`         | 400    | Use `cursor` to go deeper than 10 000 rows                     |
| `HTTP_FIELDS_INVALID`        | 400    | `fields` and `include` name fields and relations of the entity |

### Found while implementing slice 2

- **`page` needed an offset in the data layer.** The keyset of DATA-06 has no page numbers, so `listPage` has an `offset` (not with a cursor, at most 1 000 000, and the route stops at 10 000 rows). `nextCursor` is left out of a page that was asked for by number.
- **A filter for `null` failed on a compared field.** `email` is folded, and a `null` has no folded text. The query now keeps `null` as `null`, so `filter[email][null]=true` finds the rows with no e-mail.
- **A database refusal is a client error.** A second row with a used unique value raised the exception of the driver, which was a 500. The problem mapping reads the name of the exception and answers 409 `HTTP_CONFLICT` for a unique or foreign key violation, without the HTTP package importing the ORM.
- **The row of a write is built from the entity.** After the flush the entity has its `id`, `version`, sequence number and `createdBy`, so the answer does not read the row again, and it cannot read an old copy from a replica.
- **A text of `filter[...]` is a key, not a nested object.** Fastify's query parser does not nest, so the list schema has a `patternProperties` for the keys and the handler reads them.
- **`expectVersion` takes any object.** It read `row.version`, which a loaded entity of a schema does not declare.

### Left out

- **`q=` text search** waits for the search contract (§15.7). The parameter is refused until then.
- **Field masks and permission conditions** are M1.4. The routes ask for the permission only.
- **`hasMany` and `hasOne`** are not in the row shape yet, so `include` takes `belongsTo` relations only.

## Slice 3: transitions, bulk, idempotency, deprecation and cache headers

Designed on 2026-11-23. None of it is maintainer-designed (MOD-06, API-09, API-14, API-16, API-17 and §13.1 decide it). Slice 2 was merged into `main` before it started.

**Left for a later slice:** the aggregate endpoint (API-15) and the custom `actions` of an entity. Aggregation needs a new modifier `.aggregatable()` in the field DSL and an aggregation in the data layer that applies the tenant filter by hand, and the DSL is maintainer-designed. A custom action has no declared result schema in `ActionDef`, so its answer could not go through a schema (API-01).

### Public API

```ts
// RouteDef gains
idempotent?: true                                              // POST only
deprecated?: { since?: string; sunset?: string; link?: string }  // dates are YYYY-MM-DD
cache?: { sMaxAge: number; staleWhileRevalidate?: number; tags?: readonly string[] }   // public GET only
// RouteContext gains
can(permission: string): Promise<boolean>                      // the authorizer, for a check that depends on the request
// HttpServerOptions gains
idempotencyStore?: IdempotencyStore                            // defaults to a memory store, for one process

interface IdempotencyStore {
  begin(key: string, fingerprint: string): Promise<{ state: 'new' } | { state: 'replay'; response: StoredResponse } | { state: 'mismatch' } | { state: 'busy' }>
  complete(key: string, response: StoredResponse): Promise<void>
  abandon(key: string): Promise<void>
}
createMemoryIdempotencyStore(options?: { ttlMs?: number; now?: () => number }): IdempotencyStore
```

### Rules

- **Transition routes (MOD-06).** An entity with a state field gets `POST /<resource>/:id/actions/<transition>` for each transition, when its `api` has any operation on. The permission is the one of the transition, and `update` of the entity when the transition has none. `If-Match` is required, as for an update (API-13). The body is the input of the transition, checked by the schema that the transition declares (422 `DATA_TRANSITION_INPUT_INVALID`), and an empty body is no input. The answer is the row after the transition. The event, the audit entry and the timeline entry are the ones of `transition` in the data layer, written in the same transaction.
- **Bulk (API-14, API-17).** `POST /<resource>/bulk` takes `{ operation: 'update' | 'delete' | 'transition', items: [{ id, version }], data?, transition?, input? }`. It has up to 500 items (400 above that, and an id twice is 400). The route needs `read`, and the handler asks `ctx.can` for what the operation needs (`update`, `delete`, or the permission of the transition), so a user may bulk delete without being allowed to update. Every item carries the version that the client read. The answer is 200 `{ data: [{ id, status, version?, error? }], meta: { requested, succeeded, failed } }`, with `status` one of `ok`, `conflict` (a stale version, with the current version), `not_found` and `invalid` (a transition that does not start from the state of the row, or a bad input). The rows that are `ok` are saved in one transaction with their events and audit entries, so a failure of the database stops the whole request and nothing is saved.
- **More than 100 rows are refused for now.** The spec runs them as a queued job (API-14, PERF-05). The queue is M1.5, so 101 to 500 items are 422 `HTTP_BULK_TOO_LARGE`, which says so. Running them inline would break the rule that a web request does not do long work.
- **`Idempotency-Key` (§13.1).** A POST route with `idempotent: true` honors the header when it is sent (1 to 255 visible characters, else 400). The key is kept per principal, method, url and key. The first request runs. A later one with the same key and the same body gets the stored answer with `Idempotency-Replayed: true`. The same key with another body is 422 `HTTP_IDEMPOTENCY_KEY_REUSED`, and the same key while the first request is still running is 409 `HTTP_IDEMPOTENCY_IN_PROGRESS`. Only a 2xx answer is stored: a request that failed can be sent again with the same key. The create route of every entity is idempotent. The memory store is for one process, and a shared store arrives with the cache of M1.5.
- **Deprecation (API-16).** A deprecated route sends `Deprecation: @<unix seconds of since>` (RFC 9745), `Sunset: <HTTP date>` (RFC 8594) and `Link: <link>; rel="deprecation"`, for the fields that are set, on every answer. The OpenAPI document of slice 4 lists the route as deprecated.
- **Cache headers (API-09).** A public GET with `cache` answers `Cache-Control: public, s-maxage=<n>, stale-while-revalidate=<m>` and `Cache-Tag: a,b`, instead of `private, no-cache`. A route that has `cache` and is not public, or is not a GET, is refused at registration, because a shared cache must never hold an answer that depends on who asked.

### Found while implementing slice 3

- **A replay is sent from a hook.** The stored answer is sent in `preHandler`, after validation and authorization, and the hook returns the reply so that the handler does not run. `onSend` keeps the answer of a request that ran, and it is `async`, so the answer is stored before the client can see it and retry.
- **Only a 2xx answer is stored.** A 4xx or 5xx abandons the key, so a request that failed for a wrong body or a crash can be sent again with the same key. A request that fails validation never claims the key.
- **A date needs two checks.** `2026-13-45` matches the shape of a date, and `Date.parse` is `NaN` for it, which `toISOString` turns into a `RangeError`.
- **`Date.parse` of the day gives the second of the deprecation.** `Deprecation: @<unix seconds>` is the day at 00:00 UTC.
- **A body schema of `{}` accepts no body and any body.** The transition routes use it, because the shape of the input belongs to the transition and not to the route.
- **A bulk request is one `find` and one flush.** The rows come with one query by `id in (...)`, each item is checked against its own version, and the changes of the rows that passed go to the database together.

### Errors of slice 3

| Code                           | Status | Fix                                                              |
| ------------------------------ | ------ | ---------------------------------------------------------------- |
| `HTTP_BULK_TOO_LARGE`          | 422    | Send up to 100 items until the queue exists                      |
| `HTTP_IDEMPOTENCY_KEY_INVALID` | 400    | Use 1 to 255 visible characters                                  |
| `HTTP_IDEMPOTENCY_KEY_REUSED`  | 422    | The key was used for another request. Use a new key              |
| `HTTP_IDEMPOTENCY_IN_PROGRESS` | 409    | The first request with this key is still running. Wait and retry |

## Slice 4: OpenAPI and `_meta`

Designed on 2026-11-23. None of it is maintainer-designed (API-06, API-07, META-01 to META-05 and UI-02 decide it). Slice 3 was merged into `main` before it started.

### Public API

```ts
openApiDocument(routes: readonly RouteDef[], info: { title: string; version: string }): OpenApiDocument       // pure
registerOpenApi(server: HttpServer, info): void                // GET /api/v1/openapi.json
registerMeta(server: HttpServer, entities: readonly EntityDef<string>[], options?: { locales?: readonly string[] }): void   // GET /api/v1/_meta
META_SCHEMA: JsonSchema                                        // the JSON Schema of the _meta answer (META-05)
// HttpServer gains routes(): readonly RouteDef[]               // the routes that were added, not the probes of the server
// HttpEnv gains API_DOCS_PUBLIC: boolean
```

### OpenAPI 3.1 (API-06)

- **The document is made from the routes.** Every route that was added to the server is an operation. Its `schema.params` and `schema.query` become parameters, its `schema.body` the request body, and each `schema.response` a response. JSON Schema 2020-12 is the dialect of OpenAPI 3.1, so the schemas go in as they are, without `$schema` and `$id`.
- **Paths use `{id}`**, and an operation has an `operationId` made of the method and the path (`getCrmAccountsById`), which is unique. Paths and methods are sorted, so the same routes give the same bytes.
- **Errors.** Every operation has a `default` response of `application/problem+json` that refers to `#/components/schemas/Problem`, which is the problem of RFC 9457 with `code`, `traceId` and `errors`.
- **Security.** A route with a `permission` has `security` of the session cookie or a bearer API key, and `x-permission`. A public route has `security: []`.
- **Filters.** `filter[field][op]` is one `deepObject` parameter named `filter`, because OpenAPI cannot list a pattern of names.
- **Deprecation (API-16).** A deprecated route has `deprecated: true` and `x-sunset` with the date.
- **Who may read it.** In development and test it is public. In production it is public only when `API_DOCS_PUBLIC` is true, and otherwise the route needs the permission `system.api-docs` (401 or 403). The route is registered one way or the other when the server starts, so the rule is the same declared rule as for any route (API-02).
- **The client (API-07)** is generated from this document by the build of M1.8. This slice makes the document.

### `_meta` (META-01 to META-05, UI-02)

`GET /api/v1/_meta` answers what the admin shell needs, for the caller and the tenant of the request. It is public in the sense of API-02, and the handler answers 401 when nobody is signed in.

```jsonc
{
  "schemaVersion": 1,
  "entities": [
    {
      "name": "crm.Account",
      "path": "/api/v1/crm/accounts",
      "label": { "en": "Account" },
      "operations": { "list": true, "get": true, "create": true, "update": true, "delete": true },
      "can": { "read": true, "create": true, "update": true, "delete": false },
      "features": ["comments"],
      "softDelete": true,
      "tenant": true,
      "title": "name",
      "list": ["code", "name"],
      "icon": "users",
      "fields": [
        {
          "key": "tier",
          "kind": "oneOf",
          "widget": "select",
          "required": false,
          "readOnly": false,
          "default": "basic",
          "values": ["basic", "gold"],
          "filterable": true,
          "sortable": true,
          "validation": { "type": "string", "enum": ["basic", "gold"] },
        },
      ],
      "form": ["code", "name", "tier"],
      "transitions": [
        {
          "name": "open",
          "from": ["new"],
          "to": "open",
          "permission": "crm.account.update",
          "allowed": true,
          "path": "/api/v1/crm/accounts/{id}/actions/open",
        },
      ],
    },
  ],
  "menu": [],
  "dashboards": [],
  "permissions": ["crm.account.read"],
  "locales": [],
}
```

- **Only what the caller may see (META-04).** An entity is in the answer when the caller has its `read` permission. A field whose `permissions.fields.<name>.read` the caller lacks is left out, and one whose `update` is lacking is `readOnly`. There are no rows, secrets or tenant ids in it. `permissions` lists the permissions of the entities and transitions that the caller has.
- **Types and hints (META-02).** `kind` is the kind of the field, `widget` is a hint from it (`text`, `textarea`, `email`, `select`, `switch`, `number`, `decimal`, `money`, `date`, `datetime`, `relation`, `readonly`), and `validation` is the JSON Schema of the field in the create shape, or the read shape for a field that the server fills. `filterable` and `sortable` follow the index rule (DATA-07). A relation names its target (`{ entity, path }`).
- **Layouts.** `list` and `title` come from `admin`, and `form` is the writable fields in the order of the entity.
- **Menus and dashboards** belong to plugins and come with the plugin system. They are empty lists now, so the shape does not change later.
- **Caching (META-03).** The body is the same for the same entities, permissions and tenant, and it has an ETag, so the shell sends `If-None-Match` and gets 304. The static part of each entity is built once, when `registerMeta` is called, and each request only filters it. A cache of the answer by role set belongs to `@bieberkit/auth`, which knows the role set.
- **The shape is published (META-05).** `META_SCHEMA` is exported, the route answers through it, and a test validates a real answer against it with Ajv.

### Found while implementing slice 4

- **fast-json-stringify drops what a schema does not name**, also for a document. The route of `openapi.json` answers through `{ type: 'object', additionalProperties: true }`, so the document is written as it is. The route of `_meta` answers through `META_SCHEMA`, which names every field, so a field that is not in the published schema never leaves the server.
- **The key of a relation in the API is `ownerId`.** The fields of `_meta` use the keys of the API, so an adapter reads and writes the same names that the routes use.
- **Whether `openapi.json` is public is decided when the server starts.** The route is registered with `public: true` or with `permission: 'system.api-docs'`, so `bieberkit check` sees the same rule as for any other route.
- **`If-Match` and `Idempotency-Key` are documented from the route.** A route that needs the header says so with `requiresIfMatch`, and an idempotent one lists the optional header, so a generated client sends them (API-07).
- **`_meta` for a caller with no permission is an empty list**, not an error: the shell can still draw its frame and show that there is nothing.

## Slice 5: security headers, CORS, CSRF and `http.fetch`

Designed on 2026-11-23. None of it is maintainer-designed (SEC-01 to SEC-04, SEC-06, WH-04 and API-12 decide it). Slice 4 was merged into `main` before it started. The session itself (the cookie, its id, the signing) is `@bieberkit/auth`, so CSRF here only asks the principal for what it needs.

### Public API

```ts
// HttpServerOptions gains
headers?: Readonly<Record<string, string | false>>         // overrides of the security headers. false removes one
cors?: { origins: readonly string[]; credentials?: boolean; maxAgeSeconds?: number }
csrf?: CsrfProtection

createCsrf(secret: string): CsrfProtection
interface CsrfProtection { issue(sessionId: string): string; verify(token: string, sessionId: string): boolean }
registerCsrfToken(server: HttpServer): void                 // GET /api/v1/csrf gives the token of the session of the caller
// Principal gains: via?: 'cookie' | 'token', sessionId?: string

createHttpFetch(options?: HttpFetchOptions): HttpFetch      // the SSRF guarded fetch (SEC-06, WH-04)
interface HttpFetchOptions { allow?: readonly string[]; connectTimeoutMs?: number; timeoutMs?: number; retries?: number; backoffMs?: number;
                             maxRedirects?: number; maxResponseBytes?: number; failureThreshold?: number; openMs?: number }
isBlockedAddress(address: string): boolean
```

### Security headers (SEC-01)

Every answer, also an error and a 304, carries:

| Header                      | Value                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `Content-Security-Policy`   | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`                |
| `X-Content-Type-Options`    | `nosniff`                                                                                        |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`               |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`, in production, and on any request that arrived over https |

The policy is that of a JSON API, which renders nothing. The admin and the site have their own policies (hashes and nonces, SEC-01), and they set them where they serve their pages. `headers` replaces the value of one header, or removes it with `false`, for a server that also serves pages.

### CORS (SEC-02)

- **An explicit list of origins.** `cors.origins` takes origins only (`https://admin.example.com`, with scheme, host and optional port, and no path). `*`, `null` and anything else are refused when the server is made (`HTTP_CONFIG_INVALID`). With no `cors`, no origin is allowed, and a browser may call the API only from its own origin.
- **An allowed origin** gets `Access-Control-Allow-Origin` with that origin, `Vary: Origin`, `Access-Control-Allow-Credentials: true` (unless `credentials: false`) and `Access-Control-Expose-Headers` for the headers that clients read (`x-request-id`, `etag`, `location`, `retry-after`, `idempotency-replayed`). An origin that is not allowed gets none of them, so the browser blocks the answer. The answer still carries `Vary: Origin`, so a cache cannot give one origin the answer of another.
- **A preflight** (an `OPTIONS` with `Origin` and `Access-Control-Request-Method`) is answered before authentication and rate limiting, because a browser sends it with no credentials. From an allowed origin it is 204 with the methods, the headers that the API reads and `Access-Control-Max-Age` (600 s). From another origin it is 403 `HTTP_CORS_DENIED`.

### CSRF (SEC-03, stage 6)

For a request that changes state (`POST`, `PUT`, `PATCH`, `DELETE`) from a principal that signed in with a cookie:

1. A principal that came with a token (`via: 'token'`) or a service (`kind: 'service'`, API-12) is not checked: nothing in a browser attaches those by itself.
2. `Sec-Fetch-Site: same-origin` passes. It is the primary check, and a browser sends it and a page cannot change it.
3. Anything else (the header missing, `same-site`, `cross-site`, `none`) needs a valid `X-CSRF-Token`, which is signed with HMAC-SHA256 and bound to the session id, and an `Origin` header, when there is one, that is the origin of the server or in `cors.origins`.
4. No token, an invalid token or a token of another session is 403 `HTTP_CSRF_FAILED`. With no `csrf` option no token is valid, so only same-origin requests pass: the server fails closed.

The token comes from `GET /api/v1/csrf`, which answers 401 for a caller with no session id. A GET is never checked, and nothing here changes state on a GET: a route that does is a bug, and `bieberkit check` reports it.

### `http.fetch` (SEC-06, WH-04)

An outbound `fetch` that webhooks and integrations use.

- **Addresses that are blocked.** The host is resolved, and every address must be public. Blocked are loopback, private (`10/8`, `172.16/12`, `192.168/16`), link-local and the cloud metadata address (`169.254/16`), shared address space (`100.64/10`), unspecified, multicast, reserved and benchmarking ranges, and for IPv6 `::1`, `::`, unique local (`fc00::/7`), link-local (`fe80::/10`), multicast and documentation ranges. An IPv4 address inside an IPv6 one (`::ffff:10.0.0.1`) is read as the IPv4 address. A host with one blocked address among several is blocked.
- **No DNS rebinding.** The connection goes to the address that was checked, not to a second lookup: the check is in the `lookup` of the socket.
- **The allowlist.** `allow` takes host names and addresses or ranges (`internal.example.com`, `10.1.2.3`, `10.0.0.0/8`). A host name in it may resolve to a blocked range. An address or range in it is allowed even when it is blocked.
- **Redirects.** At most 3, each checked as a new request. A redirect to another scheme than http and https is refused.
- **Timeouts and size.** 5 s to connect and 30 s in all (WH-04), and a response of more than 10 MiB is cut off.
- **Retries.** Only a request that is idempotent: GET, HEAD, PUT, DELETE and OPTIONS, and a POST that sends `Idempotency-Key`. Two retries after a network error or a 502, 503 or 504, with a wait that doubles from 200 ms.
- **A circuit breaker for each host.** After 5 failures in a row (a network error, a timeout or a 5xx) the host is open for 30 s, and calls fail at once with `HTTP_FETCH_CIRCUIT_OPEN`. After that one trial goes through: a success closes the circuit, and a failure opens it again.

### Errors of slice 5

| Code                      | Status | Fix                                                                       |
| ------------------------- | ------ | ------------------------------------------------------------------------- |
| `HTTP_CORS_DENIED`        | 403    | The origin is not in the list that the server allows                      |
| `HTTP_CSRF_FAILED`        | 403    | Send `X-CSRF-Token` from `GET /api/v1/csrf`, or call from the same origin |
| `HTTP_FETCH_BLOCKED`      | 400    | The address is private or reserved. Add it to `allow` if it is meant      |
| `HTTP_FETCH_TIMEOUT`      | 504    | The host did not answer in time                                           |
| `HTTP_FETCH_FAILED`       | 502    | The call failed. The cause has the detail                                 |
| `HTTP_FETCH_TOO_LARGE`    | 502    | The response is larger than `maxResponseBytes`                            |
| `HTTP_FETCH_CIRCUIT_OPEN` | 503    | The host failed too often. Try again after `openMs`                       |

### Found while implementing slice 5

- **Every API client of the earlier tests became a browser.** A principal that does not say how it came counts as a cookie caller, so the POSTs of the old tests failed the CSRF check at once. They now say `via: 'token'`, which is also what a real API client is. The default is the safe one: a new kind of principal is checked until its authenticator says that it is not a browser.
- **The check of a redirect is the check of a request.** Each hop goes through `resolve`, so a redirect to `169.254.169.254` or to `ftp:` is refused like a first call, and `Authorization` is dropped when the host changes.
- **A refusal of ours is not retried.** A call that passed 3 redirects failed 3 times, because a retry looked like a network failure. Only a timeout and a failure that has a cause (a reset, a refused connection) are tried again.
- **`BlockList` does the ranges.** `node:net` has subnets for IPv4 and IPv6 and no dependency is needed. An IPv4 address inside an IPv6 one is turned into IPv4 first, because `BlockList` does not look inside it.
- **A literal address is checked before the socket exists.** Node does not call `lookup` for `127.0.0.1` or `[::1]`, so the guard checks a literal itself. The numbers `2130706433` and `0x7f.1` are made `127.0.0.1` by the URL parser, and are refused as that.
- **The check of CORS and the check of CSRF share the list of origins.** An origin that may call the API may also carry a token, and nothing else may.
