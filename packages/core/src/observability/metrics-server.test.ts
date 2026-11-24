/**
 * BieberKit
 *
 * @file        packages/core/src/observability/metrics-server.test.ts
 * @description Tests of the metrics server and the process metrics: GET /metrics only, no answer through a proxy, a port that is taken, and the shape of the process figures (OBS-03, OBS-04, ADR 0023).
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
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createMetrics } from './metrics.ts';
import { startMetricsServer } from './metrics-server.ts';
import type { MetricsServer } from './metrics-server.ts';
import { registerProcessMetrics } from './process-metrics.ts';

interface Answer {
  status: number;
  type: string;
  body: string;
}

function ask(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const call = request(
      { host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers },
      (response) => {
        let body = '';
        response.on('data', (chunk: Buffer) => (body += chunk.toString()));
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, type: String(response.headers['content-type']), body }),
        );
      },
    );
    call.on('error', reject);
    call.end();
  });
}

const open: MetricsServer[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()));
});

async function start(): Promise<{ server: MetricsServer; metrics: ReturnType<typeof createMetrics> }> {
  const metrics = createMetrics();
  metrics.counter('bk_hits_total', 'Hits.').inc(undefined, 4);
  const server = await startMetricsServer({ metrics, port: 0, host: '127.0.0.1' });
  open.push(server);
  return { server, metrics };
}

describe('OBS-04 metrics server', () => {
  it('OBS-03 serves the text format on /metrics, with the content type of Prometheus', async () => {
    const { server } = await start();
    const answer = await ask(server.port, '/metrics');
    expect(answer.status).toBe(200);
    expect(answer.type).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(answer.body).toContain('bk_hits_total 4');
  });

  it('OBS-03 ignores a query string, and answers HEAD without a body', async () => {
    const { server } = await start();
    expect((await ask(server.port, '/metrics?x=1')).status).toBe(200);
    const head = await ask(server.port, '/metrics', { method: 'HEAD' });
    expect(head).toMatchObject({ status: 200, body: '' });
  });

  it('OBS-04 serves nothing else: other paths are 404 and other methods are 405', async () => {
    const { server } = await start();
    for (const path of ['/', '/health', '/metrics/', '/api/v1/deals'])
      expect((await ask(server.port, path)).status).toBe(404);
    for (const method of ['POST', 'PUT', 'DELETE'])
      expect((await ask(server.port, '/metrics', { method })).status).toBe(405);
  });

  it('OBS-04 refuses a request that came through a proxy, whatever header says so', async () => {
    const { server } = await start();
    for (const header of ['x-forwarded-for', 'X-Forwarded-Host', 'forwarded', 'x-real-ip', 'via']) {
      const answer = await ask(server.port, '/metrics', { headers: { [header]: 'x' } });
      expect({ header, status: answer.status }).toEqual({ header, status: 403 });
      expect(answer.body).not.toContain('bk_hits_total');
    }
  });

  it('OBS-03 the figures are those of the moment of the scrape', async () => {
    const { server, metrics } = await start();
    metrics.counter('bk_hits_total', 'Hits.').inc();
    expect((await ask(server.port, '/metrics')).body).toContain('bk_hits_total 5');
  });

  it('OBS-04 a port that is taken is an error with a code and a fix, not a crash', async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
    const address = taken.address();
    const port = address !== null && typeof address === 'object' ? address.port : 0;
    try {
      await expect(startMetricsServer({ metrics: createMetrics(), port, host: '127.0.0.1' })).rejects.toMatchObject({
        code: 'OBS_METRICS_PORT_UNAVAILABLE',
      });
    } finally {
      taken.close();
    }
  });
});

describe('OBS-03 process metrics', () => {
  it('OBS-03 has the lag of the event loop, the heap, the resident size and the uptime', async () => {
    const metrics = createMetrics();
    const stop = registerProcessMetrics(metrics);
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const text = await metrics.render();
      for (const name of [
        'bk_event_loop_lag_seconds{stat="mean"}',
        'bk_event_loop_lag_seconds{stat="p99"}',
        'bk_event_loop_lag_seconds{stat="max"}',
      ]) {
        expect(text).toContain(name);
      }
      const heap = /^bk_heap_used_bytes (\d+)$/m.exec(text);
      expect(Number(heap?.[1])).toBeGreaterThan(0);
      for (const name of ['bk_heap_total_bytes', 'bk_process_resident_bytes', 'bk_process_uptime_seconds'])
        expect(text).toContain(`# TYPE ${name} gauge`);
    } finally {
      stop();
    }
  });
});
