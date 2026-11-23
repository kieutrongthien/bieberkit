/**
 * BieberKit
 *
 * @file        packages/auth/src/tenant.ts
 * @description The tenant resolver of the HTTP server: X-Tenant, checked against the roles of the user, and from nothing else (DATA-19).
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

import { isUuid } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';
import type { TenantResolver } from '@bieberkit/http';
import { AuthUserRole } from './roles.ts';

export interface TenantResolverOptions {
  readonly db: Database;
}

/**
 * The tenant of a request is the one that `X-Tenant` names, if the user has a role in it. It never comes from the session, so two
 * tabs on two tenants cannot mix (DATA-19). Nothing proves the membership of a request with no principal, so it has no tenant.
 * Nothing is cached: a change of the roles shows in the next request.
 */
export function createTenantResolver(options: TenantResolverOptions): TenantResolver {
  return {
    async resolve(request, principal) {
      const header = request.headers['x-tenant'];
      const wanted = Array.isArray(header) ? header[0] : header;
      if (principal?.kind === 'apiKey') {
        // The tenant of a key is the one that it was made for, and a request cannot name another (DATA-19).
        if (wanted !== undefined && wanted !== '' && wanted.toLowerCase() !== principal.tenantId?.toLowerCase()) {
          throw new HttpError(
            'AUTH_TENANT_FORBIDDEN',
            403,
            'This key works in another tenant.',
            'Use the key of this tenant.',
          );
        }
        return principal.tenantId?.toLowerCase();
      }
      if (wanted === undefined || wanted === '' || principal === undefined) return undefined;
      if (!isUuid(wanted)) {
        throw new HttpError('AUTH_TENANT_INVALID', 400, 'X-Tenant is not a tenant id.', 'Send the UUID of a tenant.');
      }
      const tenant = wanted.toLowerCase();
      const member = isUuid(principal.id)
        ? await runInUnitOfWork(options.db, (em) =>
            em.count(AuthUserRole, { tenant, userId: principal.id.toLowerCase() }),
          )
        : 0;
      if (member === 0) {
        throw new HttpError(
          'AUTH_TENANT_FORBIDDEN',
          403,
          'You have no role in this tenant.',
          'Ask an administrator of the tenant for a role.',
        );
      }
      return tenant;
    },
  };
}
