/**
 * BieberKit
 *
 * @file        packages/http/src/idempotency.test.ts
 * @description Tests of Idempotency-Key on POST routes and of the memory store behind it (spec 13.1).
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
import { createMemoryIdempotencyStore } from './idempotency.ts';
import { okRoute, testServer } from './testing.ts';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function counting(extra: Record<string, unknown> = {}) {
  const calls = { n: 0 };
  const { server } = testServer({
    authenticator: { authenticate: async () => ({ id: 'u-1', kind: 'user' }) },
    ...extra,
  });
  server.route({
    method: 'POST',
    url: '/api/v1/t/charge',
    public: true,
    idempotent: true,
    schema: { body: { type: 'object' }, response: { 201: { type: 'object', properties: { n: { type: 'integer' } } } } },
    handler: async (ctx) => {
      calls.n += 1;
      ctx.status(201);
      ctx.header('location', '/api/v1/t/charge/1');
      await wait(30);
      return { n: calls.n };
    },
  });
  return { server, calls };
}

const post = (
  server: ReturnType<typeof counting>['server'],
  key: string | undefined,
  payload: object = { amount: 5 },
) =>
  server.inject({
    method: 'POST',
    url: '/api/v1/t/charge',
    payload,
    ...(key === undefined ? {} : { headers: { 'idempotency-key': key } }),
  });

describe('13.1 Idempotency-Key', () => {
  it('13.1 a request without a key runs every time', async () => {
    const { server, calls } = counting();
    await post(server, undefined);
    await post(server, undefined);
    expect(calls.n).toBe(2);
  });

  it('13.1 a second request with the same key and body gets the first answer and does not run', async () => {
    const { server, calls } = counting();
    const first = await post(server, 'key-1');
    const second = await post(server, 'key-1');
    expect(calls.n).toBe(1);
    expect(second.statusCode).toBe(201);
    expect(second.body).toBe(first.body);
    expect(second.headers['location']).toBe('/api/v1/t/charge/1');
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(first.headers['idempotency-replayed']).toBeUndefined();
  });

  it('13.1 the same key with another body is 422, and does not run', async () => {
    const { server, calls } = counting();
    await post(server, 'key-2');
    const other = await post(server, 'key-2', { amount: 6 });
    expect(other.statusCode).toBe(422);
    expect(JSON.parse(other.body)).toMatchObject({ code: 'HTTP_IDEMPOTENCY_KEY_REUSED' });
    expect(calls.n).toBe(1);
  });

  it('13.1 the same key while the first request runs is 409', async () => {
    const { server, calls } = counting();
    const [first, second] = await Promise.all([post(server, 'key-3'), wait(5).then(() => post(server, 'key-3'))]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body)).toMatchObject({ code: 'HTTP_IDEMPOTENCY_IN_PROGRESS' });
    expect(calls.n).toBe(1);
  });

  it('13.1 a key belongs to one caller: another principal with the same key runs its own request', async () => {
    let who = 'u-1';
    const { server, calls } = counting({ authenticator: { authenticate: async () => ({ id: who, kind: 'user' }) } });
    await post(server, 'key-4');
    who = 'u-2';
    await post(server, 'key-4');
    expect(calls.n).toBe(2);
  });

  it('13.1 a key belongs to one route', async () => {
    const { server, calls } = counting();
    server.route({
      ...okRoute('/api/v1/t/other'),
      method: 'POST',
      idempotent: true,
      schema: { body: { type: 'object' }, response: { 200: { type: 'object' } } },
    });
    await post(server, 'key-5');
    const other = await server.inject({
      method: 'POST',
      url: '/api/v1/t/other',
      payload: {},
      headers: { 'idempotency-key': 'key-5' },
    });
    expect(other.statusCode).toBe(200);
    expect(calls.n).toBe(1);
  });

  it('13.1 an answer that failed is not kept, so the same key can be sent again with a fixed body', async () => {
    const { server } = testServer();
    let fail = true;
    server.route({
      method: 'POST',
      url: '/api/v1/t/flaky',
      public: true,
      idempotent: true,
      schema: {
        body: { type: 'object' },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
      },
      handler: () => {
        if (fail) throw new Error('boom');
        return { ok: true };
      },
    });
    const send = () =>
      server.inject({ method: 'POST', url: '/api/v1/t/flaky', payload: {}, headers: { 'idempotency-key': 'key-6' } });
    expect((await send()).statusCode).toBe(500);
    fail = false;
    const again = await send();
    expect(again.statusCode).toBe(200);
    expect(again.headers['idempotency-replayed']).toBeUndefined();
  });

  it('13.1 a request that does not pass validation does not use up the key', async () => {
    const { server } = testServer();
    server.route({
      method: 'POST',
      url: '/api/v1/t/strict',
      public: true,
      idempotent: true,
      schema: {
        body: { type: 'object', properties: { a: {} }, required: ['a'] },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
      },
      handler: () => ({ ok: true }),
    });
    const send = (payload: object) =>
      server.inject({ method: 'POST', url: '/api/v1/t/strict', payload, headers: { 'idempotency-key': 'key-7' } });
    expect((await send({})).statusCode).toBe(400);
    expect((await send({ a: 1 })).statusCode).toBe(200);
  });

  it.each([
    ['empty', ''],
    ['too long', 'x'.repeat(256)],
    ['with a space', 'a b'],
    ['with a control character', 'a\u0001b'],
  ])('13.1 a key that is %s is 400', async (_name, key) => {
    const { server, calls } = counting();
    const response = await post(server, key);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'HTTP_IDEMPOTENCY_KEY_INVALID' });
    expect(calls.n).toBe(0);
  });

  it('13.1 only a POST route can be idempotent, and the key is ignored on other routes', async () => {
    const { server } = testServer();
    expect(() => server.route({ ...okRoute('/api/v1/t/get'), idempotent: true })).toThrow(
      expect.objectContaining({ code: 'HTTP_ROUTE_INVALID' }),
    );
    server.route(okRoute('/api/v1/t/plain'));
    expect(
      (await server.inject({ method: 'GET', url: '/api/v1/t/plain', headers: { 'idempotency-key': 'whatever' } }))
        .statusCode,
    ).toBe(200);
  });
});

describe('13.1 the memory store', () => {
  it('13.1 keeps an answer for the time that it was given, and then forgets it', async () => {
    let now = 1000;
    const store = createMemoryIdempotencyStore({ ttlMs: 100, now: () => now });
    expect(await store.begin('k', 'f')).toEqual({ state: 'new' });
    expect(await store.begin('k', 'f')).toEqual({ state: 'busy' });
    await store.complete('k', { status: 200, headers: {}, body: '{}' });
    expect(await store.begin('k', 'f')).toMatchObject({ state: 'replay' });
    expect(await store.begin('k', 'other')).toEqual({ state: 'mismatch' });
    now += 101;
    expect(await store.begin('k', 'f')).toEqual({ state: 'new' });
  });

  it('13.1 abandon lets the key run again', async () => {
    const store = createMemoryIdempotencyStore();
    await store.begin('k', 'f');
    await store.abandon('k');
    expect(await store.begin('k', 'f')).toEqual({ state: 'new' });
  });

  it('13.1 a request that never finishes does not hold its key for ever', async () => {
    let now = 0;
    const store = createMemoryIdempotencyStore({ ttlMs: 50, now: () => now });
    await store.begin('k', 'f');
    now = 51;
    expect(await store.begin('k', 'f')).toEqual({ state: 'new' });
  });
});
