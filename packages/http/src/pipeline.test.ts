/**
 * BieberKit
 *
 * @file        packages/http/src/pipeline.test.ts
 * @description Tests of the 12 stages of a request, in order, with the ports and the named hooks that plugins can add (REQ-01, REQ-02, SEC-04).
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

import { BkError, requestContext } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import type { HttpServerOptions } from './server.ts';
import { okRoute, testServer, TEST_ENV } from './testing.ts';
import type { RouteDef } from './route.ts';

const USER = { id: 'u-1', kind: 'user', via: 'token' } as const;

function problemOf(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
}

/** A server whose ports and stages all write into one list, so a test sees the order. */
function recording(overrides: (calls: string[]) => HttpServerOptions = () => ({})) {
  const calls: string[] = [];
  const { server, logger } = testServer({
    ipLimiter: { hit: async () => (calls.push('ipLimiter'), { allowed: true }) },
    authenticator: { authenticate: async () => (calls.push('authenticate'), USER) },
    userLimiter: { hit: async () => (calls.push('userLimiter'), { allowed: true }) },
    tenantResolver: { resolve: async () => (calls.push('tenant'), 't-1') },
    authorizer: { can: async () => (calls.push('authorize'), true) },
    ...overrides(calls),
  });
  for (const stage of ['afterAuth', 'beforeHandler', 'afterHandler', 'onResponse'] as const) {
    server.stage(stage, () => void calls.push(stage));
  }
  const { public: _public, ...base } = okRoute('/api/v1/t/p');
  const route: RouteDef = {
    ...base,
    method: 'POST',
    permission: 'crm.thing.update',
    schema: {
      body: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
    },
    handler: () => (calls.push('handler'), { ok: true }),
  };
  server.route(route);
  return { server, calls, logger };
}

describe('13.4 the stages run in order', () => {
  it('13.4 a request passes every stage, once, in the order of the spec', async () => {
    const { server, calls } = recording();
    const response = await server.inject({ method: 'POST', url: '/api/v1/t/p', payload: { n: 1 } });
    expect(response.statusCode).toBe(200);
    // The response is sent before onResponse hooks run, so give them a turn.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([
      'ipLimiter',
      'authenticate',
      'userLimiter',
      'tenant',
      'afterAuth',
      'authorize',
      'beforeHandler',
      'handler',
      'afterHandler',
      'onResponse',
    ]);
  });

  it('13.4 validation comes before authorization: an invalid body is 400 and the authorizer is not asked', async () => {
    const { server, calls } = recording();
    const response = await server.inject({ method: 'POST', url: '/api/v1/t/p', payload: { n: 'x' } });
    expect(response.statusCode).toBe(400);
    expect(calls).not.toContain('authorize');
    expect(calls).not.toContain('handler');
    expect(calls).toContain('afterAuth');
  });

  it('13.4 authentication comes before the body is read: a body that is not JSON gets 401 from an anonymous caller', async () => {
    const { server } = recording(() => ({ authenticator: { authenticate: async () => undefined } }));
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/t/p',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(response.statusCode).toBe(401);
  });

  it('REQ-02 a failure stops the pipeline: no later stage runs', async () => {
    const { server, calls } = recording((seen) => ({
      authenticator: {
        authenticate: async () => {
          seen.push('authenticate');
          throw new BkError('x', { code: 'X_AUTH', status: 401 });
        },
      },
    }));
    const response = await server.inject({ method: 'POST', url: '/api/v1/t/p', payload: { n: 1 } });
    expect(response.statusCode).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Stage 12 still runs, so the failure is logged and counted.
    expect(calls).toEqual(['ipLimiter', 'authenticate', 'onResponse']);
  });

  it('REQ-02 a port that throws an unknown error is a 500 and the handler does not run', async () => {
    const { server, calls } = recording(() => ({
      tenantResolver: {
        resolve: async () => {
          throw new Error('boom');
        },
      },
    }));
    const response = await server.inject({ method: 'POST', url: '/api/v1/t/p', payload: { n: 1 } });
    expect(response.statusCode).toBe(500);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_INTERNAL' });
    expect(calls).not.toContain('handler');
  });
});

const secured = (options: HttpServerOptions = {}) => {
  const { server } = testServer(options);
  const { public: _public, ...base } = okRoute('/api/v1/t/s');
  server.route({ ...base, permission: 'crm.thing.read', handler: (ctx) => ({ ok: ctx.principal?.id === 'u-1' }) });
  server.route(okRoute('/api/v1/t/open', { handler: (ctx) => ({ ok: ctx.principal === undefined }) }));
  return server;
};

describe('SEC-04 authentication and authorization', () => {
  it('SEC-04 with no authenticator, a route with a permission is 401 and a public route works', async () => {
    const server = secured();
    expect((await server.inject({ method: 'GET', url: '/api/v1/t/s' })).statusCode).toBe(401);
    expect(problemOf((await server.inject({ method: 'GET', url: '/api/v1/t/s' })).body)).toMatchObject({
      code: 'HTTP_UNAUTHENTICATED',
    });
    expect((await server.inject({ method: 'GET', url: '/api/v1/t/open' })).statusCode).toBe(200);
  });

  it('SEC-04 a principal with no authorizer is allowed nothing: 403', async () => {
    const server = secured({ authenticator: { authenticate: async () => USER } });
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/s' });
    expect(response.statusCode).toBe(403);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_FORBIDDEN' });
  });

  it('SEC-04 the authorizer is asked for the permission of the route, and a yes lets the handler run', async () => {
    const asked: string[] = [];
    const server = secured({
      authenticator: { authenticate: async () => USER },
      authorizer: { can: async (_principal, permission) => (asked.push(permission), true) },
    });
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/s' });
    expect(response.statusCode).toBe(200);
    expect(asked).toEqual(['crm.thing.read']);
  });

  it('SEC-04 a no from the authorizer is 403 and the handler does not run', async () => {
    let ran = false;
    const { server } = testServer({
      authenticator: { authenticate: async () => USER },
      authorizer: { can: async () => false },
    });
    const { public: _public, ...base } = okRoute('/api/v1/t/deny');
    server.route({ ...base, permission: 'a.b', handler: () => ((ran = true), { ok: true }) });
    expect((await server.inject({ method: 'GET', url: '/api/v1/t/deny' })).statusCode).toBe(403);
    expect(ran).toBe(false);
  });

  it('SEC-04 a public route still authenticates, so the handler can tell who is there', async () => {
    const { server } = testServer({ authenticator: { authenticate: async () => USER } });
    server.route(okRoute('/api/v1/t/who', { handler: (ctx) => ({ ok: ctx.principal?.id === 'u-1' }) }));
    expect(JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/t/who' })).body)).toEqual({ ok: true });
  });

  it('DATA-19 the tenant that the resolver gave is in the context of the handler, and a refusal of the resolver is the answer', async () => {
    const { server } = testServer({ tenantResolver: { resolve: async () => 't-9' } });
    server.route(
      okRoute('/api/v1/t/tenant', {
        handler: (ctx) => ({ ok: ctx.tenantId === 't-9' && requestContext.get()?.tenantId === 't-9' }),
      }),
    );
    expect(JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/t/tenant' })).body)).toEqual({ ok: true });
    const refusing = testServer({
      tenantResolver: {
        resolve: async () => {
          throw new BkError('no tenant', { code: 'X_NO_TENANT', status: 403, safeMessage: 'Unknown tenant.' });
        },
      },
    });
    refusing.server.route(okRoute('/api/v1/t/tenant'));
    expect((await refusing.server.inject({ method: 'GET', url: '/api/v1/t/tenant' })).statusCode).toBe(403);
  });
});

describe('API-05 rate limits', () => {
  it('API-05 a refusal of the IP limiter is 429 with Retry-After, before anyone is authenticated', async () => {
    const calls: string[] = [];
    const { server } = testServer({
      ipLimiter: { hit: async () => ({ allowed: false, retryAfterSeconds: 7 }) },
      authenticator: { authenticate: async () => (calls.push('authenticate'), USER) },
    });
    server.route(okRoute('/api/v1/t/lim'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/lim' });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('7');
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_TOO_MANY_REQUESTS' });
    expect(calls).toEqual([]);
  });

  it('API-05 the IP limiter is keyed by the address of the client, and by the forwarded one behind a trusted proxy', async () => {
    const keys: string[] = [];
    const limiter = { hit: async (key: string) => (keys.push(key), { allowed: true }) };
    const direct = testServer({ ipLimiter: limiter });
    direct.server.route(okRoute('/api/v1/t/ip'));
    await direct.server.inject({ method: 'GET', url: '/api/v1/t/ip', headers: { 'x-forwarded-for': '203.0.113.9' } });
    const proxied = testServer({ ipLimiter: limiter }, { ...TEST_ENV, TRUST_PROXY: true });
    proxied.server.route(okRoute('/api/v1/t/ip'));
    await proxied.server.inject({ method: 'GET', url: '/api/v1/t/ip', headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(keys).toEqual(['127.0.0.1', '203.0.113.9']);
  });

  it('API-05 the limiter of the user is keyed by the principal and runs after authentication', async () => {
    const keys: string[] = [];
    const { server } = testServer({
      authenticator: { authenticate: async () => USER },
      userLimiter: { hit: async (key) => (keys.push(key), { allowed: false, retryAfterSeconds: 3 }) },
    });
    server.route(okRoute('/api/v1/t/ulim'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/ulim' });
    expect(response.statusCode).toBe(429);
    expect(keys).toEqual(['u-1']);
  });

  it('API-05 an anonymous request is not counted by the limiter of users', async () => {
    const keys: string[] = [];
    const { server } = testServer({ userLimiter: { hit: async (key) => (keys.push(key), { allowed: true }) } });
    server.route(okRoute('/api/v1/t/anon'));
    await server.inject({ method: 'GET', url: '/api/v1/t/anon' });
    expect(keys).toEqual([]);
  });
});

describe('REQ-01 the hooks of plugins', () => {
  it('REQ-01 only the four named stages can be hooked', () => {
    const { server } = testServer();
    for (const name of ['onRequest', 'preHandler', 'authorize', 'handler', '']) {
      // @ts-expect-error these are not stages that a plugin may hook
      expect(() => server.stage(name, () => undefined)).toThrow(
        expect.objectContaining({ code: 'HTTP_STAGE_INVALID' }),
      );
    }
  });

  it('REQ-01 hooks of one stage run in the order they were added', async () => {
    const { server } = testServer();
    const order: number[] = [];
    for (const n of [1, 2, 3]) server.stage('beforeHandler', () => void order.push(n));
    server.route(okRoute('/api/v1/t/hooks'));
    await server.inject({ method: 'GET', url: '/api/v1/t/hooks' });
    expect(order).toEqual([1, 2, 3]);
  });

  it('REQ-02 a hook that fails stops the request with its problem, and the handler does not run', async () => {
    const { server } = testServer();
    let ran = false;
    server.stage('afterAuth', () => {
      throw new BkError('x', { code: 'X_PLUGIN', status: 423, safeMessage: 'Locked.' });
    });
    server.route(okRoute('/api/v1/t/fail', { handler: () => ((ran = true), { ok: true }) }));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/fail' });
    expect(response.statusCode).toBe(423);
    expect(ran).toBe(false);
  });

  it('REQ-01 a hook receives what it needs of the request, and afterHandler the value that the handler returned', async () => {
    const { server } = testServer({ authenticator: { authenticate: async () => USER } });
    const seen: unknown[] = [];
    server.stage('beforeHandler', (ctx) => void seen.push([ctx.method, ctx.path, ctx.principal?.id]));
    server.stage('afterHandler', (ctx) => void seen.push(ctx.result));
    server.route(okRoute('/api/v1/t/args'));
    await server.inject({ method: 'GET', url: '/api/v1/t/args?q=1' });
    expect(seen).toEqual([['GET', '/api/v1/t/args', 'u-1'], { ok: true }]);
  });

  it('REQ-01 a failure in an onResponse hook is logged and does not change the response', async () => {
    const { server, logger } = testServer();
    server.stage('onResponse', () => {
      throw new Error('late');
    });
    server.route(okRoute('/api/v1/t/late'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/late' });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(logger.lines.some((line) => line.level === 'error' && /onResponse/.test(line.message))).toBe(true);
  });
});

describe('OBS-01 one log line for each request', () => {
  it('OBS-01 has the method, the path without its query, the status, the time and the request id', async () => {
    const { server, logger } = testServer();
    server.route(okRoute('/api/v1/t/log'));
    await server.inject({ method: 'GET', url: '/api/v1/t/log?token=SECRET', headers: { 'x-request-id': 'rid-1' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const lines = logger.lines.filter((line) => line.message === 'request completed');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('info');
    expect(lines[0]?.fields).toMatchObject({ method: 'GET', path: '/api/v1/t/log', status: 200, requestId: 'rid-1' });
    expect(typeof lines[0]?.fields['durationMs']).toBe('number');
    expect(JSON.stringify(logger.lines)).not.toContain('SECRET');
  });

  it('OBS-01 a 5xx is logged as an error, and a 4xx is not', async () => {
    const { server, logger } = testServer();
    server.route(
      okRoute('/api/v1/t/boom', {
        handler: () => {
          throw new Error('x');
        },
      }),
    );
    await server.inject({ method: 'GET', url: '/api/v1/t/boom' });
    await server.inject({ method: 'GET', url: '/api/v1/t/missing' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const done = logger.lines.filter((line) => line.message === 'request completed');
    expect(done.map((line) => [line.fields['status'], line.level])).toEqual([
      [500, 'error'],
      [404, 'info'],
    ]);
  });
});
