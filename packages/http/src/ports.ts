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
  /** How the caller proved who it is. `cookie` is what a browser attaches by itself, so a state change needs the CSRF check (SEC-03). Unset counts as `cookie`. */
  readonly via?: 'cookie' | 'token';
  /** The id of the session, which the CSRF token is bound to. */
  readonly sessionId?: string;
  /** Whether the user proved a second factor (AUTH-05). A role that asks for it refuses a principal that has not. */
  readonly mfa?: boolean;
  /** When `security.mfa.required-for-all` is on and the user has no second factor yet: the ISO time by which they must enrol (POL-02). */
  readonly mfaEnrolBy?: string;
  /** `security.mfa.required-for-all` is on, so a second factor is asked of this person, with one or without (POL-02, USR-12). */
  readonly mfaForAll?: true;
  /** For a machine client: the permissions of its key. They replace the roles of a user, which a key has not (AUTH-07). */
  readonly grants?: readonly string[];
  /** For a machine client: the tenant of its key. It is the tenant of the request, and `X-Tenant` may not differ (DATA-19). */
  readonly tenantId?: string;
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

/**
 * What a caller may do with an entity (AUTHZ-02, AUTHZ-03): whether it may at all, which rows (`scope`, in the properties of the
 * entity, in the small condition language of ADR 0013) and which fields. `readable` and `writable` are field names, and
 * `undefined` means every field. `reason` says why `allowed` is false.
 */
export interface AccessAnswer {
  readonly allowed: boolean;
  readonly reason?: 'no-permission' | 'unsupported-condition';
  readonly scope?: Readonly<Record<string, unknown>>;
  readonly readable?: ReadonlySet<string>;
  readonly writable?: ReadonlySet<string>;
}

/** Stage 8. Whether the principal has the permission that the route names. */
export interface Authorizer {
  can(principal: Principal, permission: string, request: RequestInfo): Promise<boolean>;
  /**
   * The rows and the fields that the principal may use for `action` (`read`, `create`, `update`, `delete`, `transition:<name>`)
   * on the entity that is named `entity`. Without it a route is decided by its permission alone.
   */
  access?(principal: Principal, entity: string, action: string, request: RequestInfo): Promise<AccessAnswer>;
  /**
   * Whether the principal may use `action` on a row that is not stored yet: the data of a create, or the new state of an update. The
   * row is in the properties of the entity. Without it, only `access` limits what a caller writes.
   */
  allows?(
    principal: Principal,
    entity: string,
    action: string,
    row: Readonly<Record<string, unknown>>,
    request: RequestInfo,
  ): Promise<boolean>;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

/** Stages 2 and 4. `key` is the address of the client or the id of the principal. */
export interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}
