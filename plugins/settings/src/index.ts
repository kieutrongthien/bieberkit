/**
 * BieberKit
 *
 * @file        plugins/settings/src/index.ts
 * @description The settings plugin: a key and a value stored in the database, read and changed through the API and the admin, with their own permissions.
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
import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';

/** One setting of the application: a key that is unique and a value as text (JSON when it holds more than a word). */
export const Setting: EntityDef<'settings.Setting'> = defineEntity({
  name: 'settings.Setting',
  table: 'settings_settings',
  fields: {
    id: f.id(),
    key: f.string({ min: 1, max: 120 }).unique(),
    value: f.text({ max: 10_000 }),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'settings.read',
    create: 'settings.manage',
    update: 'settings.manage',
    delete: 'settings.manage',
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
  label: { en: 'Setting' },
  admin: { title: 'key', list: ['key', 'value', 'updatedAt'], icon: 'setting' },
});

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-settings',
  version: '0.1.0',
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['settings.read', 'settings.manage'],
  entities: [Setting],
});

export default plugin;
