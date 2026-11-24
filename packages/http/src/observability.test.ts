/**
 * BieberKit
 *
 * @file        packages/http/src/observability.test.ts
 * @description Tests of what the server records about a request: its span, its place in the caller's trace and its duration in the metrics (OBS-02, OBS-03, ADR 0023).
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

import { createMemorySpanExporter, createMetrics, createTracer, requestContext } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { okRoute, testServer } from './testing.ts';

const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

function observed() {
  const exporter = createMemorySpanExporter();
  const tracer = createTracer({ exporter });
  const metrics = createMetrics();
  const { server, logger } = testServer({ tracer, metrics });
  return { server, logger, spans: exporter.spans, metrics };
}

describe('OBS-02 the span of a request', () => {
  it('OBS-02 a request is a server span named by method and route, a child of the span of the caller', async () => {
    const { server, spans } = observed();
    server.route(okRoute('/api/v1/deals/:id'));
    await server.inject({
      method: 'GET',
      url: '/api/v1/deals/42?token=secret',
      headers: { traceparent: `00-${TRACE}-${SPAN}-01` },
    });
    const [span] = spans;
    expect(span).toMatchObject({
      name: 'GET /api/v1/deals/:id',
      kind: 'server',
      traceId: TRACE,
      parentSpanId: SPAN,
      failed: false,
      attributes: { 'http.method': 'GET', 'http.route': '/api/v1/deals/:id', 'http.status_code': 200 },
    });
  });

  it('OBS-02 the span never holds the path with its ids, the query string or a header', async () => {
    const { server, spans } = observed();
    server.route(okRoute('/api/v1/deals/:id'));
    await server.inject({
      method: 'GET',
      url: '/api/v1/deals/row-9731?token=querysecret',
      headers: { authorization: 'Bearer headersecret', cookie: 'session=cookiesecret' },
    });
    const text = JSON.stringify(spans, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value));
    for (const secret of ['row-9731', 'querysecret', 'Bearer', 'headersecret', 'session', 'cookiesecret'])
      expect(text).not.toContain(secret);
  });

  it('OBS-02 without a traceparent the span starts a trace, and the log lines of the request carry its ids', async () => {
    const { server, spans, logger } = observed();
    server.route(okRoute('/api/v1/t/ctx', { handler: () => ({ ok: requestContext.get()?.spanId !== undefined }) }));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/ctx' });
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    const [span] = spans;
    expect(span?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span).not.toHaveProperty('parentSpanId');
    expect(logger.lines.some((line) => line.message === 'request completed')).toBe(true);
  });

  it('OBS-02 the code of the handler runs inside the span, so a span that it starts is its child', async () => {
    const exporter = createMemorySpanExporter();
    const tracer = createTracer({ exporter });
    const { server } = testServer({ tracer });
    server.route(
      okRoute('/api/v1/t/child', {
        handler: () => tracer.span('inner work', {}, () => ({ ok: true })),
      }),
    );
    await server.inject({ method: 'GET', url: '/api/v1/t/child' });
    const inner = exporter.spans.find((span) => span.name === 'inner work');
    const request = exporter.spans.find((span) => span.kind === 'server');
    expect(inner?.parentSpanId).toBe(request?.spanId);
    expect(inner?.traceId).toBe(request?.traceId);
  });

  it('OBS-02 a 5xx answer fails the span, and a 4xx does not', async () => {
    const { server, spans } = observed();
    server.route(
      okRoute('/api/v1/t/boom', {
        handler: () => {
          throw new Error('bug with a secret 12345');
        },
      }),
    );
    await server.inject({ method: 'GET', url: '/api/v1/t/boom' });
    await server.inject({ method: 'GET', url: '/nothing' });
    expect(spans.map((span) => [span.name, span.failed, span.attributes['http.status_code']])).toEqual([
      ['GET /api/v1/t/boom', true, 500],
      ['GET unmatched', false, 404],
    ]);
    expect(
      JSON.stringify(spans, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value)),
    ).not.toContain('12345');
  });

  it('OBS-02 the probes of the server are not traced, and not counted', async () => {
    const { server, spans, metrics } = observed();
    await server.inject({ method: 'GET', url: '/health/live' });
    await server.inject({ method: 'GET', url: '/health/ready' });
    expect(spans).toHaveLength(0);
    expect(await metrics.render()).toBe('');
  });
});

describe('OBS-03 the duration of a request', () => {
  it('OBS-03 is a histogram by method, route and status', async () => {
    const { server, metrics } = observed();
    server.route(okRoute('/api/v1/deals/:id'));
    await server.inject({ method: 'GET', url: '/api/v1/deals/1' });
    await server.inject({ method: 'GET', url: '/api/v1/deals/2' });
    const text = await metrics.render();
    expect(text).toContain('# TYPE bk_http_request_duration_seconds histogram');
    expect(text).toContain(
      'bk_http_request_duration_seconds_count{method="GET",route="/api/v1/deals/:id",status="200"} 2',
    );
  });

  it('OBS-03 a path that no route has is one series, so that a scan cannot make a million', async () => {
    const { server, metrics } = observed();
    for (const path of ['/a', '/b', '/c/d/e']) await server.inject({ method: 'GET', url: path });
    const text = await metrics.render();
    expect(text).toContain('route="unmatched",status="404"} 3');
    expect(text).not.toContain('/c/d/e');
  });
});

describe('OBS-02 no tracer', () => {
  it('OBS-02 a server without a tracer keeps the trace of the caller in the context, as before', async () => {
    const { server } = testServer();
    let seen: unknown;
    server.route(
      okRoute('/api/v1/t/ctx', {
        handler: () => {
          seen = requestContext.get();
          return { ok: true };
        },
      }),
    );
    await server.inject({ method: 'GET', url: '/api/v1/t/ctx', headers: { traceparent: `00-${TRACE}-${SPAN}-01` } });
    expect(seen).toMatchObject({ traceId: TRACE, spanId: SPAN });
  });
});
