<!--
  BieberKit

  @file        packages/http/api/index.api.md
  @description API report of @bieberkit/http: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
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

# API report: @bieberkit/http

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { BkError, ErrorReporter, Lifecycle, Logger, Metrics, ServiceRegistry, Tracer } from "@bieberkit/core";
import { Database, OrmSchema } from "@bieberkit/data/orm";
import { EntityDef, JsonSchema } from "@bieberkit/data/schema";
import { JobDef, Queue } from "@bieberkit/queue";
import { ValidationIssue } from "@bieberkit/data/build";
interface StoredResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}
type IdempotencyBegin = {
  readonly state: "new";
} | {
  readonly state: "replay";
  readonly response: StoredResponse;
} | {
  readonly state: "mismatch";
} | {
  readonly state: "busy";
};
interface IdempotencyStore {
  begin(key: string, fingerprint: string): Promise<IdempotencyBegin>;
  complete(key: string, response: StoredResponse): Promise<void>;
  abandon(key: string): Promise<void>;
}
interface MemoryIdempotencyOptions {
  readonly ttlMs?: number;
  readonly now?: () => number;
}
export declare function createMemoryIdempotencyStore(options?: MemoryIdempotencyOptions): IdempotencyStore;
interface CorsOptions {
  readonly origins: readonly string[];
  readonly credentials?: boolean;
  readonly maxAgeSeconds?: number;
}
interface Principal {
  readonly id: string;
  readonly kind: "user" | "apiKey" | "service";
  readonly via?: "cookie" | "token";
  readonly sessionId?: string;
  readonly mfa?: boolean;
  readonly grants?: readonly string[];
  readonly tenantId?: string;
}
interface RequestInfo {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly ip: string;
}
interface Authenticator {
  authenticate(request: RequestInfo): Promise<Principal | undefined>;
}
interface TenantResolver {
  resolve(request: RequestInfo, principal: Principal | undefined): Promise<string | undefined>;
}
interface AccessAnswer {
  readonly allowed: boolean;
  readonly reason?: "no-permission" | "unsupported-condition";
  readonly scope?: Readonly<Record<string, unknown>>;
  readonly readable?: ReadonlySet<string>;
  readonly writable?: ReadonlySet<string>;
}
interface Authorizer {
  can(principal: Principal, permission: string, request: RequestInfo): Promise<boolean>;
  access?(principal: Principal, entity: string, action: string, request: RequestInfo): Promise<AccessAnswer>;
  allows?(principal: Principal, entity: string, action: string, row: Readonly<Record<string, unknown>>, request: RequestInfo): Promise<boolean>;
}
interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}
interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export declare const METHODS: readonly Method[];
interface RouteSchema {
  readonly params?: JsonSchema;
  readonly query?: JsonSchema;
  readonly body?: JsonSchema;
  readonly response: Readonly<Record<number, JsonSchema>>;
}
interface RouteContext {
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly principal: Principal | undefined;
  readonly tenantId: string | undefined;
  readonly requestId: string;
  readonly traceId: string;
  readonly log: Logger;
  readonly services: ServiceRegistry;
  status(code: number): void;
  header(name: string, value: string): void;
  can(permission: string): Promise<boolean>;
  access(entity: string, action: string): Promise<AccessAnswer>;
  allows(entity: string, action: string, row: Readonly<Record<string, unknown>>): Promise<boolean>;
}
interface RouteDef {
  readonly method: Method;
  readonly url: string;
  readonly permission?: string;
  readonly public?: true;
  readonly schema: RouteSchema;
  readonly requiresIfMatch?: true;
  readonly idempotent?: true;
  readonly deprecated?: {
    readonly since?: string;
    readonly sunset?: string;
    readonly link?: string;
  };
  readonly cache?: {
    readonly sMaxAge: number;
    readonly staleWhileRevalidate?: number;
    readonly tags?: readonly string[];
  };
  handler(ctx: RouteContext): unknown;
}
export declare function defineRoute(route: RouteDef): RouteDef;
interface HttpEnv {
  readonly APP_ENV: "development" | "test" | "production";
  readonly APP_PORT: number;
  readonly TRUST_PROXY: boolean | number;
  readonly API_DOCS_PUBLIC: boolean;
}
export declare const STAGE_NAMES: readonly ["afterAuth", "beforeHandler", "afterHandler", "onResponse"];
type StageName = (typeof STAGE_NAMES)[number];
interface StageContext {
  readonly method: string;
  readonly path: string;
  readonly principal: Principal | undefined;
  readonly tenantId: string | undefined;
  readonly requestId: string;
  readonly traceId: string;
  readonly result?: unknown;
  readonly status?: number;
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
type StageHook = (context: StageContext) => void | Promise<void>;
interface MountDef {
  readonly prefix: string;
  readonly handler: (request: Request) => Promise<Response>;
}
interface HttpServerOptions {
  readonly logger?: Logger;
  readonly authenticator?: Authenticator;
  readonly tenantResolver?: TenantResolver;
  readonly authorizer?: Authorizer;
  readonly ipLimiter?: RateLimiter;
  readonly userLimiter?: RateLimiter;
  readonly bodyLimit?: number;
  readonly requestTimeoutMs?: number;
  readonly keepAliveTimeoutMs?: number;
  readonly headers?: Readonly<Record<string, string | false>>;
  readonly cors?: CorsOptions;
  readonly csrf?: CsrfProtection;
  readonly idempotencyStore?: IdempotencyStore;
  readonly errorReporter?: ErrorReporter;
  readonly tracer?: Tracer;
  readonly metrics?: Metrics;
  readonly services?: ServiceRegistry;
}
interface InjectOptions {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly payload?: string | object;
}
interface InjectResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | number | undefined>;
  readonly body: string;
}
interface HttpServer {
  route(route: RouteDef): void;
  mount(mount: MountDef): void;
  fallback(handler: (request: Request) => Promise<Response | undefined>): void;
  stage(name: StageName, hook: StageHook): void;
  inject(request: InjectOptions): Promise<InjectResponse>;
  listen(options?: {
    port?: number;
    host?: string;
  }): Promise<{
    address: string;
    port: number;
  }>;
  markReady(): void;
  stop(options?: {
    drainMs?: number;
    timeoutMs?: number;
  }): Promise<{
    timedOut: boolean;
  }>;
  readonly settings: Readonly<{
    bodyLimit: number;
    requestTimeoutMs: number;
    keepAliveTimeoutMs: number;
  }>;
  routes(): readonly RouteDef[];
  readonly docsPublic: boolean;
  readonly csrf: CsrfProtection | undefined;
}
export declare function createHttpServer(env: HttpEnv, options?: HttpServerOptions): HttpServer;
interface CsrfProtection {
  issue(sessionId: string): string;
  verify(token: string, sessionId: string): boolean;
}
export declare function createCsrf(secret: string): CsrfProtection;
export declare function registerCsrfToken(server: HttpServer): void;
export declare class HttpFetchError extends BkError {}
export declare function isBlockedAddress(address: string): boolean;
interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}
interface HttpFetchOptions {
  readonly allow?: readonly string[];
  readonly connectTimeoutMs?: number;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly backoffMs?: number;
  readonly maxRedirects?: number;
  readonly maxResponseBytes?: number;
  readonly failureThreshold?: number;
  readonly openMs?: number;
  readonly lookup?: (host: string) => Promise<readonly ResolvedAddress[]>;
  readonly now?: () => number;
}
interface HttpFetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string> | Headers | [string, string][];
  readonly body?: string | Uint8Array;
  readonly redirect?: "follow" | "manual" | "error";
}
interface HttpFetch {
  fetch(input: string | URL, init?: HttpFetchInit): Promise<Response>;
}
export declare function createHttpFetch(options?: HttpFetchOptions): HttpFetch;
interface Authorization {
  can(permission: string): Promise<boolean>;
  allows(entity: string, action: string, row: Readonly<Record<string, unknown>>): Promise<boolean>;
  access(entity: string, action: string): Promise<AccessAnswer>;
}
export declare function authorizationFor(authorizer: Authorizer | undefined, principal: Principal | undefined, info: RequestInfo): Authorization;
interface BulkInput {
  readonly entity: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly principal: Principal | undefined;
}
interface BulkQueue {
  enqueue(input: BulkInput): Promise<{
    readonly id: string;
    readonly location: string;
  }>;
}
export declare const MAX_BULK_INLINE: number;
export declare const MAX_BULK: number;
export declare const BULK_JOB = "http.bulk";
export declare const JOBS_PATH = "/api/v1/_jobs";
interface BulkJobOptions {
  readonly db: Database;
  readonly schemas: readonly OrmSchema[];
  readonly authorizer?: Authorizer;
}
interface BulkJob {
  readonly job: JobDef<BulkInput>;
  over(queue: Queue): BulkQueue;
}
export declare function createBulkJob(options: BulkJobOptions): BulkJob;
export declare function registerJobRoutes(server: HttpServer, options: {
  readonly queue: Queue;
}): void;
interface EntityRoutesContext {
  readonly db: Database;
  readonly schemas: readonly OrmSchema[];
  readonly bulk?: BulkQueue;
  readonly background?: true;
}
declare function pathOf(def: EntityDef<string>): string;
export declare function entityRoutes(schema: OrmSchema, context: EntityRoutesContext): RouteDef[];
export declare function registerEntityRoutes(server: HttpServer, schemas: readonly OrmSchema[], options: {
  db: Database;
  bulk?: BulkQueue;
}): void;
export declare const META_SCHEMA: JsonSchema;
export declare function registerMeta(server: HttpServer, entities: readonly EntityDef<string>[]): void;
interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
}
type OpenApiDocument = Record<string, unknown>;
export declare function openApiDocument(routes: readonly RouteDef[], info: OpenApiInfo): OpenApiDocument;
export declare function registerOpenApi(server: HttpServer, info: OpenApiInfo): void;
interface RegisterHttpOptions {
  readonly host?: string;
  readonly port?: number;
  readonly drainMs?: number;
  readonly timeoutMs?: number;
}
export declare function registerHttp(lifecycle: Lifecycle, server: HttpServer, options?: RegisterHttpOptions): void;
export declare class HttpError extends BkError {
  readonly headers: Readonly<Record<string, string>>;
  readonly extensions: Readonly<Record<string, unknown>>;
  constructor(code: string, status: number, message: string, fix: string, headers?: Readonly<Record<string, string>>, cause?: unknown, extensions?: Readonly<Record<string, unknown>>);
}
export declare class ValidationFailed extends HttpError {
  readonly errors: readonly {
    readonly path: string;
    readonly code: string;
    readonly message: string;
  }[];
  constructor(issues: readonly ValidationIssue[]);
}
interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly traceId: string;
  readonly instance: string;
  readonly fix?: string;
  readonly errors?: readonly {
    readonly path: string;
    readonly code: string;
    readonly message: string;
  }[];
  readonly [extension: string]: unknown;
}
interface StaticOptions {
  readonly prefix: string;
  readonly host?: string;
  readonly directory: string;
  readonly policy: string;
  readonly fallback?: string;
  readonly transformPage?: (html: string) => string;
}
export declare function serveStatic(server: HttpServer, options: StaticOptions): void;
export declare const packageName = "@bieberkit/http";
declare module "@bieberkit/core" {
  interface ModuleContributions {
    routes?: readonly RouteDef[];
  }
}
export { type AccessAnswer, type Authenticator, type Authorization, type Authorizer, type BulkInput, type BulkJob, type BulkJobOptions, type BulkQueue, type CorsOptions, type CsrfProtection, type EntityRoutesContext, type HttpEnv, type HttpFetch, type HttpFetchInit, type HttpFetchOptions, type HttpServer, type HttpServerOptions, type IdempotencyBegin, type IdempotencyStore, type InjectOptions, type InjectResponse, type MemoryIdempotencyOptions, type Method, type MountDef, type OpenApiDocument, type OpenApiInfo, type Principal, type Problem, type RateLimitResult, type RateLimiter, type RegisterHttpOptions, type RequestInfo, type ResolvedAddress, type RouteContext, type RouteDef, type RouteSchema, type StageContext, type StageHook, type StageName, type StaticOptions, type StoredResponse, type TenantResolver, pathOf as entityPath };
```
