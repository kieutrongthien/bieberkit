/**
 * BieberKit
 *
 * @file        plugins/media/src/routes.ts
 * @description The routes of the media plugin, thin over the media service: files, the upload flow, read URLs and folders (MED-01 to MED-08).
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
import { KINDS, STATUSES, VISIBILITIES } from './entity.ts';
import type { MediaChanges, NewMedia } from './service.ts';

const MEDIA = '/api/v1/media/media';
const FOLDERS = '/api/v1/media/folders';
/** A name that is one safe segment of a storage path, with an extension (S-05). */
const FILENAME = '^[A-Za-z0-9_.-]+(?: [A-Za-z0-9_.-]+)*\\.[A-Za-z0-9]+$';

const byId = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } as const;
const nullableText = (max: number) => ({ type: ['string', 'null'], minLength: 1, maxLength: max }) as const;
const nullableId = { type: ['string', 'null'], format: 'uuid' } as const;

const file = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    filename: { type: 'string' },
    contentType: { type: 'string' },
    kind: { type: 'string' },
    size: { type: 'integer' },
    status: { type: 'string' },
    visibility: { type: 'string' },
    alt: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    folderId: { type: ['string', 'null'] },
    checksum: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'filename', 'contentType', 'kind', 'size', 'status', 'visibility', 'createdAt'],
} as const;

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

const one = (item: object) => ({ type: 'object', properties: { data: item }, required: ['data'] }) as const;
const many = (item: object) =>
  ({
    type: 'object',
    properties: {
      data: { type: 'array', items: item },
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
  }) as const;

const folderName = { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' } as const;
const idOf = (ctx: RouteContext): string => String(ctx.params['id']);
const noContent = (ctx: RouteContext): undefined => {
  ctx.status(204);
  return undefined;
};

export const routes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: MEDIA,
    permission: 'media.read',
    schema: {
      query: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 200 },
          kind: { type: 'string', enum: [...KINDS] },
          folderId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: [...STATUSES] },
          visibility: { type: 'string', enum: [...VISIBILITIES] },
          sizeMin: { type: 'integer', minimum: 0 },
          sizeMax: { type: 'integer', minimum: 0 },
          createdFrom: { type: 'string', format: 'date-time' },
          createdTo: { type: 'string', format: 'date-time' },
          pageSize: { type: 'integer', minimum: 1 },
          cursor: { type: 'string', maxLength: 1024 },
          withTotal: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      response: { 200: many(file) },
    },
    // The schema checked every field of the query.
    handler: (ctx) => ctx.services.media.list(ctx.query),
  }),
  defineRoute({
    method: 'POST',
    url: MEDIA,
    permission: 'media.upload',
    schema: {
      body: {
        type: 'object',
        properties: {
          filename: { type: 'string', minLength: 3, maxLength: 200, pattern: FILENAME },
          contentType: { type: 'string', minLength: 3, maxLength: 120 },
          size: { type: 'integer', minimum: 1 },
          visibility: { type: 'string', enum: [...VISIBILITIES] },
          alt: { type: 'string', minLength: 1, maxLength: 500 },
          description: { type: 'string', minLength: 1, maxLength: 2000 },
          folderId: { type: 'string', format: 'uuid' },
        },
        required: ['filename', 'contentType', 'size'],
        additionalProperties: false,
      },
      response: { 201: one(file) },
    },
    async handler(ctx) {
      // The schema checked every field of the body.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const data = await ctx.services.media.create(ctx.body as NewMedia);
      ctx.status(201);
      return { data };
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${MEDIA}/:id`,
    permission: 'media.read',
    schema: { params: byId, response: { 200: one(file) } },
    handler: async (ctx) => ({ data: await ctx.services.media.get(idOf(ctx)) }),
  }),
  defineRoute({
    method: 'PATCH',
    url: `${MEDIA}/:id`,
    permission: 'media.manage',
    schema: {
      params: byId,
      // Only the metadata: the file, its name, its size and its visibility never change (MED-01, MED-04).
      body: {
        type: 'object',
        properties: { alt: nullableText(500), description: nullableText(2000), folderId: nullableId },
        minProperties: 1,
        additionalProperties: false,
      },
      response: { 200: one(file) },
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    handler: async (ctx) => ({ data: await ctx.services.media.update(idOf(ctx), ctx.body as MediaChanges) }),
  }),
  defineRoute({
    method: 'DELETE',
    url: `${MEDIA}/:id`,
    permission: 'media.manage',
    schema: { params: byId, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await ctx.services.media.remove(idOf(ctx));
      return noContent(ctx);
    },
  }),
  defineRoute({
    method: 'POST',
    url: `${MEDIA}/:id/upload-url`,
    permission: 'media.upload',
    schema: {
      params: byId,
      response: {
        200: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            expiresAt: { type: 'number' },
          },
          required: ['url', 'method', 'headers', 'expiresAt'],
        },
      },
    },
    handler: (ctx) => ctx.services.media.uploadUrl(idOf(ctx)),
  }),
  defineRoute({
    method: 'POST',
    url: `${MEDIA}/:id/confirm`,
    permission: 'media.upload',
    schema: {
      params: byId,
      response: {
        200: {
          type: 'object',
          properties: { id: { type: 'string' }, status: { type: 'string' }, size: { type: 'number' } },
          required: ['id', 'status', 'size'],
        },
      },
    },
    handler: (ctx) => ctx.services.media.confirm(idOf(ctx)),
  }),
  defineRoute({
    method: 'GET',
    url: `${MEDIA}/:id/url`,
    permission: 'media.read',
    schema: {
      params: byId,
      response: {
        200: {
          type: 'object',
          properties: { url: { type: 'string' }, expiresAt: { type: ['number', 'null'] } },
          required: ['url', 'expiresAt'],
        },
      },
    },
    handler: (ctx) => ctx.services.media.readUrl(idOf(ctx), `${MEDIA}/${idOf(ctx)}/content`),
  }),
  defineRoute({
    method: 'GET',
    url: `${MEDIA}/:id/content`,
    permission: 'media.read',
    schema: { params: byId, response: { 200: {} } },
    async handler(ctx) {
      // For a disk that cannot sign URLs (MED-02): the bytes, after the permission check, never shown as a page.
      const found = await ctx.services.media.content(idOf(ctx));
      ctx.header('content-type', found.contentType);
      ctx.header('x-content-type-options', 'nosniff');
      ctx.header('content-disposition', `attachment; filename="${found.filename}"`);
      return found.stream;
    },
  }),
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
    schema: { params: byId, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await ctx.services.media.removeFolder(idOf(ctx));
      return noContent(ctx);
    },
  }),
];
