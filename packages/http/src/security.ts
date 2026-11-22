/**
 * BieberKit
 *
 * @file        packages/http/src/security.ts
 * @description The security headers and the CORS rules of the server: what to send, and which origins and methods are allowed (SEC-01, SEC-02).
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

import { HttpError } from './problem.ts';

export interface CorsOptions {
  /** Origins that may call the API from a browser: scheme, host and port only. No wildcard and no `null`. */
  readonly origins: readonly string[];
  /** Whether a browser may send the cookies. Defaults to true. */
  readonly credentials?: boolean;
  /** Seconds that a browser keeps the answer of a preflight. Defaults to 600. */
  readonly maxAgeSeconds?: number;
}

export interface SecurityConfig {
  readonly origins: ReadonlySet<string>;
  readonly credentials: boolean;
  readonly maxAgeSeconds: number;
  readonly overrides: Readonly<Record<string, string | false>>;
  readonly cors: boolean;
}

/** The headers of a JSON API, which renders nothing (SEC-01). */
const DEFAULTS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

export const HSTS = 'max-age=31536000; includeSubDomains';
export const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const CORS_HEADERS: readonly string[] = [
  'content-type',
  'if-match',
  'if-none-match',
  'idempotency-key',
  'x-request-id',
  'traceparent',
  'x-csrf-token',
  'authorization',
];
export const CORS_EXPOSED: readonly string[] = [
  'x-request-id',
  'etag',
  'location',
  'retry-after',
  'idempotency-replayed',
];

function invalid(message: string): never {
  throw new HttpError('HTTP_CONFIG_INVALID', 500, message, 'See the options of the server in docs/modules/http.md.');
}

/** Checks the options of headers and CORS when the server is made, so a wrong list is found at boot (SEC-02). */
export function securityConfig(
  headers: Readonly<Record<string, string | false>> | undefined,
  cors: CorsOptions | undefined,
): SecurityConfig {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value !== false && /[\r\n]/.test(value)) invalid(`The value of the header ${name} has a line break.`);
  }
  const origins = new Set<string>();
  for (const origin of cors?.origins ?? []) {
    let parsed: URL | undefined;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = undefined;
    }
    if (
      parsed === undefined ||
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.origin !== origin ||
      origin.includes('*')
    ) {
      invalid(`"${origin}" is not an origin for CORS. Write scheme, host and port only, with no wildcard.`);
    }
    origins.add(origin);
  }
  return {
    origins,
    credentials: cors?.credentials ?? true,
    maxAgeSeconds: cors?.maxAgeSeconds ?? 600,
    overrides: Object.fromEntries(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])),
    cors: cors !== undefined,
  };
}

/** The security headers to add to an answer, as names and values. `secure` is true in production and on an https request. */
export function securityHeaders(config: SecurityConfig, secure: boolean): [string, string][] {
  const merged: Record<string, string | false> = {
    ...DEFAULTS,
    ...(secure ? { 'strict-transport-security': HSTS } : {}),
    ...config.overrides,
  };
  return Object.entries(merged).flatMap(([name, value]) =>
    value === false ? [] : [[name, value] as [string, string]],
  );
}
