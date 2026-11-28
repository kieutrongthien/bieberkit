/**
 * BieberKit
 *
 * @file        plugins/notifications/src/routes/preferences.ts
 * @description The routes of one's own preferences (NTF-03).
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
import { runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { CHANNELS, Preference } from '../entities/preference.ts';
import { ME, audit, classOf, meOf, text } from './shared.ts';

const preference = {
  type: 'object',
  properties: {
    category: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,59}$' },
    channel: { type: 'string', enum: [...CHANNELS] },
    enabled: { type: 'boolean' },
  },
  required: ['category', 'channel', 'enabled'],
  additionalProperties: false,
} as const;

async function preferencesOf(ctx: RouteContext): Promise<{ data: Record<string, unknown>[] }> {
  return runInUnitOfWork(ctx.services.database, async (em) => {
    const rows: unknown[] = await em.find(
      classOf(em, Preference.name),
      { userId: meOf(ctx) },
      { orderBy: { category: 'asc', channel: 'asc' } },
    );
    return {
      data: rows.map((row) => ({
        category: String(text(row, 'category')),
        channel: String(text(row, 'channel')),
        enabled: text(row, 'enabled') === true || text(row, 'enabled') === 1,
      })),
    };
  });
}

export const preferenceRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: `${ME}/preferences`,
    permission: 'notifications.read-own',
    schema: {
      response: {
        200: { type: 'object', properties: { data: { type: 'array', items: preference } }, required: ['data'] },
      },
    },
    handler: preferencesOf,
  }),
  defineRoute({
    method: 'PUT',
    url: `${ME}/preferences`,
    permission: 'notifications.update-own',
    schema: {
      body: {
        type: 'object',
        properties: { data: { type: 'array', items: preference, maxItems: 100 } },
        required: ['data'],
        additionalProperties: false,
      },
      response: {
        200: { type: 'object', properties: { data: { type: 'array', items: preference } }, required: ['data'] },
      },
    },
    async handler(ctx) {
      const listed = Reflect.get(Object(ctx.body), 'data');
      const wanted = Array.isArray(listed) ? listed : [];
      const userId = meOf(ctx);
      await runInTransaction(ctx.services.database, async (em) => {
        const entity = classOf(em, Preference.name);
        for (const choice of wanted) {
          const category = String(text(choice, 'category'));
          const channel = String(text(choice, 'channel'));
          const enabled = text(choice, 'enabled') === true;
          const row: unknown = await em.findOne(entity, { userId, category, channel });
          // The class comes from the metadata; the columns are those of `Preference`.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          if (row === null) em.create(entity, { userId, category, channel, enabled } as never);
          else Reflect.set(Object(row), 'enabled', enabled);
        }
        audit(em, 'notifications.preferences.updated', undefined, { userId, count: wanted.length });
        await em.flush();
      });
      return preferencesOf(ctx);
    },
  }),
];
