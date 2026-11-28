/**
 * BieberKit
 *
 * @file        plugins/users/src/routes/sessions.ts
 * @description The routes that list and end the sessions of a user (USR-09).
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
import { BASE, actorOf, byId, idOf, lookupOf, none, usersOf, uuid } from './shared.ts';

const params = (
  properties: Record<string, unknown>,
): { type: 'object'; properties: Record<string, unknown>; required: string[] } => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});

export const sessionRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: `${BASE}/:id/sessions`,
    permission: 'users.revoke-sessions',
    schema: {
      params: byId,
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  ipAddress: { type: ['string', 'null'] },
                  userAgent: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  lastUsedAt: { type: 'string' },
                },
                required: ['id', 'ipAddress', 'userAgent', 'createdAt', 'lastUsedAt'],
              },
            },
          },
          required: ['data'],
        },
      },
    },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      return { data: await users.sessions(idOf(ctx)) };
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:id/sessions/:sessionId`,
    permission: 'users.revoke-sessions',
    idempotent: true,
    schema: { params: params({ id: uuid, sessionId: uuid }), response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.revokeSession({
        userId: idOf(ctx),
        sessionId: String(ctx.params['sessionId']),
        actorId: actorOf(ctx),
      });
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:id/sessions`,
    permission: 'users.revoke-sessions',
    idempotent: true,
    schema: { params: byId, response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.revokeSessions({ userId: idOf(ctx), actorId: actorOf(ctx) });
      ctx.status(204);
      return undefined;
    },
  }),
];
