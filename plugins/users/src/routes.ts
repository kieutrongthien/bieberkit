/**
 * BieberKit
 *
 * @file        plugins/users/src/routes.ts
 * @description The routes of the users plugin: thin handlers over the user service of auth for the list, the detail, create and invite, change, disable, delete, sessions, reset mails, MFA reset, effective permissions and the signed-in person (USR-01 to USR-12, ROL-05).
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

import { createUserService, effectivePermissions, manageScope } from '@bieberkit/auth';
import type { UserListQuery, UserService, UserSort, UserStatus } from '@bieberkit/auth';
import { defineRoute, HttpError } from '@bieberkit/http';
import type { RouteContext, RouteDef } from '@bieberkit/http';

const BASE = '/api/v1/users/users';
const DAY = 86_400;
const uuid = { type: 'string', format: 'uuid' } as const;
const byId = { type: 'object', properties: { id: uuid }, required: ['id'] } as const;
const role = {
  type: 'object',
  properties: { id: { type: 'string' }, name: { type: 'string' } },
  required: ['id', 'name'],
} as const;

const record = {
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
} as const;
const required = [
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
const user = { type: 'object', properties: record, required } as const;
const groupsSchema = { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 }, maxItems: 50 } as const;
const detail = {
  type: 'object',
  properties: { ...record, activeSessions: { type: 'integer' }, groups: groupsSchema },
  required: [...required, 'activeSessions', 'groups'],
} as const;
/** What `GET /users/me` adds: when a second factor is required and not yet set up, the time by which to enrol (POL-02). */
const me = {
  ...detail,
  properties: { ...detail.properties, mfaEnrolBy: { type: 'string' } },
} as const;
const accepted = { type: 'object', properties: {}, additionalProperties: false } as const;
const none = { type: 'null' } as const;

const STATUSES: readonly UserStatus[] = ['active', 'disabled', 'invited'];
const SORTS: readonly UserSort[] = ['createdAt', '-createdAt', 'name', '-name', 'email', '-email'];

const field = (value: unknown, name: string): unknown => Reflect.get(Object(value), name);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const services = new WeakMap<object, UserService>();

/** One service for each auth instance, so that its rate counters are shared by the requests. */
function usersOf(ctx: RouteContext): UserService {
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

const actorOf = (ctx: RouteContext): string | null => ctx.principal?.id ?? null;

/**
 * The signed-in person. `/me` needs no permission, only a principal, and API-02 makes a route without a permission public, so the
 * handler refuses an anonymous caller itself, with the answer of the server.
 */
function selfOf(ctx: RouteContext): string {
  const id = ctx.principal?.id;
  if (id === undefined) {
    throw new HttpError('HTTP_UNAUTHENTICATED', 401, 'Sign in to do this.', 'Send a valid session or API key.');
  }
  return id;
}
const tenantOf = (ctx: RouteContext): { tenantId?: string } =>
  ctx.tenantId === undefined ? {} : { tenantId: ctx.tenantId };
const idOf = (ctx: RouteContext): string => String(ctx.params['id']);

/**
 * The tenant, and the groups that limit the caller when a role of theirs was given for some groups only (ROL-09). The same lookup
 * that every by-id route does first, so a user outside the groups is `USERS_NOT_FOUND`.
 */
async function lookupOf(ctx: RouteContext): Promise<{ tenantId?: string; groupIds?: readonly string[] }> {
  const principal = ctx.principal;
  const groupIds =
    principal?.kind === 'user'
      ? await manageScope(ctx.services.database, { userId: principal.id, prefix: 'users.', tenantId: ctx.tenantId })
      : undefined;
  return { ...tenantOf(ctx), ...(groupIds === undefined ? {} : { groupIds }) };
}
/** Whether the caller may change a user that a provider manages (IDN-02). */
const overridesExternal = (ctx: RouteContext): Promise<boolean> => ctx.can('users.override-external');

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

const params = (
  properties: Record<string, unknown>,
): { type: 'object'; properties: Record<string, unknown>; required: string[] } => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});

export const routes: readonly RouteDef[] = [
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
  defineRoute({
    method: 'POST',
    url: `${BASE}/:id/disable`,
    permission: 'users.manage',
    schema: {
      params: byId,
      body: {
        type: 'object',
        properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
        required: ['reason'],
        additionalProperties: false,
      },
      response: { 200: detail },
    },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.disable({
        userId: idOf(ctx),
        reason: String(field(ctx.body, 'reason')),
        actorId: actorOf(ctx),
        overrideExternal: await overridesExternal(ctx),
      });
      return users.get(idOf(ctx), await lookupOf(ctx));
    },
  }),
  defineRoute({
    method: 'POST',
    url: `${BASE}/:id/enable`,
    permission: 'users.manage',
    schema: { params: byId, response: { 200: detail } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.enable({ userId: idOf(ctx), actorId: actorOf(ctx), overrideExternal: await overridesExternal(ctx) });
      return users.get(idOf(ctx), await lookupOf(ctx));
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:id`,
    permission: 'users.manage',
    schema: { params: byId, response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.remove({ userId: idOf(ctx), actorId: actorOf(ctx) });
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/:id/sessions`,
    permission: 'users.revoke-sessions',
    schema: {
      params: byId,
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  ipAddress: { type: ['string', 'null'] },
                  userAgent: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                  lastUsedAt: { type: 'string' },
                },
                required: ['id', 'ipAddress', 'userAgent', 'createdAt', 'lastUsedAt'],
              },
            },
          },
          required: ['data'],
        },
      },
    },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      return { data: await users.sessions(idOf(ctx)) };
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:id/sessions/:sessionId`,
    permission: 'users.revoke-sessions',
    schema: { params: params({ id: uuid, sessionId: uuid }), response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.revokeSession({
        userId: idOf(ctx),
        sessionId: String(ctx.params['sessionId']),
        actorId: actorOf(ctx),
      });
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'DELETE',
    url: `${BASE}/:id/sessions`,
    permission: 'users.revoke-sessions',
    schema: { params: byId, response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.revokeSessions({ userId: idOf(ctx), actorId: actorOf(ctx) });
      ctx.status(204);
      return undefined;
    },
  }),
  ...(
    [
      ['reset-password', 'users.manage', 'sendPasswordReset'],
      ['resend-invite', 'users.manage', 'resendInvite'],
    ] as const
  ).map(([path, permission, action]) =>
    defineRoute({
      method: 'POST',
      url: `${BASE}/:id/${path}`,
      permission,
      schema: { params: byId, response: { 202: accepted } },
      async handler(ctx) {
        const users = usersOf(ctx);
        await users.get(idOf(ctx), await lookupOf(ctx));
        await users[action]({ userId: idOf(ctx), actorId: actorOf(ctx) });
        ctx.status(202);
        return {};
      },
    }),
  ),
  defineRoute({
    method: 'POST',
    url: `${BASE}/:id/mfa/reset`,
    permission: 'users.reset-mfa',
    schema: { params: byId, response: { 204: none } },
    async handler(ctx) {
      const users = usersOf(ctx);
      await users.get(idOf(ctx), await lookupOf(ctx));
      await users.resetMfa({ userId: idOf(ctx), actorId: actorOf(ctx) });
      ctx.status(204);
      return undefined;
    },
  }),
  defineRoute({
    method: 'GET',
    url: `${BASE}/:id/permissions`,
    permission: 'users.read',
    schema: {
      params: byId,
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  permission: { type: 'string' },
                  roles: { type: 'array', items: role },
                  condition: { type: 'object', additionalProperties: true },
                },
                required: ['permission', 'roles'],
              },
            },
          },
          required: ['data'],
        },
      },
    },
    async handler(ctx) {
      await usersOf(ctx).get(idOf(ctx), await lookupOf(ctx));
      return { data: await effectivePermissions(ctx.services.database, { userId: idOf(ctx), ...tenantOf(ctx) }) };
    },
  }),
  defineRoute({
    method: 'GET',
    url: '/api/v1/users/me',
    public: true,
    schema: { response: { 200: me } },
    handler: async (ctx) => ({
      ...(await usersOf(ctx).get(selfOf(ctx), tenantOf(ctx))),
      ...(ctx.principal?.mfaEnrolBy === undefined ? {} : { mfaEnrolBy: ctx.principal.mfaEnrolBy }),
    }),
  }),
  defineRoute({
    method: 'PATCH',
    url: '/api/v1/users/me',
    public: true,
    schema: {
      body: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
        required: ['name'],
        additionalProperties: false,
      },
      response: { 200: detail },
    },
    handler: async (ctx) => {
      const id = selfOf(ctx);
      return usersOf(ctx).update({
        userId: id,
        name: String(field(ctx.body, 'name')),
        actorId: id,
        overrideExternal: await overridesExternal(ctx),
        ...tenantOf(ctx),
      });
    },
  }),
];
