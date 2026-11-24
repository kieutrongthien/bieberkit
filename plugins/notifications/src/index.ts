/**
 * BieberKit
 *
 * @file        plugins/notifications/src/index.ts
 * @description The notifications plugin: a title, a text and a read time for a user, read and marked as read by the user alone (read-own and update-own), and managed by an administrator.
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

import { definePlugin } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import type { ScopedPermission } from '@bieberkit/auth';
import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';

/** A notification for one user. `userId` is the id of the user in `bk_auth_users`. */
export const Notification: EntityDef<'notifications.Notification'> = defineEntity({
  name: 'notifications.Notification',
  table: 'bk_notifications',
  fields: {
    id: f.id(),
    userId: f.string({ min: 36, max: 36 }).index(),
    title: f.string({ min: 1, max: 200 }),
    body: f.text({ max: 5000 }).optional(),
    readAt: f.dateTime().optional(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'notifications.read',
    create: 'notifications.manage',
    update: 'notifications.update',
    delete: 'notifications.manage',
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
  label: { en: 'Notification' },
  admin: { title: 'title', list: ['title', 'userId', 'readAt', 'createdAt'], icon: 'bell' },
});

/** What a user may do with his own notifications: read them and mark them as read. The condition is the user of the request. */
export const scopedPermissions: Readonly<Record<string, ScopedPermission>> = {
  'notifications.read-own': {
    subject: 'notifications.Notification',
    action: 'read',
    when: (user) => ({ userId: user.id }),
  },
  'notifications.update-own': {
    subject: 'notifications.Notification',
    action: 'update',
    when: (user) => ({ userId: user.id }),
  },
};

import pkg from '../package.json' with { type: 'json' };

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-notifications',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['notifications.read', 'notifications.manage', 'notifications.update'],
  entities: [Notification],
  scopedPermissions,
});

export default plugin;
