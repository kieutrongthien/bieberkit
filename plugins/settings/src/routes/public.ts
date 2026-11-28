/**
 * BieberKit
 *
 * @file        plugins/settings/src/routes/public.ts
 * @description The route of the settings that anyone may read (SET-06).
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
import { where } from './shared.ts';

export const publicRoutes: readonly RouteDef[] = [
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
