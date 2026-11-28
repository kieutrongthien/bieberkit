/**
 * BieberKit
 *
 * @file        plugins/users/src/routes/me.ts
 * @description The routes of one's own profile (USR-12).
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

import { HttpError, defineRoute } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';
import { loadGrants } from '@bieberkit/auth';
import { detail, field, overridesExternal, tenantOf, usersOf } from './shared.ts';

/**
 * What `GET /users/me` adds: whether a second factor is asked of the person, by a role or by the rule for everyone, and when it is
 * not set up yet in the days of grace, the time by which to enrol (USR-12, AUTH-05, POL-02).
 */
const me = {
  ...detail,
  properties: { ...detail.properties, mfaRequired: { type: 'boolean' }, mfaEnrolBy: { type: 'string' } },
  required: [...detail.required, 'mfaRequired'],
} as const;

/**
 * The signed-in person. `/me` needs no permission, only a principal, and API-02 makes a route without a permission public, so the
 * handler refuses an anonymous caller itself, with the answer of the server.
 */
function selfOf(ctx: RouteContext): string {
  const id = ctx.principal?.id;
  if (id === undefined) {
    throw new HttpError('HTTP_UNAUTHENTICATED', 401, 'Sign in to do this.', 'Send a valid session or API key.');
  }
  return id;
}

export const meRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: '/api/v1/users/me',
    public: true,
    schema: { response: { 200: me } },
    handler: async (ctx) => {
      const id = selfOf(ctx);
      const found = await usersOf(ctx).get(id, tenantOf(ctx));
      const { requireMfa } = await loadGrants(ctx.services.database, ctx.tenantId, id);
      return {
        ...found,
        mfaRequired: ctx.principal?.mfaForAll === true || requireMfa,
        ...(ctx.principal?.mfaEnrolBy === undefined ? {} : { mfaEnrolBy: ctx.principal.mfaEnrolBy }),
      };
    },
  }),
  defineRoute({
    method: 'PATCH',
    url: '/api/v1/users/me',
    public: true,
    schema: {
      body: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
        required: ['name'],
        additionalProperties: false,
      },
      response: { 200: detail },
    },
    handler: async (ctx) => {
      const id = selfOf(ctx);
      return usersOf(ctx).update({
        userId: id,
        name: String(field(ctx.body, 'name')),
        actorId: id,
        overrideExternal: await overridesExternal(ctx),
        ...tenantOf(ctx),
      });
    },
  }),
];
