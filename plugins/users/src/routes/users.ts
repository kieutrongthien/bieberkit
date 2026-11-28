/**
 * BieberKit
 *
 * @file        plugins/users/src/routes/users.ts
 * @description The routes that list, read, create and change users and their groups (USR-02 to USR-05).
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

import type { UserListQuery, UserSort, UserStatus } from '@bieberkit/auth';
import { defineRoute } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';
import {
  BASE,
  actorOf,
  byId,
  detail,
  field,
  groupsSchema,
  idOf,
  lookupOf,
  overridesExternal,
  record,
  required,
  tenantOf,
  usersOf,
  uuid,
} from './shared.ts';

const user = { type: 'object', properties: record, required } as const;

const STATUSES: readonly UserStatus[] = ['active', 'disabled', 'invited'];

const SORTS: readonly UserSort[] = ['createdAt', '-createdAt', 'name', '-name', 'email', '-email'];

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function listQuery(ctx: RouteContext): UserListQuery {
  const query = ctx.query;
  const status = STATUSES.find((value) => value === query['status']);
  const sort = SORTS.find((value) => value === query['sort']);
  const out: Record<string, unknown> = { ...tenantOf(ctx) };
  for (const name of ['q', 'role', 'createdFrom', 'createdTo', 'cursor'] as const) {
    const value = text(query[name]);
    if (value !== undefined) out[name] = value;
  }
  if (status !== undefined) out['status'] = status;
  if (sort !== undefined) out['sort'] = sort;
  if (typeof query['emailVerified'] === 'boolean') out['emailVerified'] = query['emailVerified'];
  if (query['pageSize'] !== undefined) out['pageSize'] = query['pageSize'];
  if (query['withTotal'] === true) out['withTotal'] = true;
  return out;
}

export const userRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: BASE,
    permission: 'users.read',
    schema: {
      query: {
        type: 'object',
        properties: {
          q: { type: 'string', maxLength: 254 },
          role: uuid,
          status: { type: 'string', enum: [...STATUSES] },
          emailVerified: { type: 'boolean' },
          createdFrom: { type: 'string', format: 'date-time' },
          createdTo: { type: 'string', format: 'date-time' },
          sort: { type: 'string', enum: [...SORTS] },
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
            data: { type: 'array', items: user },
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
      const { groupIds } = await lookupOf(ctx);
      const page = await usersOf(ctx).list({ ...listQuery(ctx), ...(groupIds === undefined ? {} : { groupIds }) });
      return {
        data: page.data,
        meta: {
          pageSize: page.pageSize,
          nextCursor: page.nextCursor,
          ...(page.total === undefined ? {} : { total: page.total }),
        },
      };
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/:id`,
    permission: 'users.read',
    schema: { params: byId, response: { 200: detail } },
    async handler(ctx) {
      return usersOf(ctx).get(idOf(ctx), await lookupOf(ctx));
    },
  }),
  defineRoute({
    method: 'POST',
    url: BASE,
    permission: 'users.manage',
    idempotent: true,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 1024 },
          invite: { type: 'boolean' },
          roles: { type: 'array', items: uuid, maxItems: 100 },
          groups: groupsSchema,
        },
        required: ['name', 'email'],
        additionalProperties: false,
      },
      response: { 201: detail },
    },
    async handler(ctx) {
      const body = ctx.body;
      const password = text(field(body, 'password'));
      const roles = field(body, 'roles');
      const groups = field(body, 'groups');
      const { groupIds } = await lookupOf(ctx);
      const made = await usersOf(ctx).create({
        name: String(field(body, 'name')),
        email: String(field(body, 'email')),
        ...(password === undefined ? {} : { password }),
        ...(field(body, 'invite') === true ? { invite: true } : {}),
        ...(Array.isArray(roles) ? { roles: roles.map(String) } : {}),
        ...(Array.isArray(groups) ? { groups: groups.map(String) } : {}),
        ...(groupIds === undefined ? {} : { groupIds }),
        ...tenantOf(ctx),
        actorId: actorOf(ctx),
      });
      ctx.status(201);
      return made;
    },
  }),
  defineRoute({
    method: 'PATCH',
    url: `${BASE}/:id`,
    permission: 'users.manage',
    schema: {
      params: byId,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          email: { type: 'string', format: 'email', maxLength: 254 },
        },
        additionalProperties: false,
      },
      response: { 200: detail },
    },
    handler: async (ctx) => {
      const name = text(field(ctx.body, 'name'));
      const email = text(field(ctx.body, 'email'));
      await usersOf(ctx).get(idOf(ctx), await lookupOf(ctx));
      return usersOf(ctx).update({
        overrideExternal: await overridesExternal(ctx),
        userId: idOf(ctx),
        ...(name === undefined ? {} : { name }),
        ...(email === undefined ? {} : { email }),
        ...tenantOf(ctx),
        actorId: actorOf(ctx),
      });
    },
  }),
  defineRoute({
    method: 'PUT',
    url: `${BASE}/:id/groups`,
    permission: 'users.manage',
    schema: {
      params: byId,
      body: { type: 'object', properties: { groups: groupsSchema }, required: ['groups'], additionalProperties: false },
      response: { 200: detail },
    },
    async handler(ctx) {
      const { groupIds } = await lookupOf(ctx);
      const groups = field(ctx.body, 'groups');
      return usersOf(ctx).setGroups({
        userId: idOf(ctx),
        groups: Array.isArray(groups) ? groups.map(String) : [],
        ...(groupIds === undefined ? {} : { groupIds }),
        actorId: actorOf(ctx),
      });
    },
  }),
];
