/**
 * BieberKit
 *
 * @file        plugins/roles/src/routes.ts
 * @description The routes of the roles plugin: the list of roles with their permissions, the catalogue of permissions, create, change, delete, assign and revoke, over the role service of auth (AUTHZ-01, AUTHZ-05).
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
  assignRole,
  AuthRole,
  AuthRolePermission,
  createRole,
  deleteRole,
  NIL_TENANT,
  revokeRole,
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

const done = {
  type: 'object',
  properties: { changed: { type: 'boolean' } },
  required: ['changed'],
} as const;

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
    url: `${BASE}/permissions`,
    permission: 'roles.read',
    schema: {
      response: {
        200: { type: 'object', properties: { data: { type: 'array', items: { type: 'string' } } }, required: ['data'] },
      },
    },
    handler: (ctx) => ({ data: [...ctx.services.permissions] }),
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
    method: 'DELETE',
    url: `${BASE}/roles/:id`,
    permission: 'roles.manage',
    schema: {
      params: { type: 'object', properties: { id: uuid }, required: ['id'] },
      response: { 204: { type: 'null' } },
    },
    async handler(ctx) {
      await deleteRole(ctx.services.database, String(ctx.params['id']));
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
        params: { type: 'object', properties: { id: uuid }, required: ['id'] },
        body: {
          type: 'object',
          properties: { userId: uuid },
          required: ['userId'],
          additionalProperties: false,
        },
        response: { 200: done },
      },
      async handler(ctx) {
        const input = {
          tenantId: tenantOf(ctx),
          roleId: String(ctx.params['id']),
          userId: String(field(ctx.body, 'userId')),
        };
        const changed =
          verb === 'assign'
            ? await assignRole(ctx.services.database, input)
            : await revokeRole(ctx.services.database, input);
        return { changed };
      },
    }),
  ),
];

function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
