/**
 * BieberKit
 *
 * @file        plugins/notifications/src/index.ts
 * @description The notifications plugin: the tables, the notifier service that other plugins send with, the routes of the signed-in person and of support, preferences, and the jobs that expand a role and prune old notifications (NTF-01 to NTF-07).
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

import { definePlugin, env } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import type { ScopedPermission } from '@bieberkit/auth';
import { Notification, Preference } from './entity.ts';
import { createNotifier, expandJob, pruneJob, subscriptions } from './notifier.ts';
import type { Notifier } from './notifier.ts';
import { routes } from './routes.ts';

export { Notification, Preference } from './entity.ts';
export { expandJob, pruneJob } from './notifier.ts';
export type { Channel, Level, Notifier, SendInput, SendResult } from './notifier.ts';

declare module '@bieberkit/core' {
  interface ServiceRegistry {
    /** Sends a notification in the transaction of the caller (NTF-01). */
    notifier: Notifier;
  }
}

/** What a user may do with their own notifications. The routes of the person also filter by the user of the request. */
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
  'notifications.delete-own': {
    subject: 'notifications.Notification',
    action: 'delete',
    when: (user) => ({ userId: user.id }),
  },
};

import pkg from '../package.json' with { type: 'json' };

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-notifications',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  env: {
    NOTIFICATIONS_RETENTION_DAYS: env
      .int({ min: 1, max: 3650 })
      .default(90)
      .describe('Days that a read notification is kept before the prune job deletes it (NTF-05)'),
  },
  permissions: ['notifications.read', 'notifications.manage', 'notifications.send'],
  entities: [Notification, Preference],
  routes,
  jobs: [expandJob, pruneJob],
  subscriptions,
  schedules: [{ job: pruneJob, cron: '17 3 * * *' }],
  scopedPermissions,
  services: {
    notifier: {
      scope: 'singleton',
      deps: ['database', 'mail', 'pluginEnv'],
      create: (services) => {
        const days = services.pluginEnv['NOTIFICATIONS_RETENTION_DAYS'];
        return createNotifier({
          db: services.database,
          mail: services.mail,
          retentionDays: typeof days === 'number' ? days : 90,
        });
      },
    },
  },
});

export default plugin;
