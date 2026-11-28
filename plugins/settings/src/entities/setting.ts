/**
 * BieberKit
 *
 * @file        plugins/settings/src/entities/setting.ts
 * @description The stored value of a setting, for one scope and key.
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

/**
 * One stored value. `scope` is the nil tenant for a global value and the tenant for a tenant value, so the framework's tenant filter is
 * not used: a read in a tenant needs the global row too (SET-04). `value` is JSON text; a secret is in `secretValue`, encrypted (SET-03).
 * There are no generated routes: the routes of the plugin are the one way to write (SET-02).
 */
export const Setting: EntityDef<'settings.Setting'> = defineEntity({
  name: 'settings.Setting',
  table: 'bk_settings',
  fields: {
    id: f.id(),
    scope: f.string({ min: 36, max: 36 }),
    key: f.string({ min: 1, max: 120 }),
    value: f.text({ max: 10_000 }).optional(),
    secretValue: f.text({ max: 20_000 }).optional().encrypted(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'settings.read',
    create: 'settings.manage',
    update: 'settings.manage',
    delete: 'settings.manage',
  },
  label: { en: 'Setting' },
  orm: { uniques: [{ properties: ['scope', 'key'], name: 'bk_settings_scope_key_uq' }] },
});
