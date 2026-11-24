/**
 * BieberKit
 *
 * @file        plugins/users/src/index.ts
 * @description The users plugin: lists the users, makes a user with a password, and seeds the administrator account with the administrator role from USERS_ADMIN_EMAIL and USERS_ADMIN_PASSWORD (AUTH-04, spec section 12).
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

import { assignRole, AuthRole, AuthUser, NIL_TENANT } from '@bieberkit/auth';
import { definePlugin, env } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import { recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { defineRoute, HttpError } from '@bieberkit/http';
import type { RouteDef } from '@bieberkit/http';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ADMIN_ROLE = 'admin';

const user = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    emailVerified: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'name', 'email', 'emailVerified', 'createdAt'],
} as const;

const field = (value: unknown, name: string): unknown => Reflect.get(Object(value), name);

/** The status that an error of Better Auth carries, when it carries one that a client may see. */
function statusOf(error: unknown): number | undefined {
  const status: unknown = field(error, 'statusCode');
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

export const listUsers: RouteDef = defineRoute({
  method: 'GET',
  url: '/api/v1/users/users',
  permission: 'users.read',
  schema: {
    query: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
        cursor: { type: 'string', maxLength: 64 },
        email: { type: 'string', maxLength: 254 },
      },
      additionalProperties: false,
    },
    response: {
      200: {
        type: 'object',
        properties: { data: { type: 'array', items: user }, nextCursor: { type: ['string', 'null'] } },
        required: ['data', 'nextCursor'],
      },
    },
  },
  async handler(ctx) {
    const limit = typeof ctx.query['limit'] === 'number' ? ctx.query['limit'] : DEFAULT_LIMIT;
    const cursor = typeof ctx.query['cursor'] === 'string' ? ctx.query['cursor'] : undefined;
    const email = typeof ctx.query['email'] === 'string' ? ctx.query['email'] : undefined;
    const rows = await runInUnitOfWork(ctx.services.database, (em) =>
      em.find(
        AuthUser,
        {
          ...(email === undefined ? {} : { email: email.toLowerCase() }),
          ...(cursor === undefined ? {} : { id: { $gt: cursor } }),
        },
        { orderBy: { id: 'asc' }, limit: limit + 1 },
      ),
    );
    const page = rows.slice(0, limit);
    return {
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.emailVerified,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  },
});

export const createUser: RouteDef = defineRoute({
  method: 'POST',
  url: '/api/v1/users/users',
  permission: 'users.manage',
  schema: {
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        email: { type: 'string', format: 'email', maxLength: 254 },
        password: { type: 'string', minLength: 1, maxLength: 128 },
      },
      required: ['name', 'email', 'password'],
      additionalProperties: false,
    },
    response: { 201: user },
  },
  async handler(ctx) {
    const { auth, database } = ctx.services;
    const body = {
      name: String(field(ctx.body, 'name')),
      email: String(field(ctx.body, 'email')),
      password: String(field(ctx.body, 'password')),
    };
    let made: { user: { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date } };
    try {
      made = await auth.api.signUpEmail({ body });
    } catch (error) {
      const status = statusOf(error);
      if (status === undefined) throw error;
      throw new HttpError(
        'USERS_CREATE_REFUSED',
        status === 422 ? 409 : status,
        typeof field(error, 'message') === 'string' ? String(field(error, 'message')) : 'The user was not created.',
        'Use another email, and a password that follows the rules of the project (12 characters or more).',
        {},
        error,
      );
    }
    await runInTransaction(database, async (em) => {
      recordAudit(em, {
        action: 'users.user.created',
        entity: 'authUser',
        recordId: made.user.id,
        data: { email: made.user.email },
      });
      await em.flush();
    });
    ctx.status(201);
    return {
      id: made.user.id,
      name: made.user.name,
      email: made.user.email,
      emailVerified: made.user.emailVerified,
      createdAt: new Date(made.user.createdAt).toISOString(),
    };
  },
});

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-users',
  version: '0.1.0',
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  requires: { '@bieberkit/plugin-roles': '*' },
  env: {
    USERS_ADMIN_EMAIL: env
      .string()
      .default('admin@example.com')
      .describe('Email of the administrator that the seed makes'),
    USERS_ADMIN_PASSWORD: env
      .string()
      .secret()
      .optional()
      .describe('Password of the administrator that the seed makes. Without it the seed makes no account'),
  },
  permissions: ['users.read', 'users.manage'],
  routes: [listUsers, createUser],
  /** Makes the administrator account and gives it the administrator role. It does nothing when the account has the role already. */
  async seed(services) {
    const { auth, database, pluginEnv } = services;
    const password = pluginEnv['USERS_ADMIN_PASSWORD'];
    if (typeof password !== 'string' || password === '') return;
    const configured = pluginEnv['USERS_ADMIN_EMAIL'];
    const email = (
      typeof configured === 'string' && configured !== '' ? configured : 'admin@example.com'
    ).toLowerCase();
    const found = await runInUnitOfWork(database, (em) => em.findOne(AuthUser, { email }));
    const id = found?.id ?? (await auth.api.signUpEmail({ body: { email, password, name: 'Administrator' } })).user.id;
    const role = await runInUnitOfWork(database, (em) =>
      em.findOne(AuthRole, { tenant: NIL_TENANT, name: ADMIN_ROLE }),
    );
    if (role !== null) await assignRole(database, { userId: id, roleId: role.id });
  },
});

export default plugin;
