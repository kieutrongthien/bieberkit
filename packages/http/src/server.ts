/**
 * BieberKit
 *
 * @file        packages/http/src/server.ts
 * @description The HTTP server: Fastify behind a facade, with the 12 stages of a request, the ports, route rules, health and shutdown (spec 13.4, 19.3, 19.4).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @copyright   Copyright (c) 2026 Bieber Kieu
 * @license     Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createContainer,
  createLogger,
  createNoopMetrics,
  createNoopTracer,
  reportError,
  requestContext,
} from '@bieberkit/core';
import type { ErrorReporter, Logger, Metrics, OpenSpan, ServiceRegistry, Tracer } from '@bieberkit/core';
import { createAjv, issuesOf } from '@bieberkit/data/build';
import { normalizeInput } from '@bieberkit/data/schema';
import type { AjvError, AjvInstance } from '@bieberkit/data/build';
import { authorizationFor } from './authorization.ts';
import { createMemoryIdempotencyStore } from './idempotency.ts';
import type { IdempotencyStore } from './idempotency.ts';
import type { CsrfProtection } from './csrf.ts';
import { HttpError, ValidationFailed, describeError } from './problem.ts';
import { CORS_EXPOSED, CORS_HEADERS, CORS_METHODS, securityConfig, securityHeaders } from './security.ts';
import type { CorsOptions } from './security.ts';
import type { Authenticator, Authorizer, Principal, RateLimiter, RequestInfo, TenantResolver } from './ports.ts';
import { METHODS } from './route.ts';
import type { RouteContext, RouteDef } from './route.ts';
import { fastifyLogger } from './log-adapter.ts';
import { requestIdOf, traceOf } from './trace.ts';

export interface HttpEnv {
  readonly APP_ENV: 'development' | 'test' | 'production';
  readonly APP_PORT: number;
  readonly TRUST_PROXY: boolean | number;
  /** Whether `openapi.json` is public in production (API-06). */
  readonly API_DOCS_PUBLIC: boolean;
}

export const STAGE_NAMES = ['afterAuth', 'beforeHandler', 'afterHandler', 'onResponse'] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/** What a plugin hook sees. `result` is the value of the handler, for `afterHandler` only. */
export interface StageContext {
  readonly method: string;
  readonly path: string;
  readonly principal: Principal | undefined;
  readonly tenantId: string | undefined;
  readonly requestId: string;
  readonly traceId: string;
  readonly result?: unknown;
  /** The status of the answer, at `onResponse` only. */
  readonly status?: number;
  /** The code of the problem when the answer is one, at `onResponse` only. */
  readonly code?: string;
  /** The members that the problem has besides the standard ones (`HttpError.extensions`), at `onResponse` only. */
  readonly details?: Readonly<Record<string, unknown>>;
}

export type StageHook = (context: StageContext) => void | Promise<void>;

export interface MountDef {
  /** A path that starts with a slash and has no slash at its end, such as `/api/auth`. */
  readonly prefix: string;
  readonly handler: (request: Request) => Promise<Response>;
}

export interface HttpServerOptions {
  readonly logger?: Logger;
  readonly authenticator?: Authenticator;
  readonly tenantResolver?: TenantResolver;
  readonly authorizer?: Authorizer;
  readonly ipLimiter?: RateLimiter;
  readonly userLimiter?: RateLimiter;
  /** Bytes. Defaults to 1 MiB (API-03). */
  readonly bodyLimit?: number;
  /** Milliseconds. Defaults to 30 000 (API-05). */
  readonly requestTimeoutMs?: number;
  /** Milliseconds. Defaults to 65 000, above the 60 seconds that load balancers commonly wait. */
  readonly keepAliveTimeoutMs?: number;
  /** Replaces or removes (`false`) a security header (SEC-01). */
  readonly headers?: Readonly<Record<string, string | false>>;
  /** The origins that a browser may call the API from (SEC-02). With none, no other origin is allowed. */
  readonly cors?: CorsOptions;
  /** The CSRF token (SEC-03). Without it, only a request from the same origin may change state for a signed in browser. */
  readonly csrf?: CsrfProtection;
  /** Where the answers of idempotent requests are kept. Defaults to a memory store, which is for one process. */
  readonly idempotencyStore?: IdempotencyStore;
  /** Receives an error that is a bug of ours (a 5xx), after it was logged, with the route, the request and the user (OBS-06). */
  readonly errorReporter?: ErrorReporter;
  /** Records a span for each request, a child of the span of the caller (OBS-02). Defaults to one that records nothing. */
  readonly tracer?: Tracer;
  /** Receives the duration of each request by method, route and status (OBS-03). Defaults to a registry that keeps nothing. */
  readonly metrics?: Metrics;
  /** The services that a route handler reads from its context. Without them, reading one is an error. */
  readonly services?: ServiceRegistry;
}

export interface InjectOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly payload?: string | object;
}

export interface InjectResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | number | undefined>;
  readonly body: string;
}

export interface HttpServer {
  /** Adds a route. It throws `HTTP_ROUTE_INVALID` when the route breaks a rule, and when the server has started. */
  route(route: RouteDef): void;
  /**
   * Hands every request under `prefix` to a web handler, such as the one of Better Auth (AUTH-09). The request goes through the
   * stages of the pipeline (id, limit by address, authentication, tenant, CSRF) and the handler gets a web `Request` whose
   * `x-bk-client-ip` is the address that `TRUST_PROXY` resolved, whatever the client sent. The handler's `Response` is the answer.
   * A mounted prefix has no schema and no permission, so it is not in `routes()` nor in the OpenAPI document.
   */
  mount(mount: MountDef): void;
  /**
   * Answers a GET or a HEAD that no route matched, before the 404: a page that lives at the root of a host, such as an admin on its own
   * subdomain, and has no prefix to mount. The handler answers `undefined` for a request that is not its own, and the 404 follows.
   * One handler only, and before the server starts.
   */
  fallback(handler: (request: Request) => Promise<Response | undefined>): void;
  /** Adds a hook at one of the four stages that a plugin may use (REQ-01). */
  stage(name: StageName, hook: StageHook): void;
  inject(request: InjectOptions): Promise<InjectResponse>;
  listen(options?: { port?: number; host?: string }): Promise<{ address: string; port: number }>;
  /** Makes `/health/startup` answer 200. Call it when the boot is done. */
  markReady(): void;
  /** The steps of spec 19.4. `timedOut` becomes the exit code. */
  stop(options?: { drainMs?: number; timeoutMs?: number }): Promise<{ timedOut: boolean }>;
  readonly settings: Readonly<{ bodyLimit: number; requestTimeoutMs: number; keepAliveTimeoutMs: number }>;
  /** The routes that were added with `route`, in the order they were added. The probes of the server are not among them. */
  routes(): readonly RouteDef[];
  /** Whether the document of the API is public: always outside production, and with `API_DOCS_PUBLIC` in it (API-06). */
  readonly docsPublic: boolean;
  readonly csrf: CsrfProtection | undefined;
}

const DEFAULT_BODY_LIMIT = 1_048_576;
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_KEEP_ALIVE = 65_000;

interface RouteState {
  readonly def: RouteDef;
  readonly internal: boolean;
  /** A route of a mounted handler: it has no schema, and its answers are the handler's own, so no ETag is made for them. */
  readonly mounted?: true;
  readonly params: ((data: unknown) => boolean) | undefined;
  readonly query: ((data: unknown) => boolean) | undefined;
  readonly body: ((data: unknown) => boolean) | undefined;
  readonly statuses: ReadonlySet<number>;
}

interface RequestState {
  principal: Principal | undefined;
  tenantId: string | undefined;
  status: number | undefined;
  readonly headers: Record<string, string>;
  /** The key of an idempotent request that is running, so that its answer is kept. */
  idempotencyKey: string | undefined;
  replayed: boolean;
  /** The code of the problem that answered the request, and its extra members. */
  problemCode: string | undefined;
  problemDetails: Readonly<Record<string, unknown>> | undefined;
  /** The span of the request, open until the answer was sent (OBS-02). */
  span: OpenSpan | undefined;
}

type Compiled = ((data: unknown) => boolean) & { errors?: AjvError[] | null };

/** `Deprecation`, `Sunset` and `Link` for a deprecated route (API-16, RFC 9745 and RFC 8594). */
function announceDeprecation(reply: FastifyReply, deprecated: NonNullable<RouteDef['deprecated']>): void {
  void reply.header(
    'deprecation',
    deprecated.since === undefined ? 'true' : `@${Date.parse(`${deprecated.since}T00:00:00Z`) / 1000}`,
  );
  if (deprecated.sunset !== undefined)
    void reply.header('sunset', new Date(`${deprecated.sunset}T00:00:00Z`).toUTCString());
  if (deprecated.link !== undefined) void reply.header('link', `<${deprecated.link}>; rel="deprecation"`);
}

/** What a shared cache may do with a public answer, and the tags that purge it (API-09). */
function announceCache(reply: FastifyReply, cache: NonNullable<RouteDef['cache']>): void {
  const stale =
    cache.staleWhileRevalidate === undefined ? '' : `, stale-while-revalidate=${cache.staleWhileRevalidate}`;
  void reply.header('cache-control', `public, s-maxage=${cache.sMaxAge}${stale}`);
  if (cache.tags !== undefined && cache.tags.length > 0) void reply.header('cache-tag', cache.tags.join(','));
}

const whole = (value: number | undefined): boolean => value === undefined || (Number.isInteger(value) && value >= 0);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string): boolean => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return DAY.test(value) && !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

/** Why the options of a route for deprecation, caching or idempotency are not allowed, or `undefined`. */
function optionProblem(route: RouteDef): string | undefined {
  if (route.idempotent === true && route.method !== 'POST' && route.method !== 'DELETE')
    return 'only a POST or a DELETE route can be idempotent.';
  const deprecated = route.deprecated;
  if (deprecated !== undefined) {
    if (deprecated.since !== undefined && !isDay(deprecated.since))
      return 'deprecated.since is not a date (YYYY-MM-DD).';
    if (deprecated.sunset !== undefined && !isDay(deprecated.sunset))
      return 'deprecated.sunset is not a date (YYYY-MM-DD).';
    if (deprecated.since !== undefined && deprecated.sunset !== undefined && deprecated.sunset < deprecated.since) {
      return 'deprecated.sunset is before deprecated.since.';
    }
    if (deprecated.link !== undefined && !/^(https:\/\/|\/)\S+$/.test(deprecated.link))
      return 'deprecated.link is not an https url or a path.';
  }
  const cache = route.cache;
  if (cache !== undefined) {
    if (route.method !== 'GET' || route.public !== true)
      return 'cache is only for a public GET, because a shared cache must not keep an answer that depends on the caller.';
    if (!whole(cache.sMaxAge) || !whole(cache.staleWhileRevalidate))
      return 'the times of cache are whole numbers of seconds, 0 or more.';
    if ((cache.tags ?? []).some((tag) => tag.trim() === '' || /[,\s]/.test(tag)))
      return 'a cache tag is not blank and has no comma or space.';
  }
  return undefined;
}

/** A weak ETag made of the body: the same answer has the same tag (API-08). */
function weakEtag(body: string): string {
  return `W/"${createHash('sha1').update(body).digest('base64url').slice(0, 16)}"`;
}

const bareTag = (tag: string): string => tag.trim().replace(/^W\//, '');

/** Whether an `If-None-Match` value names the tag. Weak comparison: `W/"a"` and `"a"` are the same, and `*` is every tag. */
function matches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header.split(',').some((candidate) => candidate.trim() === '*' || bareTag(candidate) === bareTag(etag));
}

const traceIdNow = (): string => requestContext.get()?.traceId ?? '0'.repeat(32);

function routeStateOf(request: FastifyRequest): RouteState | undefined {
  const config: unknown = request.routeOptions.config;
  const state: unknown = typeof config === 'object' && config !== null ? Reflect.get(config, 'bk') : undefined;
  // The only writer of `config.bk` is `register`, which stores a RouteState.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return state === undefined ? undefined : (state as RouteState);
}

function compileOnce(ajv: AjvInstance, schema: object): Compiled {
  const id: unknown = Reflect.get(schema, '$id');
  const existing = typeof id === 'string' ? ajv.getSchema(id) : undefined;
  // Ajv types a validator by the data it checks, and this one checks anything.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (existing ?? ajv.compile(schema)) as Compiled;
}

function refuseLimit(result: { allowed: boolean; retryAfterSeconds?: number }): void {
  if (result.allowed) return;
  throw new HttpError(
    'HTTP_TOO_MANY_REQUESTS',
    429,
    'Too many requests.',
    'Wait, then try again.',
    result.retryAfterSeconds === undefined ? {} : { 'retry-after': String(result.retryAfterSeconds) },
  );
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

function notReady(): never {
  throw new HttpError('HTTP_NOT_READY', 503, 'The server is not ready.', 'Try again in a moment.');
}

function probe(url: string, check: () => void): RouteDef {
  return {
    method: 'GET',
    url,
    public: true,
    schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] } } },
    handler: () => {
      check();
      return { status: 'ok' };
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function configError(message: string): never {
  throw new HttpError('HTTP_CONFIG_INVALID', 500, message, 'Use a positive number.');
}

function checkLimit(name: string, value: number, minimum: number): number {
  if (!Number.isFinite(value) || value < minimum)
    configError(`${name} is ${value}, and it must be ${minimum} or more.`);
  return value;
}

function invalidRoute(route: Pick<RouteDef, 'method' | 'url'>, why: string): never {
  throw new HttpError(
    'HTTP_ROUTE_INVALID',
    500,
    `${route.method} ${route.url}: ${why}`,
    'A route needs a permission or public: true, a valid schema for each input, and a response schema for a 2xx status.',
  );
}

/** A number is the count of proxies in front of the server. For Fastify that is a function of the hop. */
function trustProxyOf(value: boolean | number): boolean | ((address: string, hop: number) => boolean) {
  return typeof value === 'number' ? (_address, hop) => hop < value : value;
}

function pickInfo(request: FastifyRequest): RequestInfo {
  return {
    method: request.method,
    path: request.url.split('?')[0] ?? request.url,
    headers: request.headers,
    ip: request.ip,
  };
}

function stateOf(map: WeakMap<FastifyRequest, RequestState>, request: FastifyRequest): RequestState {
  let state = map.get(request);
  if (state === undefined) {
    state = {
      principal: undefined,
      tenantId: undefined,
      status: undefined,
      headers: {},
      idempotencyKey: undefined,
      replayed: false,
      problemCode: undefined,
      problemDetails: undefined,
      span: undefined,
    };
    map.set(request, state);
  }
  return state;
}

/** A request of Fastify as a web `Request`, which is what a mounted handler and the fallback take. */
const toWebRequest = (request: FastifyRequest): Request => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || ['content-length', 'transfer-encoding', 'x-bk-client-ip'].includes(name)) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  // The address that TRUST_PROXY resolved is the only one that the handler may use (AUTH-10).
  headers.set('x-bk-client-ip', request.ip);
  const body =
    request.method === 'GET' || request.method === 'HEAD' || request.body === undefined || request.body === null
      ? undefined
      : typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body);
  return new Request(`${request.protocol}://${request.host}${request.url}`, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
};

/** A web `Response` as the answer of Fastify: its cookies, its headers, its status and its body as bytes. */
const sendWeb = async (reply: FastifyReply, response: Response): Promise<void> => {
  for (const cookie of response.headers.getSetCookie()) void reply.header('set-cookie', cookie);
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') void reply.header(name, value);
  });
  const retry = response.headers.get('x-retry-after');
  if (response.status === 429 && retry !== null && response.headers.get('retry-after') === null)
    void reply.header('retry-after', retry);
  // The body goes out as bytes, so that a file that is not text (an image, a font) arrives as it was.
  void reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
};

/**
 * The HTTP server of a project. Fastify stays behind this facade: a plugin adds routes and the four named stage hooks, and
 * nothing else, so no plugin can skip a stage or reorder them (REQ-01, REQ-02).
 */
export function createHttpServer(env: HttpEnv, options: HttpServerOptions = {}): HttpServer {
  const logger = options.logger ?? createLogger({ level: 'info', role: 'web' });
  const bodyLimit = checkLimit('bodyLimit', options.bodyLimit ?? DEFAULT_BODY_LIMIT, 1);
  const requestTimeoutMs = checkLimit('requestTimeoutMs', options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT, 0);
  const keepAliveTimeoutMs = checkLimit('keepAliveTimeoutMs', options.keepAliveTimeoutMs ?? DEFAULT_KEEP_ALIVE, 0);
  const showFix = env.APP_ENV !== 'production';
  const security = securityConfig(options.headers, options.cors);
  const tracer = options.tracer ?? createNoopTracer();
  const duration = (options.metrics ?? createNoopMetrics()).histogram(
    'bk_http_request_duration_seconds',
    'Time to answer an HTTP request, by method, route and status.',
    { labels: ['method', 'route', 'status'] },
  );

  const app = Fastify({
    loggerInstance: fastifyLogger(logger),
    logController: new LogController({ disableRequestLogging: true }),
    // A number is the count of proxies in front of the server, which is a function of the hop for Fastify.
    trustProxy: trustProxyOf(env.TRUST_PROXY),
    bodyLimit,
    requestTimeout: requestTimeoutMs,
    keepAliveTimeout: keepAliveTimeoutMs,
    requestIdHeader: false,
    genReqId: (request) => requestIdOf(request.headers['x-request-id']),
  });

  // Fastify reads text/plain by default. This API speaks JSON only, so that type gets a 415.
  app.removeContentTypeParser('text/plain');

  const requests = new WeakMap<FastifyRequest, RequestState>();
  const hooks: Record<StageName, StageHook[]> = { afterAuth: [], beforeHandler: [], afterHandler: [], onResponse: [] };
  const known = new Set<string>();
  const added: RouteDef[] = [];
  let started = false;
  let draining = false;
  let ready = false;
  let stopped = false;

  // One Ajv checks the body as it is, and one coerces what comes as text: `?size=10` is a number.
  const strictAjv: AjvInstance = createAjv();
  const coercingAjv: AjvInstance = createAjv({ coerceTypes: true });
  // Stage 1: the id, the trace and the context of the request. The context is made around `done`, so every later hook, the
  // handler and the services it calls run inside it.
  app.addHook('onRequest', (request, reply, done) => {
    const trace = traceOf(request.headers['traceparent']);
    void reply.header('x-request-id', request.id);
    // The probes of the server are not traced and not counted: a load balancer calls them every few seconds.
    const route = routeStateOf(request);
    const span =
      route?.internal === true
        ? undefined
        : tracer.startSpan(`${request.method} ${request.routeOptions.url ?? 'unmatched'}`, {
            kind: 'server',
            parent: trace,
            attributes: { 'http.method': request.method, 'http.route': request.routeOptions.url ?? 'unmatched' },
          });
    if (span !== undefined && tracer.enabled) stateOf(requests, request).span = span;
    // With a tracer the context names the span of this request. Without one it keeps the span of the caller.
    const ids = span !== undefined && tracer.enabled ? { traceId: span.traceId, spanId: span.spanId } : trace;
    requestContext.run(
      {
        requestId: request.id,
        traceId: ids.traceId,
        ...(ids.spanId === undefined ? {} : { spanId: ids.spanId }),
      },
      () => (span === undefined ? done() : tracer.within(span, done)),
    );
  });

  // A preflight is answered before authentication and rate limiting, because a browser sends it with no credentials (SEC-02).
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers['origin'];
    const wanted = request.headers['access-control-request-method'];
    if (request.method !== 'OPTIONS' || origin === undefined || wanted === undefined) return undefined;
    const method = Array.isArray(wanted) ? wanted[0] : wanted;
    if (!security.origins.has(origin) || !(CORS_METHODS as readonly string[]).includes(String(method).toUpperCase())) {
      throw new HttpError(
        'HTTP_CORS_DENIED',
        403,
        'This origin may not call the API.',
        'Add the origin to the CORS list of the server.',
      );
    }
    void reply
      .code(204)
      .header('access-control-allow-methods', CORS_METHODS.join(', '))
      .header('access-control-allow-headers', CORS_HEADERS.join(', '))
      .header('access-control-max-age', String(security.maxAgeSeconds))
      .send();
    return reply;
  });

  // Stages 2 to 6, for every route except the probes of the server itself.
  app.addHook('onRequest', async (request) => {
    if (routeStateOf(request)?.internal === true) return;
    const state = stateOf(requests, request);
    const info = pickInfo(request);
    if (options.ipLimiter !== undefined) refuseLimit(await options.ipLimiter.hit(request.ip));
    state.principal = await options.authenticator?.authenticate(info);
    // A route that needs a permission needs someone to be signed in, and that is known here, before the body is read (stage 3).
    if (state.principal === undefined && routeStateOf(request)?.def.permission !== undefined) {
      throw new HttpError('HTTP_UNAUTHENTICATED', 401, 'Sign in to do this.', 'Send a valid session or API key.');
    }
    if (state.principal !== undefined && options.userLimiter !== undefined) {
      refuseLimit(await options.userLimiter.hit(state.principal.id));
    }
    state.tenantId = await options.tenantResolver?.resolve(info, state.principal);
    requestContext.update({
      ...(state.tenantId === undefined ? {} : { tenantId: state.tenantId }),
      ...(state.principal === undefined ? {} : { userId: state.principal.id }),
    });
    // Stage 6: CSRF, after the principal is known and before any plugin hook (SEC-03).
    checkCsrf(request, state.principal);
  });

  const stageContext = (request: FastifyRequest, result?: unknown, answered?: { status: number }): StageContext => {
    const state = stateOf(requests, request);
    return {
      method: request.method,
      path: pickInfo(request).path,
      principal: state.principal,
      tenantId: state.tenantId,
      requestId: request.id,
      traceId: traceIdNow(),
      ...(result === undefined ? {} : { result }),
      ...(answered === undefined
        ? {}
        : {
            status: answered.status,
            ...(state.problemCode === undefined ? {} : { code: state.problemCode }),
            ...(state.problemDetails === undefined ? {} : { details: state.problemDetails }),
          }),
    };
  };
  const run = async (name: StageName, context: StageContext): Promise<void> => {
    for (const hook of hooks[name]) await hook(context);
  };

  app.addHook('onRequest', async (request) => {
    if (routeStateOf(request)?.internal === true) return;
    await run('afterAuth', stageContext(request));
  });

  // Stage 7: the body is parsed by Fastify within `bodyLimit`, and then every part is checked, so one answer lists all the problems.
  app.addHook('preValidation', async (request) => {
    const route = routeStateOf(request);
    if (route === undefined) return;
    // Text is Unicode NFC before it is measured or compared (SCH-05).
    if (request.body !== undefined) request.body = normalizeInput(request.body);
    const issues = [];
    const parts = [
      ['params', route.params, request.params],
      ['query', route.query, request.query],
      ['body', route.body, request.body],
    ] as const;
    for (const [place, validate, value] of parts) {
      if (validate === undefined || validate(value)) continue;
      const errors = (validate as Compiled).errors;
      for (const issue of issuesOf(errors)) {
        issues.push({ ...issue, path: issue.path === '' ? place : `${place}.${issue.path}` });
      }
    }
    if (issues.length > 0) throw new ValidationFailed(issues);
  });

  // Stage 8: the permission of the route, then the plugin hooks of `beforeHandler`.
  app.addHook('preHandler', async (request, reply) => {
    const route = routeStateOf(request);
    if (route === undefined || route.internal) return undefined;
    const permission = route.def.permission;
    if (permission !== undefined) {
      const { principal } = stateOf(requests, request);
      if (principal === undefined) return undefined;
      const allowed = (await options.authorizer?.can(principal, permission, pickInfo(request))) === true;
      if (!allowed)
        throw new HttpError('HTTP_FORBIDDEN', 403, 'You may not do this.', `The permission ${permission} is needed.`);
    }
    const replay = await beginIdempotent(request, reply, route);
    if (replay) return reply;
    await run('beforeHandler', stageContext(request));
    return undefined;
  });

  // Stage 10: the plugin hooks of `afterHandler`, and the rule that a success is only ever written through a schema.
  app.addHook('preSerialization', async (request, reply, payload) => {
    if (reply.statusCode >= 400) return payload;
    const route = routeStateOf(request);
    if (route === undefined) return payload;
    if (!route.statuses.has(reply.statusCode)) {
      throw new HttpError(
        'HTTP_INTERNAL',
        500,
        `${route.def.method} ${route.def.url} answered ${reply.statusCode}, which has no response schema.`,
        'Add a schema for that status to schema.response.',
      );
    }
    await run('afterHandler', stageContext(request, payload));
    return payload;
  });

  // Stage 11 (ETag and cache headers) is slice 2. While the server drains, every answer ends its connection, so a client that keeps
  // connections alive does not hold the shutdown open.
  app.addHook('onSend', async (request, reply, payload) => {
    if (draining) void reply.header('connection', 'close');
    for (const [name, value] of securityHeaders(
      security,
      env.APP_ENV === 'production' || request.protocol === 'https',
    )) {
      if (reply.getHeader(name) === undefined) void reply.header(name, value);
    }
    if (security.cors) {
      const vary = reply.getHeader('vary');
      void reply.header('vary', typeof vary === 'string' && vary !== '' ? `${vary}, Origin` : 'Origin');
      const origin = request.headers['origin'];
      if (origin !== undefined && security.origins.has(origin)) {
        void reply
          .header('access-control-allow-origin', origin)
          .header('access-control-expose-headers', CORS_EXPOSED.join(', '));
        if (security.credentials) void reply.header('access-control-allow-credentials', 'true');
      }
    }
    const route = routeStateOf(request);
    const def = route?.def;
    if (def?.deprecated !== undefined) announceDeprecation(reply, def.deprecated);
    const ok =
      request.method === 'GET' &&
      reply.statusCode === 200 &&
      typeof payload === 'string' &&
      route?.internal !== true &&
      route?.mounted !== true;
    if (ok && def?.cache !== undefined) announceCache(reply, def.cache);
    if (ok) {
      if (reply.getHeader('etag') === undefined) void reply.header('etag', weakEtag(payload));
      if (reply.getHeader('cache-control') === undefined) void reply.header('cache-control', 'private, no-cache');
      if (matches(request.headers['if-none-match'], String(reply.getHeader('etag')))) {
        void reply.code(304).removeHeader('content-type').removeHeader('content-length');
        return '';
      }
    }
    await finishIdempotent(request, reply, payload);
    return payload;
  });

  /** SEC-03: a state change by a browser that signed in with a cookie must come from the same origin, or carry a token of its session. */
  function checkCsrf(request: FastifyRequest, principal: Principal | undefined): void {
    if (principal === undefined || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    if (principal.kind === 'service' || principal.via === 'token') return;
    if (request.headers['sec-fetch-site'] === 'same-origin') return;
    const origin = request.headers['origin'];
    const own = `${request.protocol}://${request.host}`;
    const originOk = origin === undefined || origin === own || security.origins.has(origin);
    const given = request.headers['x-csrf-token'];
    const token = Array.isArray(given) ? given[0] : given;
    const tokenOk =
      token !== undefined &&
      principal.sessionId !== undefined &&
      options.csrf !== undefined &&
      options.csrf.verify(token, principal.sessionId);
    if (!originOk || !tokenOk) {
      throw new HttpError(
        'HTTP_CSRF_FAILED',
        403,
        'This request does not come from this site.',
        'Send X-CSRF-Token from GET /api/v1/csrf, or call from the same origin.',
      );
    }
  }

  const idempotency = options.idempotencyStore ?? createMemoryIdempotencyStore();

  /** `Idempotency-Key` (spec 13.1). Returns true when the stored answer was sent and the handler must not run. */
  async function beginIdempotent(request: FastifyRequest, reply: FastifyReply, route: RouteState): Promise<boolean> {
    const raw = request.headers['idempotency-key'];
    if (route.def.idempotent !== true || raw === undefined) return false;
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (key === undefined || !/^[\x21-\x7e]{1,255}$/.test(key)) {
      throw new HttpError(
        'HTTP_IDEMPOTENCY_KEY_INVALID',
        400,
        'The Idempotency-Key is not valid.',
        'Use 1 to 255 visible characters.',
      );
    }
    const state = stateOf(requests, request);
    const scope = `${state.principal?.id ?? 'anonymous'}\u0000${route.def.method} ${route.def.url}\u0000${key}`;
    const fingerprint = createHash('sha256')
      .update(`${request.url}\n${JSON.stringify(request.body ?? null)}`)
      .digest('hex');
    const begun = await idempotency.begin(scope, fingerprint);
    if (begun.state === 'mismatch') {
      throw new HttpError(
        'HTTP_IDEMPOTENCY_KEY_REUSED',
        422,
        'This Idempotency-Key was used for another request.',
        'Use a new key for a new request.',
      );
    }
    if (begun.state === 'busy') {
      throw new HttpError(
        'HTTP_IDEMPOTENCY_IN_PROGRESS',
        409,
        'The first request with this key is still running.',
        'Wait, then send it again.',
      );
    }
    if (begun.state === 'new') {
      state.idempotencyKey = scope;
      return false;
    }
    state.replayed = true;
    void reply
      .code(begun.response.status)
      .headers({ ...begun.response.headers, 'idempotency-replayed': 'true' })
      .send(begun.response.body);
    return true;
  }

  /** Keeps the answer of a request that succeeded, and forgets the key of one that did not. */
  async function finishIdempotent(request: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<void> {
    const state = stateOf(requests, request);
    const scope = state.idempotencyKey;
    if (scope === undefined || state.replayed) return;
    state.idempotencyKey = undefined;
    // An answer with no body, such as the 204 of a DELETE, is kept as the empty text.
    const body = typeof payload === 'string' ? payload : payload === undefined || payload === null ? '' : undefined;
    if (reply.statusCode >= 200 && reply.statusCode < 300 && body !== undefined) {
      const headers: Record<string, string> = {};
      for (const name of ['content-type', 'location', 'etag']) {
        const value = reply.getHeader(name);
        if (typeof value === 'string') headers[name] = value;
      }
      await idempotency.complete(scope, { status: reply.statusCode, headers, body });
    } else {
      await idempotency.abandon(scope);
    }
  }

  // Stage 12: one log line, then the plugin hooks of `onResponse`. Nothing here can change an answer that was sent.
  // The hooks run after the answer was sent, so `inject` and `stop` wait for the ones that are still running: a test sees what a hook
  // wrote (the audit of a denial), and a shutdown does not lose it.
  const finishing = new Set<Promise<void>>();
  app.addHook('onResponse', async (request, reply) => {
    const span = stateOf(requests, request).span;
    if (span !== undefined) {
      span.setAttribute('http.status_code', reply.statusCode);
      if (reply.statusCode >= 500) span.fail(undefined);
      span.end();
    }
    if (routeStateOf(request)?.internal !== true) {
      duration.observe(reply.elapsedTime / 1000, {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status: String(reply.statusCode),
      });
    }
    const level = reply.statusCode >= 500 ? 'error' : 'info';
    logger[level]('request completed', {
      method: request.method,
      path: pickInfo(request).path,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 100) / 100,
      requestId: request.id,
    });
    const work = (async (): Promise<void> => {
      try {
        await run('onResponse', stageContext(request, undefined, { status: reply.statusCode }));
      } catch (error) {
        logger.error('onResponse hook failed', { reason: error instanceof Error ? error.message : String(error) });
      }
    })();
    finishing.add(work);
    try {
      await work;
    } finally {
      finishing.delete(work);
    }
  });

  // A client that leaves before the answer gets no `onResponse`, and the span of its request must still end.
  app.addHook('onRequestAbort', async (request) => {
    const span = stateOf(requests, request).span;
    span?.setAttribute('http.aborted', true);
    span?.end();
  });

  const answer = (error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply => {
    const described = describeError(error, { traceId: traceIdNow(), instance: pickInfo(request).path, showFix });
    const problemState = stateOf(requests, request);
    problemState.problemCode = described.problem.code;
    if (error instanceof HttpError && Object.keys(error.extensions).length > 0)
      problemState.problemDetails = error.extensions;
    if (described.bug) {
      logger.error('request failed', {
        requestId: request.id,
        reason: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.cause instanceof Error ? { cause: error.cause.message } : {}),
      });
      if (options.errorReporter !== undefined) {
        reportError(options.errorReporter, error, {
          source: 'http',
          requestId: request.id,
          http: { method: request.method, path: pickInfo(request).path, status: described.problem.status },
        });
      }
    }
    return reply
      .code(described.problem.status)
      .headers(described.headers)
      .type('application/problem+json')
      .send(described.problem);
  };
  app.setErrorHandler((error, request, reply) => answer(error, request, reply));
  let fallbackHandler: ((request: Request) => Promise<Response | undefined>) | undefined;
  app.setNotFoundHandler(async (request, reply) => {
    if (fallbackHandler !== undefined && (request.method === 'GET' || request.method === 'HEAD')) {
      const response = await fallbackHandler(toWebRequest(request));
      if (response !== undefined) {
        await sendWeb(reply, response);
        return reply;
      }
    }
    return answer(
      new HttpError('HTTP_NOT_FOUND', 404, 'There is no such route.', 'Check the path and the method.'),
      request,
      reply,
    );
  });

  const register = (route: RouteDef, internal: boolean): void => {
    const key = `${route.method} ${route.url}`;
    if (started) invalidRoute(route, 'it was added after the server started.');
    if (!METHODS.includes(route.method)) invalidRoute(route, `${route.method} is not a method of a route.`);
    if (!route.url.startsWith('/')) invalidRoute(route, 'the url must start with a slash.');
    if (known.has(key)) invalidRoute(route, 'it is already registered.');
    if (!internal) {
      const hasPermission = route.permission !== undefined;
      if (hasPermission === (route.public === true))
        invalidRoute(route, 'it needs a permission or public: true, and not both (API-02).');
      if (route.permission !== undefined && route.permission.trim() === '')
        invalidRoute(route, 'the permission is blank.');
    }
    const optionError = optionProblem(route);
    if (optionError !== undefined) invalidRoute(route, optionError);
    const statuses = Object.keys(route.schema.response).map(Number);
    if (!statuses.some((status) => status >= 200 && status < 300))
      invalidRoute(route, 'it has no response schema for a 2xx status (API-01).');
    const compileOrRefuse = (ajv: AjvInstance, schema: object | undefined, place: string): Compiled | undefined => {
      if (schema === undefined) return undefined;
      try {
        return compileOnce(ajv, schema);
      } catch (error) {
        return invalidRoute(
          route,
          `the ${place} schema is not valid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const state: RouteState = {
      def: route,
      internal,
      params: compileOrRefuse(coercingAjv, route.schema.params, 'params'),
      query: compileOrRefuse(coercingAjv, route.schema.query, 'query'),
      body: compileOrRefuse(strictAjv, route.schema.body, 'body'),
      statuses: new Set(statuses),
    };
    for (const [status, schema] of Object.entries(route.schema.response))
      compileOrRefuse(strictAjv, schema, `response ${status}`);
    known.add(key);
    if (!internal) added.push(route);
    app.route({
      method: route.method,
      url: route.url,
      config: { bk: state },
      schema: { response: route.schema.response },
      handler: async (request, reply) => {
        const current = stateOf(requests, request);
        const context: RouteContext = {
          params: asRecord(request.params),
          query: asRecord(request.query),
          body: request.body,
          headers: request.headers,
          principal: current.principal,
          tenantId: current.tenantId,
          requestId: request.id,
          traceId: traceIdNow(),
          log: logger,
          services: options.services ?? createContainer().services,
          status: (code) => {
            current.status = code;
          },
          header: (name, value) => {
            current.headers[name] = value;
          },
          ...authorizationFor(options.authorizer, current.principal, pickInfo(request)),
        };
        const result: unknown = await route.handler(context);
        for (const [name, value] of Object.entries(current.headers)) void reply.header(name, value);
        if (current.status !== undefined) void reply.code(current.status);
        if (reply.statusCode === 204) {
          void reply.send();
          return reply;
        }
        return result === undefined ? null : result;
      },
    });
  };

  const mounted = new Set<string>();
  const MOUNT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
  const mountPrefix = (mount: MountDef): void => {
    const stub = { method: 'GET', url: `${mount.prefix}/*` } as const;
    if (started) invalidRoute(stub, 'it was mounted after the server started.');
    if (!/^\/[^/\s*?#]+(\/[^/\s*?#]+)*$/.test(mount.prefix))
      invalidRoute(stub, 'a prefix starts with a slash, has no slash at its end and no wildcard.');
    if (mounted.has(mount.prefix)) invalidRoute(stub, 'it is already mounted.');
    if (added.some((route) => route.url === mount.prefix || route.url.startsWith(`${mount.prefix}/`)))
      invalidRoute(stub, 'a route is already registered under this prefix.');
    mounted.add(mount.prefix);
    const state: RouteState = {
      def: { ...stub, public: true, schema: { response: {} }, handler: () => undefined },
      internal: false,
      mounted: true,
      params: undefined,
      query: undefined,
      body: undefined,
      statuses: new Set(),
    };
    app.route({
      method: [...MOUNT_METHODS],
      url: `${mount.prefix}/*`,
      config: { bk: state },
      handler: async (request, reply) => {
        await sendWeb(reply, await mount.handler(toWebRequest(request)));
        return reply;
      },
    });
  };

  register(
    probe('/health/live', () => undefined),
    true,
  );
  register(
    probe('/health/ready', () => (draining ? notReady() : undefined)),
    true,
  );
  register(
    probe('/health/startup', () => (ready ? undefined : notReady())),
    true,
  );

  return {
    route: (route) => register(route, false),
    mount: mountPrefix,
    fallback: (handler) => {
      if (started) invalidRoute({ method: 'GET', url: '/*' }, 'the fallback was set after the server started.');
      if (fallbackHandler !== undefined) invalidRoute({ method: 'GET', url: '/*' }, 'a fallback is set already.');
      fallbackHandler = handler;
    },
    stage(name, hook) {
      if (!STAGE_NAMES.includes(name)) {
        throw new HttpError(
          'HTTP_STAGE_INVALID',
          500,
          `"${name}" is not a stage that a plugin may hook.`,
          `Use one of ${STAGE_NAMES.join(', ')}.`,
        );
      }
      hooks[name].push(hook);
    },
    async inject(request) {
      started = true;
      const response = await app.inject({
        method: request.method,
        url: request.url,
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.payload === undefined ? {} : { payload: request.payload }),
      });
      // The `onResponse` hooks start when the answer ends. Let them start, then wait for them.
      await new Promise<void>((resolve) => void setImmediate(resolve));
      await Promise.allSettled(finishing);
      return { statusCode: response.statusCode, headers: response.headers, body: response.body };
    },
    async listen(listenOptions = {}) {
      started = true;
      const address = await app.listen({
        port: listenOptions.port ?? env.APP_PORT,
        host: listenOptions.host ?? '0.0.0.0',
      });
      const bound = app.server.address();
      return { address, port: typeof bound === 'object' && bound !== null ? bound.port : 0 };
    },
    markReady() {
      ready = true;
    },
    async stop(stopOptions = {}) {
      if (stopped) return { timedOut: false };
      stopped = true;
      draining = true;
      await sleep(stopOptions.drainMs ?? 5000);
      const closing = app.close().then(() => 'closed' as const);
      // A connection that goes idle after the close began is not closed by Node, so the idle ones are swept until the close is done.
      const sweep = setInterval(() => app.server.closeIdleConnections(), 50);
      const outcome = await Promise.race([
        closing,
        sleep(stopOptions.timeoutMs ?? 20_000).then(() => 'timeout' as const),
      ]);
      if (outcome === 'timeout') {
        app.server.closeAllConnections();
        await closing.catch(() => undefined);
      }
      clearInterval(sweep);
      await Promise.allSettled(finishing);
      return { timedOut: outcome === 'timeout' };
    },
    settings: { bodyLimit, requestTimeoutMs, keepAliveTimeoutMs },
    routes: () => [...added],
    docsPublic: env.APP_ENV !== 'production' || env.API_DOCS_PUBLIC,
    csrf: options.csrf,
  };
}
