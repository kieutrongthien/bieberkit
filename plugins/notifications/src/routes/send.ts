/**
 * BieberKit
 *
 * @file        plugins/notifications/src/routes/send.ts
 * @description The route that sends a notification (NTF-04).
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
import { LEVELS } from '../entities/notification.ts';
import { CHANNELS } from '../entities/preference.ts';
import type { Channel, Level, SendInput } from '../services/types.ts';

export const sendRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'POST',
    url: '/api/v1/notifications/send',
    // Its own permission, mapped to no action of the entity: a scoped permission of the person (delete-own) covers an entity
    // permission such as notifications.manage at the level of a route, where no condition applies.
    permission: 'notifications.send',
    idempotent: true,
    schema: {
      body: {
        type: 'object',
        properties: {
          to: {
            anyOf: [
              { type: 'string', format: 'uuid' },
              { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 100 },
              {
                type: 'object',
                properties: { role: { type: 'string', minLength: 1, maxLength: 120 } },
                required: ['role'],
                additionalProperties: false,
              },
            ],
          },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          body: { type: 'string', maxLength: 5000 },
          level: { type: 'string', enum: [...LEVELS] },
          category: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,59}$' },
          link: { type: 'string', minLength: 1, maxLength: 500 },
          channels: { type: 'array', items: { type: 'string', enum: [...CHANNELS] }, minItems: 1 },
          dedupeKey: { type: 'string', minLength: 1, maxLength: 200 },
        },
        required: ['to', 'title'],
        additionalProperties: false,
      },
      response: {
        202: {
          type: 'object',
          properties: { created: { type: 'integer' }, queued: { type: 'boolean' } },
          required: ['created', 'queued'],
        },
      },
    },
    async handler(ctx) {
      // The schema checked every field; the body is the input of the notifier, with the tenant of the request for a role.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const body = ctx.body as SendInput & { readonly level?: Level; readonly channels?: readonly Channel[] };
      const to =
        typeof body.to === 'object' && !Array.isArray(body.to) && 'role' in body.to
          ? { role: body.to.role, ...(ctx.tenantId === undefined ? {} : { tenantId: ctx.tenantId }) }
          : body.to;
      const result = await ctx.services.notifier.send({ ...body, to });
      ctx.status(202);
      return result;
    },
  }),
];
