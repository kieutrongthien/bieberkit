/**
 * BieberKit
 *
 * @file        plugins/notifications/src/entities/preference.ts
 * @description The preference of a person for a category and a channel.
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

export const CHANNELS: readonly string[] = ['in-app', 'mail'];

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
