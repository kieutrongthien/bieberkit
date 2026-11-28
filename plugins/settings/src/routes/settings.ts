/**
 * BieberKit
 *
 * @file        plugins/settings/src/routes/settings.ts
 * @description The routes that list, read, change and reset settings (SET-01 to SET-04).
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
import { change, where } from './shared.ts';

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

const keyOf = (ctx: RouteContext): string => String(ctx.params['key']);

export const settingRoutes: readonly RouteDef[] = [
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
    idempotent: true,
    schema: { params: byKey, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await ctx.services.settings.reset(keyOf(ctx), change(ctx));
      ctx.status(204);
      return undefined;
    },
  }),
];
