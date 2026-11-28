/**
 * BieberKit
 *
 * @file        plugins/roles/src/routes/write.ts
 * @description The routes that create, change, copy and delete a role (ROL-03 to ROL-06).
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
import { createRole, deleteRole, duplicateRole, getRole, setRolePermissions, updateRole } from '@bieberkit/auth';
import { BASE, byId, field, permissions, role, rolesOf, tenantOf, toList, uuid } from './shared.ts';

export const writeRoutes: readonly RouteDef[] = [
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
          ipRestricted: { type: 'boolean' },
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
        ipRestricted: field(ctx.body, 'ipRestricted') === true,
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
          ipRestricted: { type: 'boolean' },
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
      const ipRestricted = field(ctx.body, 'ipRestricted');
      const wanted = field(ctx.body, 'permissions');
      // A system role refuses permissions, so they go first for it: a request that is refused writes nothing, and not the
      // `requireMfa` that it would have taken (ROL-06).
      if (wanted !== undefined && (await getRole(database, id)).system)
        await setRolePermissions(database, id, toList(wanted));
      if (typeof name === 'string' || typeof requireMfa === 'boolean' || typeof ipRestricted === 'boolean') {
        await updateRole(database, id, {
          ...(typeof name === 'string' ? { name } : {}),
          ...(typeof requireMfa === 'boolean' ? { requireMfa } : {}),
          ...(typeof ipRestricted === 'boolean' ? { ipRestricted } : {}),
        });
      }
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
    idempotent: true,
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
];
