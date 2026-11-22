/**
 * BieberKit
 *
 * @file        packages/http/src/testing.ts
 * @description Helpers of the tests of the HTTP server: a logger that remembers its lines, the test environment and a route that works (M1.3).
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

import type { LogFields, Logger } from '@bieberkit/core';
import { createHttpServer } from './server.ts';
import type { HttpEnv, HttpServer, HttpServerOptions } from './server.ts';
import type { RouteDef } from './route.ts';

export interface LoggedLine {
  readonly level: string;
  readonly message: string;
  readonly fields: LogFields;
}

export interface MemoryLogger extends Logger {
  readonly lines: LoggedLine[];
}

/** A logger that keeps what it is given. A child shares the lines of its parent, with its bindings added. */
export function memoryLogger(bindings: LogFields = {}, lines: LoggedLine[] = []): MemoryLogger {
  const write =
    (level: string) =>
    (message: string, fields: LogFields = {}): void => {
      lines.push({ level, message, fields: { ...bindings, ...fields } });
    };
  return {
    lines,
    level: 'trace',
    fatal: write('fatal'),
    error: write('error'),
    warn: write('warn'),
    info: write('info'),
    debug: write('debug'),
    trace: write('trace'),
    child: (extra) => memoryLogger({ ...bindings, ...extra }, lines),
  };
}

export const TEST_ENV: HttpEnv = { APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false };

export function testServer(
  options: HttpServerOptions = {},
  env: HttpEnv = TEST_ENV,
): { server: HttpServer; logger: MemoryLogger } {
  const logger = memoryLogger();
  return { server: createHttpServer(env, { logger, ...options }), logger };
}

/** A public GET route that answers `{ ok: true }`, for tests that need a route and nothing else. */
export function okRoute(url = '/api/v1/test/ok', extra: Partial<RouteDef> = {}): RouteDef {
  return {
    method: 'GET',
    url,
    public: true,
    schema: { response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } },
    handler: () => ({ ok: true }),
    ...extra,
  };
}

export const TENANT = '0190f6b2-7c4e-7000-8000-0000000000a1';
export const OTHER_TENANT = '0190f6b2-7c4e-7000-8000-0000000000a2';
