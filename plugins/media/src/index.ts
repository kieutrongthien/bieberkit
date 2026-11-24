/**
 * BieberKit
 *
 * @file        plugins/media/src/index.ts
 * @description The media plugin: a record for each file in the storage, with a signed upload URL and a confirmation that checks what the browser sent (S-01, S-02, spec section 12).
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
import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { defineRoute, HttpError } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';

const ENTITY = 'media.Media';

/** One file: its name, its type and its size as the person said them, and whether the bytes arrived (`ready`) or not (`pending`). */
export const Media: EntityDef<'media.Media'> = defineEntity({
  name: ENTITY,
  table: 'bk_media',
  fields: {
    id: f.id(),
    filename: f.string({ min: 1, max: 200 }),
    contentType: f.string({ min: 3, max: 120 }),
    size: f.int({ min: 1 }),
    status: f.oneOf(['pending', 'ready']).default('pending'),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: { read: 'media.read', create: 'media.upload', update: 'media.manage', delete: 'media.manage' },
  api: { list: true, get: true, create: true, delete: true },
  label: { en: 'Media' },
  admin: { title: 'filename', list: ['filename', 'contentType', 'size', 'status', 'createdAt'], icon: 'picture' },
});

/** Where the file lives in the storage. The path comes from the id, so two files with one name never meet. */
export const pathOf = (row: { readonly id: string; readonly filename: string }): string =>
  `media/${row.id}/${row.filename}`;

interface MediaRow {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  status: string;
}

const isRow = (value: unknown): value is MediaRow =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'string';

async function findRow(ctx: RouteContext): Promise<MediaRow> {
  const id = String(ctx.params['id']);
  const row: unknown = await runInUnitOfWork(ctx.services.database, (em) =>
    em.findOne(em.getMetadata().getByClassName(ENTITY).class, { id }),
  );
  if (!isRow(row)) throw new HttpError('MEDIA_NOT_FOUND', 404, 'The file does not exist.', 'Check the id of the file.');
  return row;
}

const params = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } as const;

const uploadUrl: RouteDef = defineRoute({
  method: 'POST',
  url: '/api/v1/media/media/:id/upload-url',
  permission: 'media.upload',
  schema: {
    params,
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
  async handler(ctx) {
    const row = await findRow(ctx);
    if (row.status === 'ready')
      throw new HttpError(
        'MEDIA_ALREADY_READY',
        409,
        'The file was uploaded already.',
        'Make a new record for a new file.',
      );
    const signed = await ctx.services.storage.signedUploadUrl(pathOf(row), {
      contentType: row.contentType,
      size: row.size,
    });
    return { url: signed.url, method: signed.method, headers: signed.headers, expiresAt: signed.expiresAt };
  },
});

const confirm: RouteDef = defineRoute({
  method: 'POST',
  url: '/api/v1/media/media/:id/confirm',
  permission: 'media.upload',
  schema: {
    params,
    response: {
      200: {
        type: 'object',
        properties: { id: { type: 'string' }, status: { type: 'string' }, size: { type: 'number' } },
        required: ['id', 'status', 'size'],
      },
    },
  },
  async handler(ctx) {
    const row = await findRow(ctx);
    // The storage checks the size, the type that the bytes really are, and the policy. It deletes a file that fails (S-02).
    const stored = await ctx.services.storage.confirmUpload(pathOf(row));
    await runInTransaction(ctx.services.database, async (em) => {
      const current: unknown = await em.findOneOrFail(em.getMetadata().getByClassName(ENTITY).class, { id: row.id });
      if (!isRow(current)) throw new Error('The media row is not a row.');
      current.status = 'ready';
      current.size = stored.size;
      await em.flush();
    });
    return { id: row.id, status: 'ready', size: stored.size };
  },
});

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-media',
  version: '0.1.0',
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['media.read', 'media.upload', 'media.manage'],
  entities: [Media],
  routes: [uploadUrl, confirm],
});

export default plugin;
