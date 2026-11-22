/**
 * BieberKit
 *
 * @file        packages/http/src/route.ts
 * @description Route definitions and the rules that a route must meet before the server accepts it (API-01, API-02).
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

import type { Logger } from '@bieberkit/core';
import type { JsonSchema } from '@bieberkit/data/schema';
import type { AccessAnswer, Principal } from './ports.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const METHODS: readonly Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface RouteSchema {
  readonly params?: JsonSchema;
  readonly query?: JsonSchema;
  readonly body?: JsonSchema;
  /** One schema for each status that the handler may answer with. At least one must be 2xx (API-01). */
  readonly response: Readonly<Record<number, JsonSchema>>;
}

/** What a handler receives. */
export interface RouteContext {
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  /** The headers of the request. */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly principal: Principal | undefined;
  readonly tenantId: string | undefined;
  readonly requestId: string;
  readonly traceId: string;
  readonly log: Logger;
  /** Sets the status of the answer. It must be one that `schema.response` has a schema for. Defaults to 200. */
  status(code: number): void;
  /** Sets a header of the answer. */
  header(name: string, value: string): void;
  /** Whether the caller has `permission`, for a check that depends on the request, such as the operation of a bulk call. */
  can(permission: string): Promise<boolean>;
  /**
   * The rows and the fields that the caller may use for `action` on `entity` (AUTHZ-02). Without an authorizer, or with one that
   * has no `access`, it is allowed with no scope and every field. A caller with no principal is denied when there is an authorizer.
   */
  access(entity: string, action: string): Promise<AccessAnswer>;
  /** Whether the caller may use `action` on this row in memory: for a create, and for the new state of an update (AUTHZ-02). Allowed when nothing limits it. */
  allows(entity: string, action: string, row: Readonly<Record<string, unknown>>): Promise<boolean>;
}

export interface RouteDef {
  readonly method: Method;
  readonly url: string;
  /** The permission that a caller needs (API-02). Exactly one of `permission` and `public`. */
  readonly permission?: string;
  readonly public?: true;
  readonly schema: RouteSchema;
  /** The route needs `If-Match` (API-13). The handler checks it. This tells the document of the API. */
  readonly requiresIfMatch?: true;
  /** A POST route that honors `Idempotency-Key` (spec 13.1). */
  readonly idempotent?: true;
  /** Marks the route as deprecated, with the dates that clients are told (API-16). Dates are `YYYY-MM-DD`. */
  readonly deprecated?: { readonly since?: string; readonly sunset?: string; readonly link?: string };
  /** For a public GET: how long a shared cache keeps the answer, and the tags that purge it (API-09). */
  readonly cache?: {
    readonly sMaxAge: number;
    readonly staleWhileRevalidate?: number;
    readonly tags?: readonly string[];
  };
  /** Returns the body of the answer, or a promise of it. */
  handler(ctx: RouteContext): unknown;
}

/** Declares a route. It returns the route unchanged, so the compiler checks its shape where it is written. */
export function defineRoute(route: RouteDef): RouteDef {
  return route;
}
