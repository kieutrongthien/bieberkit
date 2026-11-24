/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/index.ts
 * @description The audit-log plugin: a read-only list of the audit log, newest first, with the filters of an investigation and a cursor, behind the audit-log.read permission (OBS-05, AUTHZ-05).
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

import { definePlugin } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import { AuditLog, runInUnitOfWork } from '@bieberkit/data/orm';
import { defineRoute } from '@bieberkit/http';
import type { RouteDef } from '@bieberkit/http';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const entry = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    at: { type: 'string' },
    actorId: { type: ['string', 'null'] },
    requestId: { type: ['string', 'null'] },
    action: { type: 'string' },
    entity: { type: ['string', 'null'] },
    recordId: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    data: {},
  },
  required: ['id', 'at', 'action'],
} as const;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** What was stored as JSON text is given back as JSON, and anything else as it is. */
function dataOf(value: string | null | undefined): unknown {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const entries: RouteDef = defineRoute({
  method: 'GET',
  url: '/api/v1/audit-log/entries',
  permission: 'audit-log.read',
  schema: {
    query: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
        cursor: { type: 'string', maxLength: 64 },
        action: { type: 'string', maxLength: 200 },
        entity: { type: 'string', maxLength: 200 },
        actorId: { type: 'string', maxLength: 64 },
        recordId: { type: 'string', maxLength: 64 },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        type: 'object',
        properties: {
          data: { type: 'array', items: entry },
          nextCursor: { type: ['string', 'null'] },
        },
        required: ['data', 'nextCursor'],
      },
    },
  },
  async handler(ctx) {
    const limit = typeof ctx.query['limit'] === 'number' ? ctx.query['limit'] : DEFAULT_LIMIT;
    const cursor = text(ctx.query['cursor']);
    const filter: Record<string, unknown> = {};
    for (const key of ['action', 'entity', 'actorId', 'recordId'] as const) {
      const value = text(ctx.query[key]);
      if (value !== undefined) filter[key] = value;
    }
    // Ids are UUIDv7, so the order of the ids is the order of the times, and a cursor on the id pages the log without skipping a row.
    if (cursor !== undefined) filter['id'] = { $lt: cursor };
    const rows = await runInUnitOfWork(ctx.services.database, (em) =>
      em.find(AuditLog, filter, { orderBy: { id: 'desc' }, limit: limit + 1 }),
    );
    const page = rows.slice(0, limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        at: row.at.toISOString(),
        actorId: row.actorId ?? null,
        requestId: row.requestId ?? null,
        action: row.action,
        entity: row.entity ?? null,
        recordId: row.recordId ?? null,
        reason: row.reason ?? null,
        data: dataOf(row.data),
      })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  },
});

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-audit-log',
  version: '0.1.0',
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['audit-log.read'],
  routes: [entries],
});

export default plugin;
