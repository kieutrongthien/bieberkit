/**
 * BieberKit
 *
 * @file        packages/http/src/authorization.ts
 * @description The three questions that a route asks of the authorizer for a principal (can, allows, access), the same for a request and for a queued job that runs as that principal (Q-10).
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

import type { AccessAnswer, Authorizer, Principal, RequestInfo } from './ports.ts';

export interface Authorization {
  /** Whether the principal has `permission`. */
  can(permission: string): Promise<boolean>;
  /** Whether the principal may use `action` on this row in memory (AUTHZ-02). Allowed when nothing limits it. */
  allows(entity: string, action: string, row: Readonly<Record<string, unknown>>): Promise<boolean>;
  /** The rows and the fields that the principal may use for `action` on `entity`. */
  access(entity: string, action: string): Promise<AccessAnswer>;
}

/**
 * What a handler asks of the authorizer. With no authorizer everything is allowed. With one, a caller with no principal is denied. It is the
 * one place for these rules: a request uses it, and so does a job that runs as the principal that queued it, so the checks are the same
 * in both (Q-10).
 */
export function authorizationFor(
  authorizer: Authorizer | undefined,
  principal: Principal | undefined,
  info: RequestInfo,
): Authorization {
  return {
    can: async (permission) => principal !== undefined && (await authorizer?.can(principal, permission, info)) === true,
    allows: async (entity, action, row) => {
      if (authorizer === undefined) return true;
      if (principal === undefined) return false;
      return (await authorizer.allows?.(principal, entity, action, row, info)) ?? true;
    },
    access: async (entity, action) => {
      if (authorizer === undefined) return { allowed: true };
      if (principal === undefined) return { allowed: false, reason: 'no-permission' };
      return (await authorizer.access?.(principal, entity, action, info)) ?? { allowed: true };
    },
  };
}
