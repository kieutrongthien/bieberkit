/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/index.ts
 * @description The audit-log plugin: the entries of the tenant with filters, one entry with its actor, an export in CSV or NDJSON and the list of actions; nothing here changes a row (OBS-05, AUD-01 to AUD-06).
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

import { Readable } from 'node:stream';
import { definePlugin, env } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import { pageSize } from '@bieberkit/data';
import { recordAudit, runInTransaction } from '@bieberkit/data/orm';
import { defineRoute } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';
import { CSV_COLUMNS, csvLine, ndjsonLine } from './csv.ts';
import { actionsOf, exportPages, FILTER_KEYS, listEntries, moreThan, oneEntry, scopeOf, whereOf } from './entries.ts';
import type { Filters } from './entries.ts';

export type { Actor, EntryView, Filters } from './entries.ts';

const BASE = '/api/v1/audit-log';
const ACTIONS_TTL_MS = 60_000;
const DEFAULT_EXPORT_MAX = 100_000;

const filterQuery = {
  from: { type: 'string', format: 'date-time' },
  to: { type: 'string', format: 'date-time' },
  action: { type: 'string', minLength: 1, maxLength: 200 },
  entity: { type: 'string', minLength: 1, maxLength: 200 },
  recordId: { type: 'string', format: 'uuid' },
  actorId: { type: 'string', format: 'uuid' },
  requestId: { type: 'string', minLength: 1, maxLength: 64 },
} as const;

const actor = {
  type: ['object', 'null'],
  properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } },
} as const;

const entry = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    at: { type: 'string' },
    tenant: { type: ['string', 'null'] },
    actorId: { type: ['string', 'null'] },
    actor,
    requestId: { type: ['string', 'null'] },
    action: { type: 'string' },
    entity: { type: ['string', 'null'] },
    recordId: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    data: {},
  },
  required: ['id', 'at', 'action', 'actor'],
} as const;

/** The filters that the query gave, and only those. */
function filtersOf(ctx: RouteContext): Filters {
  const filters: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = ctx.query[key];
    if (typeof value === 'string' && value !== '') filters[key] = value;
  }
  return filters;
}

const whereFor = (ctx: RouteContext) => whereOf(filtersOf(ctx), scopeOf(ctx.tenantId));

const exportMaxOf = (ctx: RouteContext): number => {
  const value = ctx.services.pluginEnv['AUDIT_LOG_EXPORT_MAX_ROWS'];
  return typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : DEFAULT_EXPORT_MAX;
};

export const entries: RouteDef = defineRoute({
  method: 'GET',
  url: `${BASE}/entries`,
  permission: 'audit-log.read',
  schema: {
    query: {
      type: 'object',
      properties: {
        ...filterQuery,
        pageSize: { type: 'integer', minimum: 1 },
        cursor: { type: 'string', maxLength: 1024 },
        withTotal: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        type: 'object',
        properties: {
          data: { type: 'array', items: entry },
          meta: {
            type: 'object',
            properties: {
              pageSize: { type: 'integer' },
              nextCursor: { type: ['string', 'null'] },
              total: { type: 'integer' },
            },
            required: ['pageSize', 'nextCursor'],
          },
        },
        required: ['data', 'meta'],
      },
    },
  },
  handler: (ctx) => {
    const cursor = ctx.query['cursor'];
    return listEntries(ctx.services.database, {
      where: whereFor(ctx),
      size: pageSize(ctx.query['pageSize']),
      ...(typeof cursor === 'string' ? { cursor } : {}),
      withTotal: ctx.query['withTotal'] === true,
    });
  },
});

const one: RouteDef = defineRoute({
  method: 'GET',
  url: `${BASE}/entries/:id`,
  permission: 'audit-log.read',
  schema: {
    params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    response: { 200: { type: 'object', properties: { data: entry }, required: ['data'] } },
  },
  handler: async (ctx) => ({
    data: await oneEntry(ctx.services.database, String(ctx.params['id']), scopeOf(ctx.tenantId)),
  }),
});

const actions: RouteDef = defineRoute({
  method: 'GET',
  url: `${BASE}/actions`,
  permission: 'audit-log.read',
  schema: {
    response: {
      200: {
        type: 'object',
        properties: { data: { type: 'array', items: { type: 'string' } } },
        required: ['data'],
      },
    },
  },
  async handler(ctx) {
    const scope = scopeOf(ctx.tenantId);
    // For a filter control: a minute old is fresh enough, and the distinct scan runs at most once a minute (AUD-04).
    const data = await ctx.services.cache.remember(`audit-log:actions:${scope ?? 'all'}`, ACTIONS_TTL_MS, () =>
      actionsOf(ctx.services.database, scope),
    );
    return { data };
  },
});

const exported: RouteDef = defineRoute({
  method: 'GET',
  url: `${BASE}/export`,
  permission: 'audit-log.export',
  schema: {
    query: {
      type: 'object',
      properties: { ...filterQuery, format: { type: 'string', enum: ['csv', 'ndjson'] } },
      required: ['format'],
      additionalProperties: false,
    },
    response: { 200: {} },
  },
  async handler(ctx) {
    const db = ctx.services.database;
    const format = ctx.query['format'] === 'csv' ? 'csv' : 'ndjson';
    const filters = filtersOf(ctx);
    const where = whereOf(filters, scopeOf(ctx.tenantId));
    const max = exportMaxOf(ctx);
    // The export is itself an entry, written before the first byte, so even an export that breaks off is in the log (AUD-03).
    await runInTransaction(db, async (em) => {
      recordAudit(em, { action: 'audit-log.entries.exported', data: { format, filters } });
      await em.flush();
    });
    // Headers go before the body, so whether the export is cut is known first, from one row past the limit.
    if (await moreThan(db, where, max)) ctx.header('x-export-truncated', 'true');
    const day = new Date().toISOString().slice(0, 10);
    ctx.header('content-type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson');
    ctx.header('content-disposition', `attachment; filename="audit-log-${day}.${format}"`);
    ctx.header('x-content-type-options', 'nosniff');
    const line = format === 'csv' ? csvLine : ndjsonLine;
    async function* body(): AsyncGenerator<string> {
      if (format === 'csv') yield `${CSV_COLUMNS.join(',')}\n`;
      for await (const page of exportPages(db, where, max)) yield page.map(line).join('');
    }
    return Readable.from(body());
  },
});

import pkg from '../package.json' with { type: 'json' };

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-audit-log',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  env: {
    AUDIT_LOG_EXPORT_MAX_ROWS: env
      .int({ min: 1, max: 10_000_000 })
      .default(DEFAULT_EXPORT_MAX)
      .describe('The most entries that one export of the audit log holds; a longer one is cut and says so (AUD-03)'),
  },
  permissions: ['audit-log.read', 'audit-log.export'],
  routes: [entries, one, actions, exported],
});

export default plugin;
