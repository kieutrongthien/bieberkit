/**
 * BieberKit
 *
 * @file        plugins/roles/src/routes/assignments.ts
 * @description The routes that give a role to users and take it back (ROL-04).
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
import { assignRoles, revokeRoles } from '@bieberkit/auth';
import { BASE, byId, field, tenantOf, toList, uuid } from './shared.ts';

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

export const assignmentRoutes: readonly RouteDef[] = (['assign', 'revoke'] as const).map((verb) =>
  defineRoute({
    method: 'POST',
    url: `${BASE}/roles/:id/${verb}`,
    permission: 'roles.manage',
    idempotent: true,
    schema: {
      params: byId,
      body: {
        type: 'object',
        properties: {
          userIds: { type: 'array', items: uuid, minItems: 1, maxItems: 100 },
          // Limits the role to the users of this group (ROL-09). Only `assign` reads it.
          groupId: { type: 'string', minLength: 1, maxLength: 120 },
        },
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
        ...(typeof field(ctx.body, 'groupId') === 'string' ? { groupId: String(field(ctx.body, 'groupId')) } : {}),
      };
      return verb === 'assign' ? assignRoles(ctx.services.database, input) : revokeRoles(ctx.services.database, input);
    },
  }),
);
