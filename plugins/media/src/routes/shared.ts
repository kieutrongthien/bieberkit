/**
 * BieberKit
 *
 * @file        plugins/media/src/routes/shared.ts
 * @description What the routes of the media library share.
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

import type { JsonSchema } from '@bieberkit/data/schema';
import type { RouteContext } from '@bieberkit/http';

export const byId = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
} as const;

export const one = (item: object): JsonSchema => ({ type: 'object', properties: { data: item }, required: ['data'] });

export const many = (item: object): JsonSchema => ({
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
});

export const idOf = (ctx: RouteContext): string => String(ctx.params['id']);

export const noContent = (ctx: RouteContext): undefined => {
  ctx.status(204);
  return undefined;
};
