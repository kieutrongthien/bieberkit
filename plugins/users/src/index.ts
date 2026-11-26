/**
 * BieberKit
 *
 * @file        plugins/users/src/index.ts
 * @description The users plugin: the routes of the life of an account over the user service, its permissions and config, and the seed of the administrator account with the administrator role from USERS_ADMIN_EMAIL and USERS_ADMIN_PASSWORD (AUTH-04, USR-01 to USR-12, spec section 12).
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

import { ADMIN_ROLE_NAME, assignRole, AuthRole, AuthUser, NIL_TENANT } from '@bieberkit/auth';
import { definePlugin, env } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { routes } from './routes.ts';

export { routes } from './routes.ts';

import pkg from '../package.json' with { type: 'json' };

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-users',
  version: pkg.version,
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
    USERS_INVITE_TTL_DAYS: env
      .int({ min: 1, max: 30 })
      .default(7)
      .describe('Days that an invitation link lives (USR-10)'),
  },
  permissions: ['users.read', 'users.manage', 'users.revoke-sessions', 'users.reset-mfa'],
  routes,
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
      em.findOne(AuthRole, { tenant: NIL_TENANT, name: ADMIN_ROLE_NAME }),
    );
    if (role !== null) await assignRole(database, { userId: id, roleId: role.id });
  },
});

export default plugin;
