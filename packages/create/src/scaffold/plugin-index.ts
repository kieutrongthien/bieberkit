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
      env: ['MEDIA_ALLOWED_TYPES', 'MEDIA_MAX_SIZE_MB', 'MEDIA_PENDING_TTL_HOURS', 'MEDIA_TENANT_QUOTA_MB'],
      tables: ['bk_media', 'bk_media_folders'],
      routes: [
        'DELETE /api/v1/media/folders/:id',
        'DELETE /api/v1/media/media/:id',
        'GET /api/v1/media/folders',
        'GET /api/v1/media/media',
        'GET /api/v1/media/media/:id',
        'GET /api/v1/media/media/:id/content',
        'GET /api/v1/media/media/:id/url',
        'PATCH /api/v1/media/folders/:id',
        'PATCH /api/v1/media/media/:id',
        'POST /api/v1/media/folders',
        'POST /api/v1/media/media',
        'POST /api/v1/media/media/:id/confirm',
        'POST /api/v1/media/media/:id/upload-url',
      ],
      permissions: ['media.manage', 'media.read', 'media.upload'],
      admin: [],
    },
    envRows: [
      {
        key: 'MEDIA_MAX_SIZE_MB',
        type: 'int',
        required: false,
        default: '25',
        secret: false,
        description: 'The largest file, in MB, checked before a signed upload URL is given (MED-07)',
      },
      {
        key: 'MEDIA_ALLOWED_TYPES',
        type: 'custom',
        required: false,
        default:
          'image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation',
        secret: false,
        description:
          'The MIME types that may be uploaded (MED-07). Defaults to images, PDF, text, CSV and Office files',
        expected: 'a comma-separated list of MIME types',
      },
      {
        key: 'MEDIA_TENANT_QUOTA_MB',
        type: 'int',
        required: false,
        secret: false,
        description: 'The MB of files that one tenant may hold. No quota when unset (MED-07)',
      },
      {
        key: 'MEDIA_PENDING_TTL_HOURS',
        type: 'int',
        required: false,
        default: '24',
        secret: false,
        description: 'Hours that a file may wait for its upload before the prune job deletes it (MED-03)',
      },
    ],
  },
  '@bieberkit/plugin-notifications': {
    version: '0.2.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: ['NOTIFICATIONS_RETENTION_DAYS'],
      tables: ['bk_notification_preferences', 'bk_notifications'],
      routes: [
        'DELETE /api/v1/notifications/me/:id',
        'GET /api/v1/notifications/me',
        'GET /api/v1/notifications/me/preferences',
        'GET /api/v1/notifications/me/unread-count',
        'POST /api/v1/notifications/me/:id/read',
        'POST /api/v1/notifications/me/read-all',
        'POST /api/v1/notifications/send',
        'PUT /api/v1/notifications/me/preferences',
      ],
      permissions: ['notifications.manage', 'notifications.read', 'notifications.send'],
      admin: [],
    },
    envRows: [
      {
        key: 'NOTIFICATIONS_RETENTION_DAYS',
        type: 'int',
        required: false,
        default: '90',
        secret: false,
        description: 'Days that a read notification is kept before the prune job deletes it (NTF-05)',
      },
    ],
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
        'GET /api/v1/roles/roles/:id',
        'GET /api/v1/roles/roles/:id/members',
        'PATCH /api/v1/roles/roles/:id',
        'POST /api/v1/roles/roles',
        'POST /api/v1/roles/roles/:id/assign',
        'POST /api/v1/roles/roles/:id/duplicate',
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
      routes: [
        'DELETE /api/v1/settings/settings/:key',
        'GET /api/v1/settings/public',
        'GET /api/v1/settings/settings',
        'GET /api/v1/settings/settings/:key',
        'PUT /api/v1/settings/settings/:key',
      ],
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
      env: ['USERS_ADMIN_EMAIL', 'USERS_ADMIN_PASSWORD', 'USERS_INVITE_TTL_DAYS'],
      tables: [],
      routes: [
        'DELETE /api/v1/users/users/:id',
        'DELETE /api/v1/users/users/:id/sessions',
        'DELETE /api/v1/users/users/:id/sessions/:sessionId',
        'GET /api/v1/users/me',
        'GET /api/v1/users/users',
        'GET /api/v1/users/users/:id',
        'GET /api/v1/users/users/:id/permissions',
        'GET /api/v1/users/users/:id/sessions',
        'PATCH /api/v1/users/me',
        'PATCH /api/v1/users/users/:id',
        'POST /api/v1/users/users',
        'POST /api/v1/users/users/:id/disable',
        'POST /api/v1/users/users/:id/enable',
        'POST /api/v1/users/users/:id/mfa/reset',
        'POST /api/v1/users/users/:id/resend-invite',
        'POST /api/v1/users/users/:id/reset-password',
      ],
      permissions: ['users.manage', 'users.read', 'users.reset-mfa', 'users.revoke-sessions'],
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
      {
        key: 'USERS_INVITE_TTL_DAYS',
        type: 'int',
        required: false,
        default: '7',
        secret: false,
        description: 'Days that an invitation link lives (USR-10)',
      },
    ],
  },
};
