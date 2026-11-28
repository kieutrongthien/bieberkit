/**
 * BieberKit
 *
 * @file        plugins/users/src/routes/shared.ts
 * @description What the routes of the users share: the schemas of a user and how the user service and the caller are read from a request.
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
import { createUserService, manageScope } from '@bieberkit/auth';
import type { UserService } from '@bieberkit/auth';
import type { RouteContext } from '@bieberkit/http';

/** A schema of an object whose parts another schema takes over. */
export type ObjectSchema = {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required: readonly string[];
};

export const BASE = '/api/v1/users/users';

const DAY = 86_400;

export const uuid = { type: 'string', format: 'uuid' } as const;

export const byId: JsonSchema = { type: 'object', properties: { id: uuid }, required: ['id'] };

export const role = {
  type: 'object',
  properties: { id: { type: 'string' }, name: { type: 'string' } },
  required: ['id', 'name'],
} as const;

export const record: Readonly<Record<string, JsonSchema>> = {
  id: { type: 'string' },
  name: { type: 'string' },
  email: { type: 'string' },
  emailVerified: { type: 'boolean' },
  status: { type: 'string', enum: ['active', 'disabled', 'invited'] },
  source: { type: 'string' },
  roles: { type: 'array', items: role },
  mfaEnabled: { type: 'boolean' },
  lastSignInAt: { type: ['string', 'null'] },
  createdAt: { type: 'string' },
};

export const required = [
  'id',
  'name',
  'email',
  'emailVerified',
  'status',
  'source',
  'roles',
  'mfaEnabled',
  'lastSignInAt',
  'createdAt',
] as const;

export const groupsSchema = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 120 },
  maxItems: 50,
} as const;

export const detail: ObjectSchema = {
  type: 'object',
  properties: { ...record, activeSessions: { type: 'integer' }, groups: groupsSchema },
  required: [...required, 'activeSessions', 'groups'],
};

export const none = { type: 'null' } as const;

export const field = (value: unknown, name: string): unknown => Reflect.get(Object(value), name);

const services = new WeakMap<object, UserService>();

/** One service for each auth instance, so that its rate counters are shared by the requests. */
export function usersOf(ctx: RouteContext): UserService {
  const { auth, database, pluginEnv } = ctx.services;
  let found = services.get(auth);
  if (found === undefined) {
    const days = pluginEnv['USERS_INVITE_TTL_DAYS'];
    found = createUserService({
      db: database,
      auth,
      ...(typeof days === 'number' ? { inviteTtlSeconds: days * DAY } : {}),
    });
    services.set(auth, found);
  }
  return found;
}

export const actorOf = (ctx: RouteContext): string | null => ctx.principal?.id ?? null;

export const tenantOf = (ctx: RouteContext): { tenantId?: string } =>
  ctx.tenantId === undefined ? {} : { tenantId: ctx.tenantId };

export const idOf = (ctx: RouteContext): string => String(ctx.params['id']);

/**
 * The tenant, and the groups that limit the caller when a role of theirs was given for some groups only (ROL-09). The same lookup
 * that every by-id route does first, so a user outside the groups is `USERS_NOT_FOUND`.
 */
export async function lookupOf(ctx: RouteContext): Promise<{ tenantId?: string; groupIds?: readonly string[] }> {
  const principal = ctx.principal;
  const groupIds =
    principal?.kind === 'user'
      ? await manageScope(ctx.services.database, { userId: principal.id, prefix: 'users.', tenantId: ctx.tenantId })
      : undefined;
  return { ...tenantOf(ctx), ...(groupIds === undefined ? {} : { groupIds }) };
}

/** Whether the caller may change a user that a provider manages (IDN-02). */
export const overridesExternal = (ctx: RouteContext): Promise<boolean> => ctx.can('users.override-external');
