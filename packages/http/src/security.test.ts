/**
 * BieberKit
 *
 * @file        packages/http/src/security.test.ts
 * @description Tests of the security headers and the CORS allowlist of the server (SEC-01, SEC-02).
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
import { okRoute, TEST_ENV, testServer } from './testing.ts';

const ADMIN = 'https://admin.example.com';

function corsServer(origins: string[] = [ADMIN], extra: Record<string, unknown> = {}) {
  const { server } = testServer({ cors: { origins, ...extra } });
  server.route(okRoute('/api/v1/t/ok'));
  return server;
}

describe('SEC-01 security headers', () => {
  it('SEC-01 every answer carries the headers of a JSON API', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/ok'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/ok' });
    expect(response.headers).toMatchObject({
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
    expect(String(response.headers['permissions-policy'])).toContain('camera=()');
  });

  it('SEC-01 an error, a 404 and a 304 carry them too', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/ok'));
    server.route(
      okRoute('/api/v1/t/boom', {
        handler: () => {
          throw new Error('x');
        },
      }),
    );
    const first = await server.inject({ method: 'GET', url: '/api/v1/t/ok' });
    const cached = await server.inject({
      method: 'GET',
      url: '/api/v1/t/ok',
      headers: { 'if-none-match': String(first.headers['etag']) },
    });
    for (const response of [
      await server.inject({ method: 'GET', url: '/api/v1/t/boom' }),
      await server.inject({ method: 'GET', url: '/nothing' }),
      cached,
    ]) {
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBeDefined();
    }
    expect(cached.statusCode).toBe(304);
  });

  it('SEC-01 HSTS is sent in production, and not in development', async () => {
    const dev = testServer();
    dev.server.route(okRoute('/api/v1/t/ok'));
    expect(
      (await dev.server.inject({ method: 'GET', url: '/api/v1/t/ok' })).headers['strict-transport-security'],
    ).toBeUndefined();
    const prod = testServer({}, { ...TEST_ENV, APP_ENV: 'production' });
    prod.server.route(okRoute('/api/v1/t/ok'));
    expect(
      (await prod.server.inject({ method: 'GET', url: '/api/v1/t/ok' })).headers['strict-transport-security'],
    ).toBe('max-age=31536000; includeSubDomains');
  });

  it('SEC-01 HSTS is sent on a request that came over https through a trusted proxy', async () => {
    const { server } = testServer({}, { ...TEST_ENV, TRUST_PROXY: true });
    server.route(okRoute('/api/v1/t/ok'));
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/t/ok',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(response.headers['strict-transport-security']).toBeDefined();
  });

  it('SEC-01 a header can be replaced, and removed with false', async () => {
    const { server } = testServer({
      headers: { 'content-security-policy': "default-src 'self'", 'referrer-policy': false },
    });
    server.route(okRoute('/api/v1/t/ok'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/ok' });
    expect(response.headers['content-security-policy']).toBe("default-src 'self'");
    expect(response.headers['referrer-policy']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('SEC-01 a handler may set its own value of a header, which wins', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/own', { handler: (ctx) => (ctx.header('referrer-policy', 'no-referrer'), { ok: true }) }),
    );
    expect((await server.inject({ method: 'GET', url: '/api/v1/t/own' })).headers['referrer-policy']).toBe(
      'no-referrer',
    );
  });

  it('SEC-01 refuses a header value with a line break', () => {
    expect(() => testServer({ headers: { 'x-test': 'a\r\nb' } })).toThrow(
      expect.objectContaining({ code: 'HTTP_CONFIG_INVALID' }),
    );
  });
});

describe('SEC-02 CORS', () => {
  it('SEC-02 gives an allowed origin its headers, with credentials, and varies by Origin', async () => {
    const response = await corsServer().inject({ method: 'GET', url: '/api/v1/t/ok', headers: { origin: ADMIN } });
    expect(response.headers['access-control-allow-origin']).toBe(ADMIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(String(response.headers['vary'])).toContain('Origin');
    expect(String(response.headers['access-control-expose-headers'])).toContain('x-request-id');
  });

  it('SEC-02 gives another origin nothing, and still varies by Origin', async () => {
    const response = await corsServer().inject({
      method: 'GET',
      url: '/api/v1/t/ok',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(String(response.headers['vary'])).toContain('Origin');
  });

  it('SEC-02 never allows the null origin, or an origin that only starts like an allowed one', async () => {
    const server = corsServer();
    for (const origin of ['null', `${ADMIN}.evil.example`, 'http://admin.example.com', `${ADMIN}:8443`]) {
      const response = await server.inject({ method: 'GET', url: '/api/v1/t/ok', headers: { origin } });
      expect([origin, response.headers['access-control-allow-origin']]).toEqual([origin, undefined]);
    }
  });

  it('SEC-02 without a cors option no origin is allowed', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/ok'));
    expect(
      (await server.inject({ method: 'GET', url: '/api/v1/t/ok', headers: { origin: ADMIN } })).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });

  it('SEC-02 credentials can be turned off', async () => {
    const response = await corsServer([ADMIN], { credentials: false }).inject({
      method: 'GET',
      url: '/api/v1/t/ok',
      headers: { origin: ADMIN },
    });
    expect(response.headers['access-control-allow-origin']).toBe(ADMIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it.each([
    ['a wildcard', '*'],
    ['null', 'null'],
    ['a path', 'https://a.example/path'],
    ['no scheme', 'a.example.com'],
    ['a wildcard host', 'https://*.example.com'],
    ['a trailing slash', 'https://a.example/'],
    ['a scheme that is not http', 'ftp://a.example'],
  ])('SEC-02 refuses %s in the list', (_name, origin) => {
    expect(() => testServer({ cors: { origins: [origin] } })).toThrow(
      expect.objectContaining({ code: 'HTTP_CONFIG_INVALID' }),
    );
  });

  it('SEC-02 a preflight from an allowed origin is 204 with the methods, headers and max age, before any authentication', async () => {
    const calls: string[] = [];
    const { server } = testServer({
      cors: { origins: [ADMIN] },
      authenticator: { authenticate: async () => (calls.push('auth'), undefined) },
      ipLimiter: { hit: async () => (calls.push('ip'), { allowed: false }) },
    });
    server.route(okRoute('/api/v1/t/ok'));
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/api/v1/t/ok',
      headers: {
        origin: ADMIN,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'if-match',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ADMIN);
    expect(String(response.headers['access-control-allow-methods'])).toContain('PATCH');
    expect(String(response.headers['access-control-allow-headers'])).toContain('if-match');
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(calls).toEqual([]);
  });

  it('SEC-02 a preflight from another origin is 403', async () => {
    const response = await corsServer().inject({
      method: 'OPTIONS',
      url: '/api/v1/t/ok',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'HTTP_CORS_DENIED' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('SEC-02 a preflight with a method that no browser would ask for is 403 too', async () => {
    const response = await corsServer().inject({
      method: 'OPTIONS',
      url: '/api/v1/t/ok',
      headers: { origin: ADMIN, 'access-control-request-method': 'TRACE' },
    });
    expect(response.statusCode).toBe(403);
  });
});
