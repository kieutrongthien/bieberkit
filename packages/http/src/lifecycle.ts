/**
 * BieberKit
 *
 * @file        packages/http/src/lifecycle.ts
 * @description Connects the HTTP server to the lifecycle of the kernel: listen at boot, stop at shutdown (spec 7.2, 19.4).
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

import { BkError } from '@bieberkit/core';
import type { Lifecycle } from '@bieberkit/core';
import type { HttpServer } from './server.ts';

export interface RegisterHttpOptions {
  readonly host?: string;
  readonly port?: number;
  /** Spec 19.4: how long `/health/ready` says 503 before the server stops accepting connections. Defaults to 5 s. */
  readonly drainMs?: number;
  /** Spec 19.4: how long a request in progress may take at shutdown. Defaults to 20 s. */
  readonly timeoutMs?: number;
}

/**
 * Puts the server in the lifecycle. At boot it listens and then reports ready. At shutdown it drains and stops, and a timeout is a
 * failure of the hook, so that `exitCode` turns it into 1.
 */
export function registerHttp(lifecycle: Lifecycle, server: HttpServer, options: RegisterHttpOptions = {}): void {
  lifecycle.onBoot('http', async () => {
    await server.listen({
      ...(options.host === undefined ? {} : { host: options.host }),
      ...(options.port === undefined ? {} : { port: options.port }),
    });
    server.markReady();
  });
  lifecycle.onShutdown('http', async () => {
    const result = await server.stop({
      ...(options.drainMs === undefined ? {} : { drainMs: options.drainMs }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    if (result.timedOut) {
      throw new BkError('Requests were still running when the shutdown timeout passed.', {
        code: 'HTTP_SHUTDOWN_TIMEOUT',
        fix: 'Raise the timeout, or find the request that does not finish.',
      });
    }
  });
}
