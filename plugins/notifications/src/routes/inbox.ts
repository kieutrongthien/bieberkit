/**
 * BieberKit
 *
 * @file        plugins/notifications/src/routes/inbox.ts
 * @description The routes of one's own notifications: list, count, read and delete (NTF-02).
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

import { HttpError, defineRoute } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';
import { decodeCursor, encodeCursor, isUuid, pageSize } from '@bieberkit/data';
import { runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { ME, audit, classOf, meOf, text } from './shared.ts';
import type { EntityManager } from './shared.ts';
import { Notification } from '../entities/notification.ts';

const iso = (value: unknown): string | null =>
  value instanceof Date || typeof value === 'string' || typeof value === 'number'
    ? new Date(value).toISOString()
    : null;

const notFound = (): never => {
  throw new HttpError(
    'NOTIFICATIONS_NOT_FOUND',
    404,
    'The notification does not exist.',
    'Check the id of the notification.',
  );
};

const item = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    body: { type: ['string', 'null'] },
    level: { type: 'string' },
    category: { type: 'string' },
    link: { type: ['string', 'null'] },
    data: {},
    readAt: { type: ['string', 'null'] },
    expiresAt: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
  },
  required: ['id', 'title', 'level', 'category', 'readAt', 'createdAt'],
} as const;

function viewOf(row: unknown): Record<string, unknown> {
  const data = text(row, 'data');
  return {
    id: String(text(row, 'id')),
    title: String(text(row, 'title')),
    body: text(row, 'body') ?? null,
    level: String(text(row, 'level')),
    category: String(text(row, 'category')),
    link: text(row, 'link') ?? null,
    data: typeof data === 'string' ? JSON.parse(data) : null,
    readAt: iso(text(row, 'readAt')),
    expiresAt: iso(text(row, 'expiresAt')),
    createdAt: iso(text(row, 'createdAt')) ?? '',
  };
}

/** The live notifications of the person: never another's, never an expired one. */
const mine = (userId: string): Record<string, unknown> => ({
  userId,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

async function ownRow(em: EntityManager, ctx: RouteContext): Promise<object> {
  const id = String(ctx.params['id']);
  if (!isUuid(id)) return notFound();
  const row: unknown = await em.findOne(classOf(em, Notification.name), { id, userId: meOf(ctx) });
  return typeof row === 'object' && row !== null ? row : notFound();
}

const byId = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } as const;

export const inboxRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: ME,
    permission: 'notifications.read-own',
    schema: {
      query: {
        type: 'object',
        properties: {
          unread: { type: 'boolean' },
          category: { type: 'string', maxLength: 60 },
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
        },
      },
    },
    async handler(ctx) {
      const size = pageSize(ctx.query['pageSize']);
      const cursor = ctx.query['cursor'];
      const before = typeof cursor === 'string' && cursor !== '' ? String(decodeCursor(cursor)[0]) : undefined;
      const category = ctx.query['category'];
      return runInUnitOfWork(ctx.services.database, async (em) => {
        const where: Record<string, unknown> = {
          ...mine(meOf(ctx)),
          ...(ctx.query['unread'] === true ? { readAt: null } : {}),
          ...(typeof category === 'string' ? { category } : {}),
        };
        const entity = classOf(em, Notification.name);
        const total = ctx.query['withTotal'] === true ? await em.count(entity, where) : undefined;
        const rows: unknown[] = await em.find(
          entity,
          { ...where, ...(before === undefined ? {} : { id: { $lt: before } }) },
          { orderBy: { id: 'desc' }, limit: size + 1 },
        );
        const page = rows.slice(0, size);
        const last = page.at(-1);
        return {
          data: page.map(viewOf),
          meta: {
            pageSize: size,
            nextCursor: rows.length > size && last !== undefined ? encodeCursor([String(text(last, 'id'))]) : null,
            ...(total === undefined ? {} : { total }),
          },
        };
      });
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${ME}/unread-count`,
    permission: 'notifications.read-own',
    schema: {
      response: { 200: { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] } },
    },
    handler: async (ctx) => ({
      count: await runInUnitOfWork(ctx.services.database, (em) =>
        em.count(classOf(em, Notification.name), { ...mine(meOf(ctx)), readAt: null }),
      ),
    }),
  }),
  defineRoute({
    method: 'POST',
    url: `${ME}/:id/read`,
    permission: 'notifications.update-own',
    schema: { params: byId, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await runInTransaction(ctx.services.database, async (em) => {
        const row = await ownRow(em, ctx);
        if (text(row, 'readAt') != null) return;
        Reflect.set(row, 'readAt', new Date());
        audit(em, 'notifications.notification.read', String(text(row, 'id')), {});
        await em.flush();
      });
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'POST',
    url: `${ME}/read-all`,
    permission: 'notifications.update-own',
    schema: {
      response: { 200: { type: 'object', properties: { updated: { type: 'integer' } }, required: ['updated'] } },
    },
    handler: (ctx) =>
      runInTransaction(ctx.services.database, async (em) => {
        const updated = await em.nativeUpdate(
          classOf(em, Notification.name),
          { userId: meOf(ctx), readAt: null },
          { readAt: new Date() },
        );
        audit(em, 'notifications.notification.read-all', undefined, { count: updated });
        await em.flush();
        return { updated };
      }),
  }),
  defineRoute({
    method: 'DELETE',
    url: `${ME}/:id`,
    permission: 'notifications.delete-own',
    idempotent: true,
    schema: { params: byId, response: { 204: { type: 'null' } } },
    async handler(ctx) {
      await runInTransaction(ctx.services.database, async (em) => {
        const row = await ownRow(em, ctx);
        audit(em, 'notifications.notification.deleted', String(text(row, 'id')), {});
        em.remove(row);
        await em.flush();
      });
      ctx.status(204);
      return undefined;
    },
  }),
];
