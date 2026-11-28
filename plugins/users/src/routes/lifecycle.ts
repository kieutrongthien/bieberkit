/**
 * BieberKit
 *
 * @file        plugins/users/src/routes/lifecycle.ts
 * @description The routes that disable, enable and delete a user (USR-06, USR-07).
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

import { defineRoute } from '@bieberkit/http';
import type { RouteDef } from '@bieberkit/http';
import { BASE, actorOf, byId, detail, field, idOf, lookupOf, none, overridesExternal, usersOf } from './shared.ts';

export const lifecycleRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'POST',
    url: `${BASE}/:id/disable`,
    permission: 'users.manage',
    schema: {
      params: byId,
      body: {
        type: 'object',
        properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
        required: ['reason'],
        additionalProperties: false,
      },
      response: { 200: detail },
    },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.disable({
        userId: idOf(ctx),
        reason: String(field(ctx.body, 'reason')),
        actorId: actorOf(ctx),
        overrideExternal: await overridesExternal(ctx),
      });
      return users.get(idOf(ctx), await lookupOf(ctx));
    },
  }),
  defineRoute({
    method: 'POST',
    url: `${BASE}/:id/enable`,
    permission: 'users.manage',
    schema: { params: byId, response: { 200: detail } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.enable({ userId: idOf(ctx), actorId: actorOf(ctx), overrideExternal: await overridesExternal(ctx) });
      return users.get(idOf(ctx), await lookupOf(ctx));
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:id`,
    permission: 'users.manage',
    idempotent: true,
    schema: { params: byId, response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.remove({ userId: idOf(ctx), actorId: actorOf(ctx) });
      ctx.status(204);
      return undefined;
    },
  }),
];
