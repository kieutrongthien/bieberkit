/**
 * BieberKit
 *
 * @file        packages/core/src/observability/otlp.test.ts
 * @description Tests of the OTLP exporter: the shape of the request, batching, a collector that is down or slow, and the tracer made from the config (OBS-02, ADR 0023).
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

import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../logging/logger.ts';
import { createOtlpExporter, createTracerFromConfig, otlpTraceBody } from './otlp.ts';
import type { FinishedSpan } from './tracing.ts';

const span = (overrides: Partial<FinishedSpan> = {}): FinishedSpan => ({
  traceId: 'a'.repeat(32),
  spanId: 'b'.repeat(16),
  name: 'GET /deals',
  kind: 'server',
  startNs: 1_700_000_000_000_000_000n,
  endNs: 1_700_000_000_005_000_000n,
  attributes: { 'http.route': '/deals', 'http.status_code': 200, 'cache.hit': true, ratio: 0.5 },
  failed: false,
  ...overrides,
});

interface Call {
  url: string;
  body: unknown;
}

function fakeFetch(answer: () => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    const text = typeof init?.body === 'string' ? init.body : 'null';
    calls.push({ url, body: JSON.parse(text) });
    return answer();
  };
  return { fetch: fake, calls };
}

const unreachable = async (): Promise<Response> => {
  throw new TypeError('fetch failed');
};

describe('OBS-02 OTLP body', () => {
  it('OBS-02 is the OTLP JSON of a trace: hex ids, string nanoseconds, numeric kind and typed attributes', () => {
    const body = otlpTraceBody([span({ parentSpanId: 'c'.repeat(16), failed: true })], { 'service.name': 'bieberkit' });
    expect(body).toEqual({
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'bieberkit' } }] },
          scopeSpans: [
            {
              scope: { name: '@bieberkit/core' },
              spans: [
                {
                  traceId: 'a'.repeat(32),
                  spanId: 'b'.repeat(16),
                  parentSpanId: 'c'.repeat(16),
                  name: 'GET /deals',
                  kind: 2,
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000000005000000',
                  attributes: [
                    { key: 'http.route', value: { stringValue: '/deals' } },
                    { key: 'http.status_code', value: { intValue: '200' } },
                    { key: 'cache.hit', value: { boolValue: true } },
                    { key: 'ratio', value: { doubleValue: 0.5 } },
                  ],
                  status: { code: 2 },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('OBS-02 a span with no parent has no parentSpanId, and a good span has an unset status', () => {
    const body = JSON.stringify(otlpTraceBody([span()], {}));
    expect(body).not.toContain('parentSpanId');
    expect(body).toContain('"status":{"code":0}');
  });
});

describe('OBS-02 OTLP exporter', () => {
  it('OBS-02 sends what flush finds to the traces path of the endpoint', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}', { status: 200 }));
    const exporter = createOtlpExporter({
      endpoint: 'http://collector:4318/',
      resource: {},
      fetch,
      intervalMs: 60_000,
    });
    exporter.export(span());
    exporter.export(span({ name: 'second' }));
    await expect(exporter.flush()).resolves.toBe(true);
    expect(calls.map((call) => call.url)).toEqual(['http://collector:4318/v1/traces']);
    expect(JSON.stringify(calls[0]?.body)).toContain('second');
  });

  it('OBS-02 keeps a path that already ends with /v1/traces, and adds it to another path', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    for (const endpoint of ['http://c/otel/v1/traces', 'http://c/otel']) {
      const exporter = createOtlpExporter({ endpoint, resource: {}, fetch, intervalMs: 60_000 });
      exporter.export(span());
      await exporter.flush();
    }
    expect(calls.map((call) => call.url)).toEqual(['http://c/otel/v1/traces', 'http://c/otel/v1/traces']);
  });

  it('OBS-02 sends a full batch at once, without waiting for the interval', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    const exporter = createOtlpExporter({
      endpoint: 'http://c',
      resource: {},
      fetch,
      batchSize: 3,
      intervalMs: 60_000,
    });
    for (let i = 0; i < 3; i += 1) exporter.export(span());
    await exporter.flush();
    expect(calls).toHaveLength(1);
  });

  it('OBS-02 a collector that is down is never an error of the caller: the batch is dropped, counted and logged once', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', role: 'web', write: (line) => lines.push(line) });
    const exporter = createOtlpExporter({
      endpoint: 'http://down',
      resource: {},
      fetch: unreachable,
      logger,
      intervalMs: 60_000,
    });
    exporter.export(span());
    await expect(exporter.flush()).resolves.toBe(false);
    exporter.export(span());
    await expect(exporter.flush()).resolves.toBe(false);
    expect(exporter.dropped()).toBe(2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('traces were not sent');
  });

  it('OBS-02 an answer that is not 2xx is a failed batch', async () => {
    const { fetch } = fakeFetch(() => new Response('no', { status: 503 }));
    const exporter = createOtlpExporter({ endpoint: 'http://c', resource: {}, fetch, intervalMs: 60_000 });
    exporter.export(span());
    await expect(exporter.flush()).resolves.toBe(false);
    expect(exporter.dropped()).toBe(1);
  });

  it('OBS-02 holds at most maxQueue spans and drops the oldest', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    const exporter = createOtlpExporter({
      endpoint: 'http://c',
      resource: {},
      fetch,
      maxQueue: 2,
      batchSize: 10,
      intervalMs: 60_000,
    });
    for (const name of ['one', 'two', 'three']) exporter.export(span({ name }));
    await exporter.flush();
    const sent = JSON.stringify(calls[0]?.body);
    expect(sent).not.toContain('"one"');
    expect(sent).toContain('"three"');
    expect(exporter.dropped()).toBe(1);
  });

  it('OBS-02 flush stops waiting for a collector that does not answer', async () => {
    const { fetch } = fakeFetch(() => new Promise<Response>(() => undefined));
    const exporter = createOtlpExporter({ endpoint: 'http://c', resource: {}, fetch, intervalMs: 60_000 });
    exporter.export(span());
    const started = Date.now();
    await expect(exporter.flush(50)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('OBS-02 posts to a real server, with the content type of OTLP', async () => {
    const received: { path: string; type: string; body: string }[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        received.push({ path: request.url ?? '', type: String(request.headers['content-type']), body });
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      const port = address !== null && typeof address === 'object' ? address.port : 0;
      const exporter = createOtlpExporter({ endpoint: `http://127.0.0.1:${port}`, resource: { 'service.name': 's' } });
      exporter.export(span());
      await expect(exporter.flush()).resolves.toBe(true);
      expect(received[0]).toMatchObject({ path: '/v1/traces', type: 'application/json' });
      expect(JSON.parse(received[0]?.body ?? '')).toHaveProperty('resourceSpans');
    } finally {
      server.close();
    }
  });
});

describe('OBS-02 tracer from the config', () => {
  const logger = createLogger({ level: 'info', role: 'web', write: () => undefined });

  it('OBS-02 tracing is off when the endpoint is empty', () => {
    const tracer = createTracerFromConfig(
      { APP_ENV: 'production', OTEL_EXPORTER_OTLP_ENDPOINT: undefined },
      { logger, role: 'web' },
    );
    expect(tracer.enabled).toBe(false);
  });

  it('OBS-02 with an endpoint the spans go there, with the service, the environment and the role', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}'));
    const tracer = createTracerFromConfig(
      { APP_ENV: 'staging', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318' },
      { logger, role: 'worker', release: 'abc123', fetch },
    );
    expect(tracer.enabled).toBe(true);
    await tracer.span('job', { kind: 'consumer' }, () => undefined);
    await tracer.flush();
    const text = JSON.stringify(calls[0]?.body);
    for (const part of ['"bieberkit"', '"staging"', '"worker"', '"abc123"', '"job"']) expect(text).toContain(part);
  });
});
