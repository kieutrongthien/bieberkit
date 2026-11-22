/**
 * BieberKit
 *
 * @file        packages/http/src/route-options.test.ts
 * @description Tests of the route options for deprecation and public cache headers, and of the permission check of the handler (API-09, API-16).
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
import { okRoute, testServer } from './testing.ts';

function refusal(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

describe('API-16 deprecation', () => {
  const route = okRoute('/api/v1/t/old', {
    deprecated: { since: '2026-01-01', sunset: '2027-06-30', link: 'https://example.test/migrate' },
  });

  it('API-16 sends Deprecation, Sunset and a Link on every answer', async () => {
    const { server } = testServer();
    server.route(route);
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/old' });
    expect(response.headers['deprecation']).toBe(`@${Date.UTC(2026, 0, 1) / 1000}`);
    expect(response.headers['sunset']).toBe('Wed, 30 Jun 2027 00:00:00 GMT');
    expect(response.headers['link']).toBe('<https://example.test/migrate>; rel="deprecation"');
  });

  it('API-16 sends them on an error answer too', async () => {
    const { server } = testServer();
    server.route({
      ...route,
      url: '/api/v1/t/old2',
      handler: () => {
        throw new Error('x');
      },
    });
    expect((await server.inject({ method: 'GET', url: '/api/v1/t/old2' })).headers['deprecation']).toBeDefined();
  });

  it('API-16 a route that is not deprecated sends none of them', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/new'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/new' });
    expect(response.headers['deprecation']).toBeUndefined();
    expect(response.headers['sunset']).toBeUndefined();
  });

  it('API-16 with only a deprecation date, there is no Sunset', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/old3', { deprecated: { since: '2026-02-02' } }));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/old3' });
    expect(response.headers['deprecation']).toBeDefined();
    expect(response.headers['sunset']).toBeUndefined();
  });

  it.each([
    ['a date that is not a date', { since: '2026-13-45' }],
    ['a sunset that is not a date', { sunset: 'soon' }],
    ['a sunset before the deprecation', { since: '2027-01-01', sunset: '2026-01-01' }],
    ['a link that is not an https url', { link: 'ftp://x' }],
  ])('API-16 refuses %s', (_name, deprecated) => {
    const { server } = testServer();
    expect(refusal(() => server.route(okRoute('/api/v1/t/bad', { deprecated })))).toMatchObject({
      code: 'HTTP_ROUTE_INVALID',
    });
  });
});

describe('API-09 public cache headers', () => {
  it('API-09 a public GET with cache sends s-maxage, stale-while-revalidate and the tags', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/page', { cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: ['page:home', 'menu'] } }),
    );
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/page' });
    expect(response.headers['cache-control']).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(response.headers['cache-tag']).toBe('page:home,menu');
    expect(response.headers['etag']).toBeDefined();
  });

  it('API-09 without a stale time, only s-maxage', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/page2', { cache: { sMaxAge: 30 } }));
    expect((await server.inject({ method: 'GET', url: '/api/v1/t/page2' })).headers['cache-control']).toBe(
      'public, s-maxage=30',
    );
  });

  it('API-09 an error is never cached by a shared cache', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/page3', {
        cache: { sMaxAge: 30 },
        handler: () => {
          throw new Error('x');
        },
      }),
    );
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/page3' });
    expect(response.headers['cache-control']).toBeUndefined();
    expect(response.headers['cache-tag']).toBeUndefined();
  });

  it('API-09 a route with cache must be public and a GET', () => {
    const { server } = testServer();
    const { public: _public, ...secured } = okRoute('/api/v1/t/p1');
    expect(refusal(() => server.route({ ...secured, permission: 'a.b', cache: { sMaxAge: 10 } }))).toMatchObject({
      code: 'HTTP_ROUTE_INVALID',
    });
    expect(
      refusal(() => server.route({ ...okRoute('/api/v1/t/p2'), method: 'POST', cache: { sMaxAge: 10 } })),
    ).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it.each([
    ['a negative time', { sMaxAge: -1 }],
    ['a time that is not whole', { sMaxAge: 1.5 }],
    ['a tag with a comma', { sMaxAge: 1, tags: ['a,b'] }],
    ['a blank tag', { sMaxAge: 1, tags: [' '] }],
  ])('API-09 refuses %s', (_name, cache) => {
    const { server } = testServer();
    expect(refusal(() => server.route(okRoute('/api/v1/t/p3', { cache })))).toMatchObject({
      code: 'HTTP_ROUTE_INVALID',
    });
  });

  it('API-09 a 304 keeps the cache headers', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/page4', { cache: { sMaxAge: 60 } }));
    const first = await server.inject({ method: 'GET', url: '/api/v1/t/page4' });
    const again = await server.inject({
      method: 'GET',
      url: '/api/v1/t/page4',
      headers: { 'if-none-match': String(first.headers['etag']) },
    });
    expect(again.statusCode).toBe(304);
    expect(again.headers['cache-control']).toBe('public, s-maxage=60');
  });
});

describe('API-14 the permission check of a handler', () => {
  it('API-14 can() asks the authorizer for the principal of the request', async () => {
    const asked: string[] = [];
    const { server } = testServer({
      authenticator: { authenticate: async () => ({ id: 'u-1', kind: 'user' }) },
      authorizer: { can: async (_principal, permission) => (asked.push(permission), permission === 'a.yes') },
    });
    server.route(
      okRoute('/api/v1/t/can', {
        handler: async (ctx) => ({ ok: (await ctx.can('a.yes')) && !(await ctx.can('a.no')) }),
      }),
    );
    expect(JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/t/can' })).body)).toEqual({ ok: true });
    expect(asked).toEqual(['a.yes', 'a.no']);
  });

  it('API-14 can() is false for a caller who is not signed in, or when there is no authorizer', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/can', { handler: async (ctx) => ({ ok: await ctx.can('a.yes') }) }));
    expect(JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/t/can' })).body)).toEqual({ ok: false });
    const signed = testServer({ authenticator: { authenticate: async () => ({ id: 'u-1', kind: 'user' }) } });
    signed.server.route(okRoute('/api/v1/t/can', { handler: async (ctx) => ({ ok: await ctx.can('a.yes') }) }));
    expect(JSON.parse((await signed.server.inject({ method: 'GET', url: '/api/v1/t/can' })).body)).toEqual({
      ok: false,
    });
  });
});
