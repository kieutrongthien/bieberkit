/**
 * BieberKit
 *
 * @file        packages/core/src/observability/metrics-server.ts
 * @description The server of the metrics on its own port: GET /metrics and nothing else, and no answer to a request that came through a proxy (OBS-03, OBS-04, ADR 0023).
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
import type { IncomingMessage } from 'node:http';
import { BkError } from '../errors/errors.ts';
import type { Logger } from '../logging/logger.ts';
import type { Metrics } from './metrics.ts';

export interface MetricsServerOptions {
  readonly metrics: Metrics;
  /** `METRICS_PORT`. 0 takes a free port, for tests. */
  readonly port: number;
  /** Defaults to every interface, because a scraper in the network of the containers must reach it. The port is never published (OBS-04). */
  readonly host?: string;
  readonly logger?: Logger;
}

export interface MetricsServer {
  readonly port: number;
  close(): Promise<void>;
}

const FORWARDED = /^(forwarded|x-forwarded-.+|x-real-ip|via)$/i;

/** A request that a proxy has touched has one of these headers. A scraper that reaches the port directly has none. */
const viaProxy = (request: IncomingMessage): boolean =>
  Object.keys(request.headers).some((name) => FORWARDED.test(name));

/** Serves `GET /metrics`. Rejects with `OBS_METRICS_PORT_UNAVAILABLE` when the port cannot be bound, and the caller decides what that costs. */
export async function startMetricsServer(options: MetricsServerOptions): Promise<MetricsServer> {
  const server = createServer((request, response) => {
    const refuse = (status: number, text: string): void => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' }).end(text);
    };
    // The path is read without its query string.
    const path = (request.url ?? '').split('?')[0];
    if (viaProxy(request)) {
      options.logger?.warn('a request for the metrics came through a proxy', { path });
      refuse(403, 'The metrics are not served through a proxy.\n');
      return;
    }
    if (path !== '/metrics') return refuse(404, 'Not found.\n');
    if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405, 'Method not allowed.\n');
    void (async (): Promise<void> => {
      try {
        const text = await options.metrics.render();
        response
          .writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' })
          .end(request.method === 'HEAD' ? undefined : text);
      } catch {
        refuse(500, 'The metrics could not be read.\n');
      }
    })();
  });
  // A scraper that never finishes its request must not hold a socket for ever.
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error) => {
      reject(
        new BkError(`The metrics port ${options.port} cannot be used: ${error.message}.`, {
          code: 'OBS_METRICS_PORT_UNAVAILABLE',
          status: 500,
          fix: 'Set METRICS_PORT to a free port. Each process of one host needs its own.',
        }),
      );
    });
    server.listen(options.port, options.host ?? '0.0.0.0', resolve);
  });
  const address = server.address();
  const port = address !== null && typeof address === 'object' ? address.port : options.port;
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
