/**
 * BieberKit
 *
 * @file        plugins/media/src/routes/folders.ts
 * @description The routes of the folders of the library.
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
import { byId, idOf, many, noContent, one } from './shared.ts';

const FOLDERS = '/api/v1/media/folders';

const folder = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    parentId: { type: ['string', 'null'] },
    depth: { type: 'integer' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'name', 'parentId', 'depth', 'createdAt'],
} as const;

const folderName = { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' } as const;

export const folderRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: FOLDERS,
    permission: 'media.read',
    schema: {
      query: {
        type: 'object',
        properties: {
          parentId: { type: 'string', format: 'uuid' },
          pageSize: { type: 'integer', minimum: 1 },
          cursor: { type: 'string', maxLength: 1024 },
        },
        additionalProperties: false,
      },
      response: { 200: many(folder) },
    },
    handler: (ctx) => ctx.services.media.folders(ctx.query),
  }),
  defineRoute({
    method: 'POST',
    url: FOLDERS,
    permission: 'media.manage',
    schema: {
      body: {
        type: 'object',
        properties: { name: folderName, parentId: { type: 'string', format: 'uuid' } },
        required: ['name'],
        additionalProperties: false,
      },
      response: { 201: one(folder) },
    },
    async handler(ctx) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const data = await ctx.services.media.createFolder(ctx.body as { name: string; parentId?: string });
      ctx.status(201);
      return { data };
    },
  }),
  defineRoute({
    method: 'PATCH',
    url: `${FOLDERS}/:id`,
    permission: 'media.manage',
    schema: {
      params: byId,
      body: { type: 'object', properties: { name: folderName }, required: ['name'], additionalProperties: false },
      response: { 200: one(folder) },
    },
    handler: async (ctx) => ({
      data: await ctx.services.media.renameFolder(idOf(ctx), String(Reflect.get(Object(ctx.body), 'name'))),
    }),
  }),
  defineRoute({
    method: 'DELETE',
    url: `${FOLDERS}/:id`,
    permission: 'media.manage',
    idempotent: true,
    schema: { params: byId, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await ctx.services.media.removeFolder(idOf(ctx));
      return noContent(ctx);
    },
  }),
];
