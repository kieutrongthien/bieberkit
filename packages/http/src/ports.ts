/**
 * BieberKit
 *
 * @file        packages/http/src/ports.ts
 * @description The ports of the HTTP server: what the pipeline asks of authentication, tenants, authorization and rate limits (spec 13.4).
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

/** Who is calling. `@bieberkit/auth` makes it from a session or an API key. */
export interface Principal {
  readonly id: string;
  readonly kind: 'user' | 'apiKey' | 'service';
}

/** What a port may know about the request. The body is not read yet when most ports run. */
export interface RequestInfo {
  readonly method: string;
  /** The path without the query string. */
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** The address of the client, after `TRUST_PROXY` (stage 2). */
  readonly ip: string;
}

/** Stage 3. No principal is `undefined`, and it is an error only for a route that needs a permission. */
export interface Authenticator {
  authenticate(request: RequestInfo): Promise<Principal | undefined>;
}

/** Stage 5 (DATA-19). The tenant of the request, or `undefined` for a request that has none. */
export interface TenantResolver {
  resolve(request: RequestInfo, principal: Principal | undefined): Promise<string | undefined>;
}

/** Stage 8. Whether the principal has the permission that the route names. Conditions on the record come later, in the service. */
export interface Authorizer {
  can(principal: Principal, permission: string, request: RequestInfo): Promise<boolean>;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

/** Stages 2 and 4. `key` is the address of the client or the id of the principal. */
export interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}
