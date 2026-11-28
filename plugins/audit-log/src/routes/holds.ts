/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/routes/holds.ts
 * @description The routes of the legal holds that keep entries from being pruned (AUD-05).
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
import { BASE } from './shared.ts';
import { listHolds, placeHold, releaseHold } from '../services/holds.ts';
import { scopeOf } from '../services/entries.ts';

const hold = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    tenant: { type: ['string', 'null'] },
    entity: { type: ['string', 'null'] },
    recordId: { type: ['string', 'null'] },
    actorId: { type: ['string', 'null'] },
    reason: { type: 'string' },
    createdAt: { type: 'string' },
    createdBy: { type: ['string', 'null'] },
    releasedAt: { type: ['string', 'null'] },
    releasedBy: { type: ['string', 'null'] },
  },
  required: ['id', 'reason', 'createdAt'],
} as const;

export const holds: RouteDef = defineRoute({
  method: 'GET',
  url: `${BASE}/holds`,
  permission: 'audit-log.read',
  schema: {
    query: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'released', 'all'] },
        pageSize: { type: 'integer', minimum: 1 },
        cursor: { type: 'string', maxLength: 1024 },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        type: 'object',
        properties: {
          data: { type: 'array', items: hold },
          meta: {
            type: 'object',
            properties: { pageSize: { type: 'integer' }, nextCursor: { type: ['string', 'null'] } },
            required: ['pageSize', 'nextCursor'],
          },
        },
        required: ['data', 'meta'],
      },
    },
  },
  async handler(ctx) {
    const status = ctx.query['status'] === 'released' || ctx.query['status'] === 'all' ? ctx.query['status'] : 'active';
    const cursor = ctx.query['cursor'];
    return listHolds(ctx.services.database, {
      scope: scopeOf(ctx.tenantId),
      status,
      pageSize: ctx.query['pageSize'],
      ...(typeof cursor === 'string' ? { cursor } : {}),
    });
  },
});

export const placed: RouteDef = defineRoute({
  method: 'POST',
  url: `${BASE}/holds`,
  permission: 'audit-log.hold',
  idempotent: true,
  schema: {
    body: {
      type: 'object',
      properties: {
        entity: { type: 'string', minLength: 1, maxLength: 200 },
        recordId: { type: 'string', format: 'uuid' },
        actorId: { type: 'string', format: 'uuid' },
        reason: { type: 'string', minLength: 1, maxLength: 1000 },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    response: { 201: hold },
  },
  async handler(ctx) {
    const field = (name: string): string | undefined => {
      const value: unknown = Reflect.get(Object(ctx.body), name);
      return typeof value === 'string' ? value : undefined;
    };
    const made = await placeHold(ctx.services.database, {
      entity: field('entity'),
      recordId: field('recordId'),
      actorId: field('actorId'),
      reason: field('reason') ?? '',
      scope: scopeOf(ctx.tenantId),
    });
    ctx.status(201);
    return made;
  },
});

export const released: RouteDef = defineRoute({
  method: 'DELETE',
  url: `${BASE}/holds/:id`,
  permission: 'audit-log.hold',
  idempotent: true,
  schema: {
    params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    response: { 204: { type: 'null' } },
  },
  async handler(ctx) {
    await releaseHold(ctx.services.database, String(ctx.params['id']), scopeOf(ctx.tenantId));
    ctx.status(204);
    return undefined;
  },
});
