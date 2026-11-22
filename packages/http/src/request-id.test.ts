/**
 * BieberKit
 *
 * @file        packages/http/src/request-id.test.ts
 * @description Tests of the request id, the trace context and the request context that each request starts with (API-04, DATA-19).
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

import { requestContext } from '@bieberkit/core';
import type { RequestContext } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { okRoute, testServer } from './testing.ts';

const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

function seen() {
  const contexts: Partial<RequestContext>[] = [];
  const { server, logger } = testServer({
    authenticator: { authenticate: async () => ({ id: '0190f6b2-7c4e-7000-8000-0123456789ab', kind: 'user' }) },
    tenantResolver: { resolve: async () => '0190f6b2-7c4e-7000-8000-0123456789cd' },
  });
  server.route(
    okRoute('/api/v1/t/ctx', {
      handler: () => {
        contexts.push({ ...requestContext.get() });
        return { ok: true };
      },
    }),
  );
  return { server, contexts, logger };
}

describe('API-04 the request id', () => {
  it('API-04 a request without one gets a new UUID, and the response carries it', async () => {
    const { server } = seen();
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/ctx' });
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('API-04 a valid incoming id is kept', async () => {
    const { server, contexts } = seen();
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/t/ctx',
      headers: { 'x-request-id': 'edge-42:a.b_c' },
    });
    expect(response.headers['x-request-id']).toBe('edge-42:a.b_c');
    expect(contexts[0]?.requestId).toBe('edge-42:a.b_c');
  });

  it.each([
    ['too long', 'x'.repeat(129)],
    ['with a space', 'a b'],
    ['with a quote', 'a"b'],
    ['empty', ''],
  ])('API-04 an incoming id %s is replaced', async (_name, id) => {
    const { server } = seen();
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/ctx', headers: { 'x-request-id': id } });
    expect(response.headers['x-request-id']).not.toBe(id);
    expect(String(response.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('API-04 an error and a 404 carry the id too, and the problem carries the trace id', async () => {
    const { server } = seen();
    const missing = await server.inject({ method: 'GET', url: '/nothing', headers: { 'x-request-id': 'abc' } });
    expect(missing.headers['x-request-id']).toBe('abc');
  });
});

describe('API-04 the trace context', () => {
  it('API-04 a valid traceparent gives the trace id and the span of the caller', async () => {
    const { server, contexts } = seen();
    await server.inject({ method: 'GET', url: '/api/v1/t/ctx', headers: { traceparent: `00-${TRACE}-${SPAN}-01` } });
    expect(contexts[0]).toMatchObject({ traceId: TRACE, spanId: SPAN });
  });

  it('API-04 the trace id is in the problem of a failure', async () => {
    const { server } = testServer();
    const response = await server.inject({
      method: 'GET',
      url: '/nothing',
      headers: { traceparent: `00-${TRACE}-${SPAN}-01` },
    });
    expect(JSON.parse(response.body)).toMatchObject({ traceId: TRACE });
  });

  it.each([
    ['not a traceparent', 'hello'],
    ['an all zero trace id', `00-${'0'.repeat(32)}-${SPAN}-01`],
    ['an all zero span', `00-${TRACE}-${'0'.repeat(16)}-01`],
    ['the wrong version', `ff-${TRACE}-${SPAN}-01`],
    ['upper case', `00-${TRACE.toUpperCase()}-${SPAN}-01`],
  ])('API-04 %s is ignored, and a new trace id is made', async (_name, header) => {
    const { server, contexts } = seen();
    await server.inject({ method: 'GET', url: '/api/v1/t/ctx', headers: { traceparent: header } });
    expect(contexts[0]?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(contexts[0]?.traceId).not.toBe(TRACE);
    expect(contexts[0]?.traceId).not.toBe('0'.repeat(32));
  });
});

describe('DATA-19 the request context', () => {
  it('DATA-19 the handler runs with the user and the tenant that the ports gave', async () => {
    const { server, contexts } = seen();
    await server.inject({ method: 'GET', url: '/api/v1/t/ctx' });
    expect(contexts[0]).toMatchObject({
      userId: '0190f6b2-7c4e-7000-8000-0123456789ab',
      tenantId: '0190f6b2-7c4e-7000-8000-0123456789cd',
    });
  });

  it('DATA-19 two requests at once keep their own context', async () => {
    const { server, contexts } = seen();
    await Promise.all([
      server.inject({ method: 'GET', url: '/api/v1/t/ctx', headers: { 'x-request-id': 'one' } }),
      server.inject({ method: 'GET', url: '/api/v1/t/ctx', headers: { 'x-request-id': 'two' } }),
    ]);
    expect(
      contexts.map((context) => context?.requestId).toSorted((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(['one', 'two']);
  });

  it('DATA-19 nothing of the request is left in the context afterwards', async () => {
    const { server } = seen();
    await server.inject({ method: 'GET', url: '/api/v1/t/ctx' });
    expect(requestContext.get()).toBeUndefined();
  });
});
