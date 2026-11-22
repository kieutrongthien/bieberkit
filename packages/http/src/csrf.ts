/**
 * BieberKit
 *
 * @file        packages/http/src/csrf.ts
 * @description The CSRF token: signed with HMAC and bound to the session, and the route that gives it to a signed in browser (SEC-03).
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

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './problem.ts';
import type { HttpServer } from './server.ts';

export interface CsrfProtection {
  /** A new token for a session. Each call gives another one, and all of them are valid. */
  issue(sessionId: string): string;
  verify(token: string, sessionId: string): boolean;
}

const mac = (secret: string, sessionId: string, nonce: string): Buffer =>
  createHmac('sha256', secret).update(`csrf:${sessionId}:${nonce}`).digest();

/** A token is a random value and its HMAC for one session, so it works for that session and nowhere else. The secret has 32 characters or more. */
export function createCsrf(secret: string): CsrfProtection {
  if (secret.length < 32) {
    throw new HttpError(
      'HTTP_CONFIG_INVALID',
      500,
      'The CSRF secret has fewer than 32 characters.',
      'Derive it from APP_KEY.',
    );
  }
  return {
    issue(sessionId) {
      const nonce = randomBytes(16).toString('base64url');
      return `${nonce}.${mac(secret, sessionId, nonce).toString('base64url')}`;
    },
    verify(token, sessionId) {
      const parts = token.split('.');
      const [nonce, given] = parts;
      if (parts.length !== 2 || nonce === undefined || given === undefined || !/^[A-Za-z0-9_-]+$/.test(nonce + given))
        return false;
      const expected = mac(secret, sessionId, nonce);
      const actual = Buffer.from(given, 'base64url');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}

/** `GET /api/v1/csrf`: the token of the session of the caller, for the header `X-CSRF-Token`. It is never cached. */
export function registerCsrfToken(server: HttpServer): void {
  server.route({
    method: 'GET',
    url: '/api/v1/csrf',
    public: true,
    schema: { response: { 200: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] } } },
    handler: (ctx) => {
      const sessionId = ctx.principal?.sessionId;
      if (sessionId === undefined || server.csrf === undefined) {
        throw new HttpError('HTTP_UNAUTHENTICATED', 401, 'Sign in to do this.', 'A session is needed to get a token.');
      }
      ctx.header('cache-control', 'no-store');
      return { token: server.csrf.issue(sessionId) };
    },
  });
}
