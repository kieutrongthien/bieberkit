/**
 * BieberKit
 *
 * @file        packages/http/src/routes.test.ts
 * @description Tests of the rules a route must meet to be registered, and of the response schema that decides what leaves the server (API-01, API-02).
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
import { defineRoute } from './route.ts';
import { okRoute, testServer } from './testing.ts';

function refusal(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

describe('API-02 a route declares a permission or is public', () => {
  it('API-02 refuses a route with neither, and names the route', () => {
    const { server } = testServer();
    const { public: _public, ...route } = okRoute('/api/v1/t/x');
    const error = refusal(() => server.route(route));
    expect(error).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
    expect(error instanceof Error ? error.message : '').toContain('GET /api/v1/t/x');
  });

  it('API-02 refuses a route with both', () => {
    const { server } = testServer();
    expect(refusal(() => server.route(okRoute('/api/v1/t/y', { permission: 'a.b' })))).toMatchObject({
      code: 'HTTP_ROUTE_INVALID',
    });
  });

  it('API-02 accepts a route with a permission', () => {
    const { server } = testServer();
    const { public: _public, ...route } = okRoute('/api/v1/t/z');
    expect(() => server.route({ ...route, permission: 'crm.thing.read' })).not.toThrow();
  });

  it('API-02 refuses a blank permission', () => {
    const { server } = testServer();
    const { public: _public, ...route } = okRoute('/api/v1/t/w');
    expect(refusal(() => server.route({ ...route, permission: ' ' }))).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });
});

describe('API-01 a route declares a response schema', () => {
  it('API-01 refuses a route without a response schema for a 2xx status', () => {
    const { server } = testServer();
    expect(refusal(() => server.route({ ...okRoute('/api/v1/t/a'), schema: { response: {} } }))).toMatchObject({
      code: 'HTTP_ROUTE_INVALID',
    });
    expect(
      refusal(() => server.route({ ...okRoute('/api/v1/t/b'), schema: { response: { 404: { type: 'object' } } } })),
    ).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it('API-01 refuses a schema that Ajv does not accept, such as an unknown keyword', () => {
    const { server } = testServer();
    const error = refusal(() =>
      server.route({ ...okRoute('/api/v1/t/c'), schema: { response: { 200: { type: 'object', frobnicate: true } } } }),
    );
    expect(error).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it('API-01 refuses a bad schema of the input as well', () => {
    const { server } = testServer();
    expect(
      refusal(() =>
        server.route({
          ...okRoute('/api/v1/t/d'),
          schema: { query: { type: 'nonsense' }, response: { 200: { type: 'object' } } },
        }),
      ),
    ).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it('API-01 drops a field that the response schema does not name', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/leak', {
        handler: () => ({ ok: true, passwordHash: 'LEAK', nested: { secret: 'LEAK' } }),
      }),
    );
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/leak' });
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    expect(response.body).not.toContain('LEAK');
  });

  it('API-01 the handler may set another status that has a schema', async () => {
    const { server } = testServer();
    server.route({
      method: 'POST',
      url: '/api/v1/t/make',
      public: true,
      schema: {
        body: { type: 'object' },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
      handler: (ctx) => {
        ctx.status(201);
        return { id: 'a' };
      },
    });
    const response = await server.inject({ method: 'POST', url: '/api/v1/t/make', payload: {} });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ id: 'a' });
  });

  it('API-01 a handler that answers with a status that has no schema is a 500, not a leak', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/nostatus', {
        handler: (ctx) => {
          ctx.status(202);
          return { ok: true, secret: 'LEAK' };
        },
      }),
    );
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/nostatus' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('LEAK');
  });
});

describe('API-01 other rules of a route', () => {
  it('API-01 refuses the same method and url twice', () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/dup'));
    expect(refusal(() => server.route(okRoute('/api/v1/t/dup')))).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it('API-01 the same url with another method is another route', () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/two'));
    expect(() => server.route({ ...okRoute('/api/v1/t/two'), method: 'DELETE' })).not.toThrow();
  });

  it('API-01 refuses a method that is not one of the five, and a url that does not start with a slash', () => {
    const { server } = testServer();
    // @ts-expect-error TRACE is not a method of a route
    expect(refusal(() => server.route({ ...okRoute('/api/v1/t/m'), method: 'TRACE' }))).toMatchObject({
      code: 'HTTP_ROUTE_INVALID',
    });
    expect(refusal(() => server.route(okRoute('api/v1/t/n')))).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it('API-01 refuses to add a route after the server has started', async () => {
    const { server } = testServer();
    await server.inject({ method: 'GET', url: '/health/live' });
    expect(refusal(() => server.route(okRoute('/api/v1/t/late')))).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });

  it('API-01 defineRoute returns the route it was given', () => {
    const route = okRoute('/api/v1/t/same');
    expect(defineRoute(route)).toBe(route);
  });

  it('API-01 the routes of the server itself are not available under the same url', () => {
    const { server } = testServer();
    expect(refusal(() => server.route(okRoute('/health/live')))).toMatchObject({ code: 'HTTP_ROUTE_INVALID' });
  });
});
