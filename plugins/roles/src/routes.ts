/**
 * BieberKit
 *
 * @file        plugins/roles/src/routes.ts
 * @description The routes of the roles plugin over the role service of auth: the list and the detail of roles, members, the catalogue of permissions, create, change, duplicate, delete with reassignment, and assign and revoke in batches (AUTHZ-01, AUTHZ-05, ROL-01 to ROL-08).
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

import {
  assignRoles,
  AuthRole,
  AuthRolePermission,
  createRole,
  deleteRole,
  duplicateRole,
  getRole,
  listMembers,
  NIL_TENANT,
  revokeRoles,
  setRolePermissions,
  updateRole,
} from '@bieberkit/auth';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { defineRoute } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';

const BASE = '/api/v1/roles';
const uuid = { type: 'string', format: 'uuid' } as const;
const permissions = { type: 'array', items: { type: 'string', minLength: 1, maxLength: 200 }, maxItems: 500 } as const;

const role = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    system: { type: 'boolean' },
    requireMfa: { type: 'boolean' },
    permissions,
  },
  required: ['id', 'name', 'system', 'requireMfa', 'permissions'],
} as const;

const results = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          result: { type: 'string', enum: ['assigned', 'revoked', 'unchanged', 'not_found', 'refused'] },
          code: { type: 'string' },
          warning: { type: 'string' },
        },
        required: ['userId', 'result'],
      },
    },
  },
  required: ['results'],
} as const;

const detail = {
  type: 'object',
  properties: { ...role.properties, memberCount: { type: 'integer' } },
  required: [...role.required, 'memberCount'],
} as const;

const byId = { type: 'object', properties: { id: uuid }, required: ['id'] } as const;

/** A permission split into the parts that a client groups by: `crm.deal.read` is module crm, resource deal, action read (ROL-04). */
function partsOf(name: string): { name: string; module: string; resource: string | null; action: string } {
  const parts = name.split('.');
  const module = parts[0] ?? name;
  const action = parts.length > 1 ? (parts.at(-1) ?? name) : name;
  const resource = parts.length > 2 ? parts.slice(1, -1).join('.') : null;
  return { name, module, resource, action };
}

const tenantOf = (ctx: RouteContext): string => ctx.tenantId ?? NIL_TENANT;
const field = (value: unknown, name: string): unknown => Reflect.get(Object(value), name);

async function rolesOf(ctx: RouteContext, id?: string): Promise<Record<string, unknown>[]> {
  return runInUnitOfWork(ctx.services.database, async (em) => {
    const found = await em.find(
      AuthRole,
      { tenant: tenantOf(ctx), ...(id === undefined ? {} : { id }) },
      { orderBy: { name: 'asc' } },
    );
    const grants = await em.find(AuthRolePermission, { roleId: { $in: found.map((row) => row.id) } });
    return found.map((row) => ({
      id: row.id,
      name: row.name,
      system: row.system,
      requireMfa: row.requireMfa,
      permissions: grants
        .filter((grant) => grant.roleId === row.id)
        .map((grant) => grant.permission)
        .toSorted((a, b) => a.localeCompare(b)),
    }));
  });
}

export const routes: readonly RouteDef[] = [
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
  defineRoute({
    method: 'POST',
    url: `${BASE}/roles`,
    permission: 'roles.manage',
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          permissions,
          requireMfa: { type: 'boolean' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      response: { 201: role },
    },
    async handler(ctx) {
      const id = await createRole(ctx.services.database, {
        tenantId: tenantOf(ctx),
        name: String(field(ctx.body, 'name')),
        permissions: toList(field(ctx.body, 'permissions')),
        requireMfa: field(ctx.body, 'requireMfa') === true,
      });
      ctx.status(201);
      return (await rolesOf(ctx, id))[0];
    },
  }),
  defineRoute({
    method: 'PATCH',
    url: `${BASE}/roles/:id`,
    permission: 'roles.manage',
    schema: {
      params: { type: 'object', properties: { id: uuid }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          permissions,
          requireMfa: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      response: { 200: role },
    },
    async handler(ctx) {
      const id = String(ctx.params['id']);
      const { database } = ctx.services;
      const name = field(ctx.body, 'name');
      const requireMfa = field(ctx.body, 'requireMfa');
      if (typeof name === 'string' || typeof requireMfa === 'boolean') {
        await updateRole(database, id, {
          ...(typeof name === 'string' ? { name } : {}),
          ...(typeof requireMfa === 'boolean' ? { requireMfa } : {}),
        });
      }
      const wanted = field(ctx.body, 'permissions');
      if (wanted !== undefined) await setRolePermissions(database, id, toList(wanted));
      return (await rolesOf(ctx, id))[0];
    },
  }),
  defineRoute({
    method: 'POST',
    url: `${BASE}/roles/:id/duplicate`,
    permission: 'roles.manage',
    schema: {
      params: byId,
      body: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
        required: ['name'],
        additionalProperties: false,
      },
      response: { 201: role },
    },
    async handler(ctx) {
      const source = await getRole(ctx.services.database, String(ctx.params['id']), { tenantId: tenantOf(ctx) });
      const id = await duplicateRole(ctx.services.database, source.id, { name: String(field(ctx.body, 'name')) });
      ctx.status(201);
      return (await rolesOf(ctx, id))[0];
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/roles/:id`,
    permission: 'roles.manage',
    schema: {
      params: byId,
      query: {
        type: 'object',
        properties: { reassignTo: uuid },
        additionalProperties: false,
      },
      response: { 204: { type: 'null' } },
    },
    async handler(ctx) {
      const id = String(ctx.params['id']);
      await getRole(ctx.services.database, id, { tenantId: tenantOf(ctx) });
      const reassignTo = ctx.query['reassignTo'];
      await deleteRole(ctx.services.database, id, typeof reassignTo === 'string' ? { reassignTo } : {});
      ctx.status(204);
      return undefined;
    },
  }),
  ...(['assign', 'revoke'] as const).map((verb) =>
    defineRoute({
      method: 'POST',
      url: `${BASE}/roles/:id/${verb}`,
      permission: 'roles.manage',
      schema: {
        params: byId,
        body: {
          type: 'object',
          properties: { userIds: { type: 'array', items: uuid, minItems: 1, maxItems: 100 } },
          required: ['userIds'],
          additionalProperties: false,
        },
        response: { 200: results },
      },
      handler(ctx) {
        const input = {
          tenantId: tenantOf(ctx),
          roleId: String(ctx.params['id']),
          userIds: toList(field(ctx.body, 'userIds')),
        };
        return verb === 'assign'
          ? assignRoles(ctx.services.database, input)
          : revokeRoles(ctx.services.database, input);
      },
    }),
  ),
];

function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
