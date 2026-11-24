/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/plugin-index.ts
 * @description Bundled first-party plugin manifests and environment descriptions generated from plugin packages (PLG-07).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @generated   pnpm manifests:write
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

import type { PluginIndex } from './templates.ts';

export const BUILTIN_PLUGIN_INDEX: PluginIndex = {
  '@bieberkit/plugin-audit-log': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: [],
      routes: ['GET /api/v1/audit-log/entries'],
      permissions: ['audit-log.read'],
      admin: [],
    },
  },
  '@bieberkit/plugin-media': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: ['bk_media'],
      routes: ['POST /api/v1/media/media/:id/confirm', 'POST /api/v1/media/media/:id/upload-url'],
      permissions: ['media.manage', 'media.read', 'media.upload'],
      admin: [],
    },
  },
  '@bieberkit/plugin-notifications': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: ['bk_notifications'],
      routes: [],
      permissions: ['notifications.manage', 'notifications.read', 'notifications.update'],
      admin: [],
    },
  },
  '@bieberkit/plugin-roles': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: [],
      routes: [
        'DELETE /api/v1/roles/roles/:id',
        'GET /api/v1/roles/permissions',
        'GET /api/v1/roles/roles',
        'PATCH /api/v1/roles/roles/:id',
        'POST /api/v1/roles/roles',
        'POST /api/v1/roles/roles/:id/assign',
        'POST /api/v1/roles/roles/:id/revoke',
      ],
      permissions: ['roles.manage', 'roles.read'],
      admin: [],
    },
  },
  '@bieberkit/plugin-settings': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: ['bk_settings'],
      routes: [],
      permissions: ['settings.manage', 'settings.read'],
      admin: [],
    },
  },
  '@bieberkit/plugin-users': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {
        '@bieberkit/plugin-roles': '*',
      },
      conflicts: [],
      env: ['USERS_ADMIN_EMAIL', 'USERS_ADMIN_PASSWORD'],
      tables: [],
      routes: ['GET /api/v1/users/users', 'POST /api/v1/users/users'],
      permissions: ['users.manage', 'users.read'],
      admin: [],
    },
    envRows: [
      {
        key: 'USERS_ADMIN_EMAIL',
        type: 'string',
        required: false,
        default: 'admin@example.com',
        secret: false,
        description: 'Email of the administrator that the seed makes',
      },
      {
        key: 'USERS_ADMIN_PASSWORD',
        type: 'string',
        required: false,
        secret: true,
        description: 'Password of the administrator that the seed makes. Without it the seed makes no account',
      },
    ],
  },
};
