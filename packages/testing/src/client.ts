/**
 * BieberKit
 *
 * @file        packages/testing/src/client.ts
 * @description The caller of a test app: requests as one user in one tenant, and the answers in a plain shape (TST-02).
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

import type { HttpServer } from '@bieberkit/http';

/** The answer to a request of a test. */
export interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | number | undefined>>;
  /** The JSON body, or an empty object when there is none. */
  readonly body: Readonly<Record<string, unknown>>;
}

/** A caller: one user, in one tenant, with the headers that the test app reads to know both. */
export interface Client {
  get(url: string, headers?: Record<string, string>): Promise<Reply>;
  post(url: string, payload?: object, headers?: Record<string, string>): Promise<Reply>;
  /** `version` is the version that the caller read, sent as `If-Match` (API-13). */
  /** Replaces the resource at `url`, as a settings value is written (SET-02). */
  put(url: string, payload: object, headers?: Record<string, string>): Promise<Reply>;
  patch(url: string, payload: object, version: number, headers?: Record<string, string>): Promise<Reply>;
  delete(url: string, version: number, headers?: Record<string, string>): Promise<Reply>;
}

/** The headers that tell the test authenticator and the test tenant resolver who is calling. */
export const USER_HEADER = 'x-test-user';
export const TENANT_HEADER = 'x-test-tenant';

function bodyOf(text: string): Record<string, unknown> {
  if (text === '') return {};
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
}

/** A client of `server` that calls as `userId` in `tenant`. Without a user the request has no principal. */
export function createClient(server: HttpServer, userId: string | undefined, tenant: () => string): Client {
  const send = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload: object | undefined,
    headers: Record<string, string>,
  ): Promise<Reply> => {
    const response = await server.inject({
      method,
      url,
      headers: { ...(userId === undefined ? {} : { [USER_HEADER]: userId }), [TENANT_HEADER]: tenant(), ...headers },
      ...(payload === undefined ? {} : { payload }),
    });
    return { status: response.statusCode, headers: response.headers, body: bodyOf(response.body) };
  };
  return {
    get: (url, headers = {}) => send('GET', url, undefined, headers),
    post: (url, payload, headers = {}) => send('POST', url, payload ?? {}, headers),
    put: (url, payload, headers = {}) => send('PUT', url, payload, headers),
    patch: (url, payload, version, headers = {}) =>
      send('PATCH', url, payload, { 'if-match': String(version), ...headers }),
    delete: (url, version, headers = {}) => send('DELETE', url, undefined, { 'if-match': String(version), ...headers }),
  };
}
