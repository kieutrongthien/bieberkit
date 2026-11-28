/**
 * BieberKit
 *
 * @file        plugins/users/src/routes/security.ts
 * @description The routes of the credentials of a user: a new invitation or password link, the reset of the second factor, and what they may do (USR-10, USR-11).
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
import { effectivePermissions } from '@bieberkit/auth';
import { BASE, actorOf, byId, idOf, lookupOf, none, role, tenantOf, usersOf } from './shared.ts';

const accepted = { type: 'object', properties: {}, additionalProperties: false } as const;

export const securityRoutes: readonly RouteDef[] = [
  ...(
    [
      ['reset-password', 'users.manage', 'sendPasswordReset'],
      ['resend-invite', 'users.manage', 'resendInvite'],
    ] as const
  ).map(([path, permission, action]) =>
    defineRoute({
      method: 'POST',
      url: `${BASE}/:id/${path}`,
      permission,
      idempotent: true,
      schema: { params: byId, response: { 202: accepted } },
      async handler(ctx) {
        const users = usersOf(ctx);
        await users.get(idOf(ctx), await lookupOf(ctx));
        await users[action]({ userId: idOf(ctx), actorId: actorOf(ctx) });
        ctx.status(202);
        return {};
      },
    }),
  ),
  defineRoute({
    method: 'POST',
    url: `${BASE}/:id/mfa/reset`,
    permission: 'users.reset-mfa',
    idempotent: true,
    schema: { params: byId, response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.resetMfa({ userId: idOf(ctx), actorId: actorOf(ctx) });
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/:id/permissions`,
    permission: 'users.read',
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
                  permission: { type: 'string' },
                  roles: { type: 'array', items: role },
                  condition: { type: 'object', additionalProperties: true },
                },
                required: ['permission', 'roles'],
              },
            },
          },
          required: ['data'],
        },
      },
    },
    async handler(ctx) {
      await usersOf(ctx).get(idOf(ctx), await lookupOf(ctx));
      return { data: await effectivePermissions(ctx.services.database, { userId: idOf(ctx), ...tenantOf(ctx) }) };
    },
  }),
];
