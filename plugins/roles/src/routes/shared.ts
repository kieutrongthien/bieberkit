/**
 * BieberKit
 *
 * @file        plugins/roles/src/routes/shared.ts
 * @description What the routes of the roles share: their schemas and how a role and the tenant of a request are read.
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

import type { JsonSchema } from '@bieberkit/data/schema';
import type { RouteContext } from '@bieberkit/http';
import { AuthRole, AuthRolePermission, NIL_TENANT } from '@bieberkit/auth';
import { runInUnitOfWork } from '@bieberkit/data/orm';

/** A schema of an object whose parts another schema takes over. */
export type ObjectSchema = {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required: readonly string[];
};

export const BASE = '/api/v1/roles';

export const uuid = { type: 'string', format: 'uuid' } as const;

export const permissions = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 200 },
  maxItems: 500,
} as const;

export const role: ObjectSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    system: { type: 'boolean' },
    requireMfa: { type: 'boolean' },
    ipRestricted: { type: 'boolean' },
    permissions,
  },
  required: ['id', 'name', 'system', 'requireMfa', 'ipRestricted', 'permissions'],
};

export const byId: JsonSchema = { type: 'object', properties: { id: uuid }, required: ['id'] };

export const tenantOf = (ctx: RouteContext): string => ctx.tenantId ?? NIL_TENANT;

export const field = (value: unknown, name: string): unknown => Reflect.get(Object(value), name);

export async function rolesOf(ctx: RouteContext, id?: string): Promise<Record<string, unknown>[]> {
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
      ipRestricted: row.ipRestricted,
      permissions: grants
        .filter((grant) => grant.roleId === row.id)
        .map((grant) => grant.permission)
        .toSorted((a, b) => a.localeCompare(b)),
    }));
  });
}

export function toList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
