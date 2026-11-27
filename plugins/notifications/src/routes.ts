/**
 * BieberKit
 *
 * @file        plugins/notifications/src/routes.ts
 * @description The routes of the notifications plugin: those of the signed-in person (list, unread count, read, read all, delete, preferences), and the send of support over the notifier (NTF-03, NTF-04, NTF-07, BPL-05, BPL-06).
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

import { decodeCursor, encodeCursor, isUuid, pageSize } from '@bieberkit/data';
import { recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { defineRoute, HttpError } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';
import { CHANNELS, LEVELS, Notification, Preference } from './entity.ts';
import type { Channel, Level, SendInput } from './notifier.ts';

const ME = '/api/v1/notifications/me';
type EntityManager = Parameters<Parameters<typeof runInTransaction>[1]>[0];

const classOf = (em: EntityManager, name: string) => em.getMetadata().getByClassName(name).class;
const text = (row: unknown, name: string): unknown => Reflect.get(Object(row), name);
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

/** The signed-in person. The permission of the route made sure there is one. */
const meOf = (ctx: RouteContext): string => String(ctx.principal?.id);

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

function audit(em: EntityManager, action: string, recordId: string | undefined, data: Record<string, unknown>): void {
  recordAudit(em, { action, entity: Notification.name, ...(recordId === undefined ? {} : { recordId }), data });
}

async function ownRow(em: EntityManager, ctx: RouteContext): Promise<object> {
  const id = String(ctx.params['id']);
  if (!isUuid(id)) return notFound();
  const row: unknown = await em.findOne(classOf(em, Notification.name), { id, userId: meOf(ctx) });
  return typeof row === 'object' && row !== null ? row : notFound();
}

const byId = { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } as const;
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

export const routes: readonly RouteDef[] = [
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
  defineRoute({
    method: 'POST',
    url: '/api/v1/notifications/send',
    // Its own permission, mapped to no action of the entity: a scoped permission of the person (delete-own) covers an entity
    // permission such as notifications.manage at the level of a route, where no condition applies.
    permission: 'notifications.send',
    idempotent: true,
    schema: {
      body: {
        type: 'object',
        properties: {
          to: {
            anyOf: [
              { type: 'string', format: 'uuid' },
              { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 100 },
              {
                type: 'object',
                properties: { role: { type: 'string', minLength: 1, maxLength: 120 } },
                required: ['role'],
                additionalProperties: false,
              },
            ],
          },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          body: { type: 'string', maxLength: 5000 },
          level: { type: 'string', enum: [...LEVELS] },
          category: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,59}$' },
          link: { type: 'string', minLength: 1, maxLength: 500 },
          channels: { type: 'array', items: { type: 'string', enum: [...CHANNELS] }, minItems: 1 },
          dedupeKey: { type: 'string', minLength: 1, maxLength: 200 },
        },
        required: ['to', 'title'],
        additionalProperties: false,
      },
      response: {
        202: {
          type: 'object',
          properties: { created: { type: 'integer' }, queued: { type: 'boolean' } },
          required: ['created', 'queued'],
        },
      },
    },
    async handler(ctx) {
      // The schema checked every field; the body is the input of the notifier, with the tenant of the request for a role.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const body = ctx.body as SendInput & { readonly level?: Level; readonly channels?: readonly Channel[] };
      const to =
        typeof body.to === 'object' && !Array.isArray(body.to) && 'role' in body.to
          ? { role: body.to.role, ...(ctx.tenantId === undefined ? {} : { tenantId: ctx.tenantId }) }
          : body.to;
      const result = await ctx.services.notifier.send({ ...body, to });
      ctx.status(202);
      return result;
    },
  }),
];
