/**
 * BieberKit
 *
 * @file        plugins/notifications/src/entity.ts
 * @description The tables of the notifications plugin: a notification for one user, with its level, category, link, data, dedupe key and expiry, and the preferences of a user by category and channel (NTF-02, NTF-04, NTF-07).
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

import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';

export const LEVELS: readonly string[] = ['info', 'success', 'warning', 'error'];
export const CHANNELS: readonly string[] = ['in-app', 'mail'];

/**
 * A notification for one user. `userId` is the id of the user in `bk_auth_users`. Support keeps only list, get and delete; creating goes
 * through the notifier (NTF-07). A dedupe key is unique for each user, and several notifications may have none (NTF-02).
 */
export const Notification: EntityDef<'notifications.Notification'> = defineEntity({
  name: 'notifications.Notification',
  table: 'bk_notifications',
  fields: {
    id: f.id(),
    userId: f.string({ min: 36, max: 36 }).index(),
    title: f.string({ min: 1, max: 200 }),
    body: f.text({ max: 5000 }).optional(),
    level: f.oneOf(LEVELS).default('info'),
    category: f.string({ min: 1, max: 60 }).default('general'),
    link: f.string({ min: 1, max: 500 }).optional(),
    data: f.text({ max: 10_000 }).optional(),
    dedupeKey: f.string({ min: 1, max: 200 }).optional(),
    readAt: f.dateTime().optional(),
    expiresAt: f.dateTime().optional(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'notifications.read',
    create: 'notifications.manage',
    update: 'notifications.manage',
    delete: 'notifications.manage',
  },
  api: { list: true, get: true, delete: true },
  label: { en: 'Notification' },
  admin: { title: 'title', list: ['title', 'userId', 'level', 'category', 'readAt', 'createdAt'], icon: 'bell' },
  orm: { uniques: [{ properties: ['userId', 'dedupeKey'], name: 'bk_notifications_user_dedupe_uq' }] },
});

/** A preference of a user: whether a category reaches a channel. A missing row is on (NTF-04). */
export const Preference: EntityDef<'notifications.Preference'> = defineEntity({
  name: 'notifications.Preference',
  table: 'bk_notification_preferences',
  fields: {
    id: f.id(),
    userId: f.string({ min: 36, max: 36 }),
    category: f.string({ min: 1, max: 60 }),
    channel: f.oneOf(CHANNELS),
    enabled: f.boolean(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'notifications.manage',
    create: 'notifications.manage',
    update: 'notifications.manage',
    delete: 'notifications.manage',
  },
  label: { en: 'Notification preference' },
  orm: {
    uniques: [{ properties: ['userId', 'category', 'channel'], name: 'bk_notification_preferences_uq' }],
  },
});
