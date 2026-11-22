/**
 * BieberKit
 *
 * @file        packages/http/src/csrf.test.ts
 * @description Tests of the CSRF check for state changes by a signed in browser, and of the token that goes with it (SEC-03, API-12).
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
import type { Principal } from './ports.ts';
import { createCsrf, registerCsrfToken } from './csrf.ts';
import type { HttpServerOptions } from './server.ts';
import { okRoute, testServer } from './testing.ts';

const SECRET = 'a-secret-of-more-than-thirty-two-bytes!!';
const csrf = createCsrf(SECRET);
const ADMIN = 'https://admin.example.com';

function app(principal: Principal | undefined, options: HttpServerOptions = {}) {
  const { server } = testServer({
    authenticator: { authenticate: async () => principal },
    csrf,
    cors: { origins: [ADMIN] },
    ...options,
  });
  server.route({
    ...okRoute('/api/v1/t/change'),
    method: 'POST',
    schema: {
      body: { type: 'object' },
      response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
    },
  });
  server.route(okRoute('/api/v1/t/read'));
  registerCsrfToken(server);
  return server;
}

const cookieUser: Principal = { id: 'u-1', kind: 'user', via: 'cookie', sessionId: 'session-1' };
const post = (server: ReturnType<typeof app>, headers: Record<string, string> = {}) =>
  server.inject({ method: 'POST', url: '/api/v1/t/change', payload: {}, headers });

describe('SEC-03 the token', () => {
  it('SEC-03 a token is valid for the session that it was made for', () => {
    const token = csrf.issue('session-1');
    expect(csrf.verify(token, 'session-1')).toBe(true);
    expect(csrf.verify(token, 'session-2')).toBe(false);
  });

  it('SEC-03 a token is different every time, and still valid', () => {
    const one = csrf.issue('session-1');
    const two = csrf.issue('session-1');
    expect(one).not.toBe(two);
    expect(csrf.verify(two, 'session-1')).toBe(true);
  });

  it('SEC-03 a token that was changed, cut or made with another secret is not valid', () => {
    const token = csrf.issue('session-1');
    expect(csrf.verify(`${token}x`, 'session-1')).toBe(false);
    expect(csrf.verify(token.slice(0, -2), 'session-1')).toBe(false);
    expect(csrf.verify(createCsrf('another-secret-of-more-than-32-bytes!!').issue('session-1'), 'session-1')).toBe(
      false,
    );
    for (const bad of ['', 'abc', '.', 'a.b.c', '😀']) expect(csrf.verify(bad, 'session-1')).toBe(false);
  });

  it('SEC-03 refuses a secret that is too short', () => {
    expect(() => createCsrf('short')).toThrow(expect.objectContaining({ code: 'HTTP_CONFIG_INVALID' }));
  });
});

describe('SEC-03 the check', () => {
  it('SEC-03 a request from the same origin passes without a token', async () => {
    expect((await post(app(cookieUser), { 'sec-fetch-site': 'same-origin' })).statusCode).toBe(200);
  });

  it('SEC-03 a cross-site request with no token is 403', async () => {
    const response = await post(app(cookieUser), { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'HTTP_CSRF_FAILED' });
  });

  it('SEC-03 a request that says nothing about where it came from, and has no token, is 403', async () => {
    expect((await post(app(cookieUser))).statusCode).toBe(403);
  });

  it('SEC-03 a valid token from an allowed origin passes, same-site or with no Fetch Metadata', async () => {
    const server = app(cookieUser);
    const token = csrf.issue('session-1');
    expect(
      (await post(server, { 'sec-fetch-site': 'same-site', origin: ADMIN, 'x-csrf-token': token })).statusCode,
    ).toBe(200);
    expect((await post(server, { 'x-csrf-token': token })).statusCode).toBe(200);
  });

  it('SEC-03 a token for another session, or from an origin that is not allowed, is 403', async () => {
    const server = app(cookieUser);
    expect(
      (await post(server, { 'sec-fetch-site': 'cross-site', origin: ADMIN, 'x-csrf-token': csrf.issue('session-2') }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await post(server, {
          'sec-fetch-site': 'cross-site',
          origin: 'https://evil.example',
          'x-csrf-token': csrf.issue('session-1'),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('SEC-03 the origin of the server itself is allowed', async () => {
    const response = await post(app(cookieUser), {
      host: 'api.example.com',
      origin: 'http://api.example.com',
      'x-csrf-token': csrf.issue('session-1'),
    });
    expect(response.statusCode).toBe(200);
  });

  it('SEC-03 a GET is never checked', async () => {
    expect(
      (
        await app(cookieUser).inject({
          method: 'GET',
          url: '/api/v1/t/read',
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('SEC-03 each method that changes state is checked', async () => {
    const { server } = testServer({ authenticator: { authenticate: async () => cookieUser }, csrf });
    const methods = ['PUT', 'PATCH', 'DELETE'] as const;
    for (const method of methods) {
      server.route({ ...okRoute(`/api/v1/t/${method}`), method, schema: { response: { 200: { type: 'object' } } } });
    }
    for (const method of methods) {
      const response = await server.inject({
        method,
        url: `/api/v1/t/${method}`,
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('SEC-03 a caller with a token or an API key is not checked, and nor is a service (API-12)', async () => {
    for (const principal of [
      { id: 'k', kind: 'apiKey', via: 'token' },
      { id: 'u', kind: 'user', via: 'token' },
      { id: 's', kind: 'service' },
    ] as Principal[]) {
      expect((await post(app(principal), { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(200);
    }
  });

  it('SEC-03 a caller who is not signed in has nothing to forge, and the route decides', async () => {
    expect((await post(app(undefined), { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(200);
  });

  it('SEC-03 a principal that does not say how it came is treated as a cookie', async () => {
    expect(
      (await post(app({ id: 'u', kind: 'user', sessionId: 'session-1' }), { 'sec-fetch-site': 'cross-site' }))
        .statusCode,
    ).toBe(403);
  });

  it('SEC-03 with no csrf option only a same-origin request passes: the server fails closed', async () => {
    const { server } = testServer({ authenticator: { authenticate: async () => cookieUser } });
    server.route({
      ...okRoute('/api/v1/t/change'),
      method: 'POST',
      schema: { body: { type: 'object' }, response: { 200: { type: 'object' } } },
    });
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/t/change',
          payload: {},
          headers: { 'sec-fetch-site': 'same-origin' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/t/change',
          payload: {},
          headers: { 'x-csrf-token': csrf.issue('session-1') },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('SEC-03 the check comes before the body is read: a body that is not JSON is 403, not 400', async () => {
    const response = await app(cookieUser).inject({
      method: 'POST',
      url: '/api/v1/t/change',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      payload: '{ not json',
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('SEC-03 the route of the token', () => {
  it('SEC-03 gives the token of the session of the caller', async () => {
    const response = await app(cookieUser).inject({ method: 'GET', url: '/api/v1/csrf' });
    expect(response.statusCode).toBe(200);
    const token = String(JSON.parse(response.body).token);
    expect(csrf.verify(token, 'session-1')).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('SEC-03 is 401 for a caller with no session', async () => {
    expect((await app(undefined).inject({ method: 'GET', url: '/api/v1/csrf' })).statusCode).toBe(401);
    expect(
      (await app({ id: 'k', kind: 'apiKey', via: 'token' }).inject({ method: 'GET', url: '/api/v1/csrf' })).statusCode,
    ).toBe(401);
  });
});
