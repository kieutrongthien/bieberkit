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
import { createLogger, requestContext } from '@bieberkit/core';
import type { Logger } from '@bieberkit/core';
import { createAjv, issuesOf } from '@bieberkit/data/build';
import { normalizeInput } from '@bieberkit/data/schema';
import type { AjvError, AjvInstance } from '@bieberkit/data/build';
import { HttpError, ValidationFailed, describeError } from './problem.ts';
import type { Authenticator, Authorizer, Principal, RateLimiter, RequestInfo, TenantResolver } from './ports.ts';
import { METHODS } from './route.ts';
import type { RouteContext, RouteDef } from './route.ts';
import { fastifyLogger } from './log-adapter.ts';
import { requestIdOf, traceOf } from './trace.ts';

export interface HttpEnv {
  readonly APP_ENV: 'development' | 'test' | 'production';
  readonly APP_PORT: number;
  readonly TRUST_PROXY: boolean | number;
}

export interface ErrorContext {
  readonly method: string;
  readonly path: string;
  readonly requestId: string;
  readonly traceId: string;
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
}

export type StageHook = (context: StageContext) => void | Promise<void>;

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
  /** Called for an error that is a bug of ours (a 5xx), after it was logged (OBS-06). */
  readonly onError?: (error: unknown, context: ErrorContext) => void;
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
  /** Adds a hook at one of the four stages that a plugin may use (REQ-01). */
  stage(name: StageName, hook: StageHook): void;
  inject(request: InjectOptions): Promise<InjectResponse>;
  listen(options?: { port?: number; host?: string }): Promise<{ address: string; port: number }>;
  /** Makes `/health/startup` answer 200. Call it when the boot is done. */
  markReady(): void;
  /** The steps of spec 19.4. `timedOut` becomes the exit code. */
  stop(options?: { drainMs?: number; timeoutMs?: number }): Promise<{ timedOut: boolean }>;
  readonly settings: Readonly<{ bodyLimit: number; requestTimeoutMs: number; keepAliveTimeoutMs: number }>;
}

const DEFAULT_BODY_LIMIT = 1_048_576;
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_KEEP_ALIVE = 65_000;

interface RouteState {
  readonly def: RouteDef;
  readonly internal: boolean;
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
}

type Compiled = ((data: unknown) => boolean) & { errors?: AjvError[] | null };

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
    state = { principal: undefined, tenantId: undefined, status: undefined, headers: {} };
    map.set(request, state);
  }
  return state;
}

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
    requestContext.run(
      {
        requestId: request.id,
        traceId: trace.traceId,
        ...(trace.spanId === undefined ? {} : { spanId: trace.spanId }),
      },
      done,
    );
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
    // Stage 6 is the CSRF check of slice 5. Its place is here, after the principal is known and before any plugin hook.
  });

  const stageContext = (request: FastifyRequest, result?: unknown): StageContext => {
    const state = stateOf(requests, request);
    return {
      method: request.method,
      path: pickInfo(request).path,
      principal: state.principal,
      tenantId: state.tenantId,
      requestId: request.id,
      traceId: traceIdNow(),
      ...(result === undefined ? {} : { result }),
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
  app.addHook('preHandler', async (request) => {
    const route = routeStateOf(request);
    if (route === undefined || route.internal) return;
    const permission = route.def.permission;
    if (permission !== undefined) {
      const { principal } = stateOf(requests, request);
      if (principal === undefined) return;
      const allowed = (await options.authorizer?.can(principal, permission, pickInfo(request))) === true;
      if (!allowed)
        throw new HttpError('HTTP_FORBIDDEN', 403, 'You may not do this.', `The permission ${permission} is needed.`);
    }
    await run('beforeHandler', stageContext(request));
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
  app.addHook('onSend', (request, reply, payload, done) => {
    if (draining) void reply.header('connection', 'close');
    if (
      request.method === 'GET' &&
      reply.statusCode === 200 &&
      typeof payload === 'string' &&
      routeStateOf(request)?.internal !== true
    ) {
      if (reply.getHeader('etag') === undefined) void reply.header('etag', weakEtag(payload));
      if (reply.getHeader('cache-control') === undefined) void reply.header('cache-control', 'private, no-cache');
      if (matches(request.headers['if-none-match'], String(reply.getHeader('etag')))) {
        void reply.code(304).removeHeader('content-type').removeHeader('content-length');
        done(null, '');
        return;
      }
    }
    done(null, payload);
  });

  // Stage 12: one log line, then the plugin hooks of `onResponse`. Nothing here can change an answer that was sent.
  app.addHook('onResponse', async (request, reply) => {
    const level = reply.statusCode >= 500 ? 'error' : 'info';
    logger[level]('request completed', {
      method: request.method,
      path: pickInfo(request).path,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 100) / 100,
      requestId: request.id,
    });
    try {
      await run('onResponse', stageContext(request));
    } catch (error) {
      logger.error('onResponse hook failed', { reason: error instanceof Error ? error.message : String(error) });
    }
  });

  const answer = (error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply => {
    const described = describeError(error, { traceId: traceIdNow(), instance: pickInfo(request).path, showFix });
    if (described.bug) {
      logger.error('request failed', {
        requestId: request.id,
        reason: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && error.cause instanceof Error ? { cause: error.cause.message } : {}),
      });
      options.onError?.(error, {
        method: request.method,
        path: pickInfo(request).path,
        requestId: request.id,
        traceId: traceIdNow(),
      });
    }
    return reply
      .code(described.problem.status)
      .headers(described.headers)
      .type('application/problem+json')
      .send(described.problem);
  };
  app.setErrorHandler((error, request, reply) => answer(error, request, reply));
  app.setNotFoundHandler((request, reply) =>
    answer(
      new HttpError('HTTP_NOT_FOUND', 404, 'There is no such route.', 'Check the path and the method.'),
      request,
      reply,
    ),
  );

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
          status: (code) => {
            current.status = code;
          },
          header: (name, value) => {
            current.headers[name] = value;
          },
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
      return { timedOut: outcome === 'timeout' };
    },
    settings: { bodyLimit, requestTimeoutMs, keepAliveTimeoutMs },
  };
}
