/**
 * BieberKit
 *
 * @file        plugins/roles/src/routes/read.ts
 * @description The routes that list and read roles, their members and the permissions of the project (ROL-01, ROL-02).
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
import { getRole, listMembers } from '@bieberkit/auth';
import { BASE, byId, role, rolesOf, tenantOf } from './shared.ts';

const detail = {
  type: 'object',
  properties: { ...role.properties, memberCount: { type: 'integer' } },
  required: [...role.required, 'memberCount'],
} as const;

/** A permission split into the parts that a client groups by: `crm.deal.read` is module crm, resource deal, action read (ROL-04). */
function partsOf(name: string): { name: string; module: string; resource: string | null; action: string } {
  const parts = name.split('.');
  const module = parts[0] ?? name;
  const action = parts.length > 1 ? (parts.at(-1) ?? name) : name;
  const resource = parts.length > 2 ? parts.slice(1, -1).join('.') : null;
  return { name, module, resource, action };
}

export const readRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: `${BASE}/roles`,
    permission: 'roles.read',
    schema: {
      response: { 200: { type: 'object', properties: { data: { type: 'array', items: role } }, required: ['data'] } },
    },
    handler: async (ctx) => ({ data: await rolesOf(ctx) }),
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/roles/:id`,
    permission: 'roles.read',
    schema: { params: byId, response: { 200: detail } },
    handler: (ctx) => getRole(ctx.services.database, String(ctx.params['id']), { tenantId: tenantOf(ctx) }),
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/roles/:id/members`,
    permission: 'roles.read',
    schema: {
      params: byId,
      query: {
        type: 'object',
        properties: { pageSize: { type: 'integer', minimum: 1 }, cursor: { type: 'string', maxLength: 1024 } },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } },
                required: ['id', 'name', 'email'],
              },
            },
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
      const page = await listMembers(ctx.services.database, String(ctx.params['id']), {
        tenantId: tenantOf(ctx),
        ...(ctx.query['pageSize'] === undefined ? {} : { pageSize: ctx.query['pageSize'] }),
        ...(typeof cursor === 'string' ? { cursor } : {}),
      });
      return { data: page.data, meta: { pageSize: page.pageSize, nextCursor: page.nextCursor } };
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/permissions`,
    permission: 'roles.read',
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  module: { type: 'string' },
                  resource: { type: ['string', 'null'] },
                  action: { type: 'string' },
                },
                required: ['name', 'module', 'resource', 'action'],
              },
            },
          },
          required: ['data'],
        },
      },
    },
    handler: (ctx) => ({ data: ctx.services.permissions.map(partsOf) }),
  }),
];
