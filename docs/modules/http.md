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
