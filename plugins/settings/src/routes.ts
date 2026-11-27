/**
 * BieberKit
 *
 * @file        plugins/settings/src/routes.ts
 * @description The routes of the settings plugin, thin over the settings service: the list, one setting, write, reset, and the public settings (SET-02, SET-03, SET-07, BPL-06).
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
import type { RouteContext, RouteDef } from '@bieberkit/http';

const BASE = '/api/v1/settings/settings';
const byKey = {
  type: 'object',
  properties: { key: { type: 'string', minLength: 1, maxLength: 120 } },
  required: ['key'],
} as const;
const localized = { type: 'object', additionalProperties: { type: 'string' } } as const;
const view = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    type: { type: 'string' },
    label: localized,
    description: localized,
    group: { type: 'string' },
    scope: { type: 'string' },
    public: { type: 'boolean' },
    secret: { type: 'boolean' },
    values: { type: 'array', items: { type: 'string' } },
    default: {},
    value: {},
    hasValue: { type: 'boolean' },
  },
  required: ['key', 'type', 'label', 'scope', 'public', 'secret', 'default', 'value', 'hasValue'],
} as const;

const where = (ctx: RouteContext): { tenantId?: string } =>
  ctx.tenantId === undefined ? {} : { tenantId: ctx.tenantId };
const keyOf = (ctx: RouteContext): string => String(ctx.params['key']);
const clientIp = (ctx: RouteContext): string => {
  const header = ctx.headers['x-bk-client-ip'];
  return (Array.isArray(header) ? header[0] : header) ?? '';
};
const change = (ctx: RouteContext) => ({
  ...where(ctx),
  actorId: ctx.principal?.id ?? null,
  actor: { ip: clientIp(ctx), mfa: ctx.principal?.mfa === true },
});

export const routes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: BASE,
    permission: 'settings.read',
    schema: {
      query: {
        type: 'object',
        properties: { pageSize: { type: 'integer', minimum: 1 }, cursor: { type: 'string', maxLength: 1024 } },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: view },
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
      const cursor = ctx.query['cursor'];
      const page = await ctx.services.settings.list({
        ...where(ctx),
        ...(ctx.query['pageSize'] === undefined ? {} : { pageSize: ctx.query['pageSize'] }),
        ...(typeof cursor === 'string' ? { cursor } : {}),
      });
      return { data: page.data, meta: { pageSize: page.pageSize, nextCursor: page.nextCursor } };
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/:key`,
    permission: 'settings.read',
    schema: { params: byKey, response: { 200: view } },
    handler: (ctx) => ctx.services.settings.view(keyOf(ctx), where(ctx)),
  }),
  defineRoute({
    method: 'PUT',
    url: `${BASE}/:key`,
    permission: 'settings.manage',
    schema: {
      params: byKey,
      body: { type: 'object', properties: { value: {} }, required: ['value'], additionalProperties: false },
      response: { 200: view },
    },
    async handler(ctx) {
      const { settings } = ctx.services;
      await settings.set(keyOf(ctx), Reflect.get(Object(ctx.body), 'value'), change(ctx));
      return settings.view(keyOf(ctx), where(ctx));
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:key`,
    permission: 'settings.manage',
    schema: { params: byKey, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await ctx.services.settings.reset(keyOf(ctx), change(ctx));
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'GET',
    url: '/api/v1/settings/public',
    public: true,
    cache: { sMaxAge: 60, staleWhileRevalidate: 300 },
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object', properties: { key: { type: 'string' }, value: {} }, required: ['key', 'value'] },
            },
          },
          required: ['data'],
        },
      },
    },
    handler: async (ctx) => ({ data: await ctx.services.settings.publicValues(where(ctx)) }),
  }),
];
