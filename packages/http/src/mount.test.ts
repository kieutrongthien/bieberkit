/**
 * BieberKit
 *
 * @file        packages/http/src/mount.test.ts
 * @description Tests of mount: a web handler that runs inside the pipeline, with the client IP that the server resolved, for a library such as Better Auth (AUTH-09, AUTH-10).
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

import { describe, expect, it } from 'vitest';
import { openApiDocument } from './openapi.ts';
import { okRoute, TEST_ENV, testServer } from './testing.ts';

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

function echoing(seen: Seen[] = []) {
  return {
    seen,
    handler: async (request: Request): Promise<Response> => {
      seen.push({
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.text(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-answer': 'yes' },
      });
    },
  };
}

describe('AUTH-09 mount', () => {
  it('AUTH-09 gives the handler a web request with the method, the url, the query, the headers and the body', async () => {
    const { server } = testServer();
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email?next=%2Fhome',
      headers: { 'content-type': 'application/json', origin: 'https://app.test', host: 'app.test' },
      payload: { email: 'a@b.vn', password: 'x' },
    });
    expect(response.statusCode).toBe(201);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', body: JSON.stringify({ email: 'a@b.vn', password: 'x' }) });
    expect(new URL(seen[0]?.url ?? '').pathname).toBe('/api/auth/sign-in/email');
    expect(new URL(seen[0]?.url ?? '').search).toBe('?next=%2Fhome');
    expect(seen[0]?.headers['origin']).toBe('https://app.test');
  });

  it('AUTH-09 a GET and a POST with no body reach the handler', async () => {
    const { server } = testServer();
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    expect((await server.inject({ method: 'GET', url: '/api/auth/get-session' })).statusCode).toBe(201);
    expect((await server.inject({ method: 'POST', url: '/api/auth/sign-out' })).statusCode).toBe(201);
    expect(seen.map((item) => [item.method, item.body])).toEqual([
      ['GET', ''],
      ['POST', ''],
    ]);
  });

  it('AUTH-09 copies the status, the headers, the body and every Set-Cookie of the answer', async () => {
    const { server } = testServer();
    server.mount({
      prefix: '/api/auth',
      handler: async () => {
        const headers = new Headers({ 'content-type': 'application/json', 'x-answer': 'yes' });
        headers.append('set-cookie', 'a=1; Path=/; HttpOnly');
        headers.append('set-cookie', '__Host-b=2; Path=/; Secure');
        return new Response('{"hello":"world"}', { status: 202, headers });
      },
    });
    const response = await server.inject({ method: 'GET', url: '/api/auth/x' });
    expect(response.statusCode).toBe(202);
    expect(response.body).toBe('{"hello":"world"}');
    expect(response.headers['x-answer']).toBe('yes');
    expect(response.headers['set-cookie']).toEqual(['a=1; Path=/; HttpOnly', '__Host-b=2; Path=/; Secure']);
  });

  it('AUTH-09 passes an error answer of the handler as it is, and does not make a problem of it', async () => {
    const { server } = testServer();
    server.mount({
      prefix: '/api/auth',
      handler: async () =>
        new Response('{"message":"nope"}', { status: 401, headers: { 'content-type': 'application/json' } }),
    });
    const response = await server.inject({ method: 'GET', url: '/api/auth/x' });
    expect([response.statusCode, response.body]).toEqual([401, '{"message":"nope"}']);
  });

  it('MOD-17 a handler that throws is a 500 problem, and the message of the failure is not in it', async () => {
    const { server } = testServer();
    server.mount({
      prefix: '/api/auth',
      handler: async () => {
        throw new Error('secret detail');
      },
    });
    const response = await server.inject({ method: 'GET', url: '/api/auth/x' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret detail');
    expect(JSON.parse(response.body)).toMatchObject({ code: expect.any(String), traceId: expect.any(String) });
  });
});

describe('AUTH-10 the client IP of a mounted handler', () => {
  it('AUTH-10 sets x-bk-client-ip from the address of the connection, and drops one that the client sent', async () => {
    const { server } = testServer();
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    await server.inject({
      method: 'GET',
      url: '/api/auth/x',
      headers: { 'x-bk-client-ip': '6.6.6.6', 'x-forwarded-for': '7.7.7.7' },
    });
    expect(seen[0]?.headers['x-bk-client-ip']).toBe('127.0.0.1');
  });

  it('AUTH-10 behind a trusted proxy it is the forwarded address', async () => {
    const { server } = testServer({}, { ...TEST_ENV, TRUST_PROXY: true });
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    await server.inject({
      method: 'GET',
      url: '/api/auth/x',
      headers: { 'x-bk-client-ip': '6.6.6.6', 'x-forwarded-for': '203.0.113.9' },
    });
    expect(seen[0]?.headers['x-bk-client-ip']).toBe('203.0.113.9');
  });
});

describe('AUTH-09 mount in the pipeline', () => {
  it('API-05 the limiter of the IP runs before the handler', async () => {
    const { server } = testServer({ ipLimiter: { hit: async () => ({ allowed: false, retryAfterSeconds: 9 }) } });
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    const response = await server.inject({ method: 'GET', url: '/api/auth/x' });
    expect([response.statusCode, response.headers['retry-after']]).toEqual([429, '9']);
    expect(seen).toEqual([]);
  });

  it('SEC-03 a change by a caller who has a cookie session needs the check of the origin, as every route does', async () => {
    const { server } = testServer({ authenticator: { authenticate: async () => ({ id: 'u1', kind: 'user' }) } });
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    const refused = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { origin: 'https://evil.test' },
    });
    expect(refused.statusCode).toBe(403);
    expect(JSON.parse(refused.body)).toMatchObject({ code: 'HTTP_CSRF_FAILED' });
    const allowed = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(allowed.statusCode).toBe(201);
    expect(seen).toHaveLength(1);
  });

  it('API-06 a mounted prefix is not in the list of routes nor in the OpenAPI document', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/a'));
    server.mount({ prefix: '/api/auth', handler: echoing().handler });
    expect(server.routes().map((route) => route.url)).toEqual(['/api/v1/t/a']);
    const paths = openApiDocument(server.routes(), { title: 't', version: '1' })['paths'];
    expect(Object.keys(typeof paths === 'object' && paths !== null ? paths : {})).toEqual(['/api/v1/t/a']);
  });

  it('API-01 it takes the paths under the prefix only', async () => {
    const { server } = testServer();
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    expect((await server.inject({ method: 'GET', url: '/api/authx/y' })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: '/api/other' })).statusCode).toBe(404);
    expect(seen).toEqual([]);
  });

  it('API-01 refuses a prefix that is not a path, one that is mounted twice, one that a route has, and a mount after the start', async () => {
    const { server } = testServer();
    expect(() => server.mount({ prefix: 'api/auth', handler: echoing().handler })).toThrow(
      expect.objectContaining({ code: 'HTTP_ROUTE_INVALID' }),
    );
    expect(() => server.mount({ prefix: '/api/auth/', handler: echoing().handler })).toThrow(
      expect.objectContaining({ code: 'HTTP_ROUTE_INVALID' }),
    );
    server.mount({ prefix: '/api/auth', handler: echoing().handler });
    expect(() => server.mount({ prefix: '/api/auth', handler: echoing().handler })).toThrow(
      expect.objectContaining({ code: 'HTTP_ROUTE_INVALID' }),
    );
    await server.inject({ method: 'GET', url: '/health/live' });
    expect(() => server.mount({ prefix: '/api/late', handler: echoing().handler })).toThrow(
      expect.objectContaining({ code: 'HTTP_ROUTE_INVALID' }),
    );
  });

  it('API-04 a body above the limit is refused before the handler', async () => {
    const { server } = testServer({ bodyLimit: 50 });
    const { seen, handler } = echoing();
    server.mount({ prefix: '/api/auth', handler });
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/x',
      headers: { 'content-type': 'application/json' },
      payload: { text: 'x'.repeat(200) },
    });
    expect(response.statusCode).toBe(413);
    expect(seen).toEqual([]);
  });
});
