/**
 * BieberKit
 *
 * @file        plugins/media/src/entities/folder.ts
 * @description The folder of the media library, and how deep folders may go.
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
import { PERMISSIONS } from './permissions.ts';

/** The deepest a folder may be: a folder at the root has depth 1 (MED-05). */
export const MAX_DEPTH = 8;

/**
 * A folder of a tenant. `parentKey` is the parent's id, or the nil uuid at the root, because a NULL is never equal to another in a unique
 * index: with it, a name is unique inside its parent on every dialect.
 */
export const Folder: EntityDef<'media.Folder'> = defineEntity({
  name: 'media.Folder',
  table: 'bk_media_folders',
  tenant: true,
  fields: {
    id: f.id(),
    parentId: f.string({ min: 36, max: 36 }).optional(),
    parentKey: f.string({ min: 36, max: 36 }),
    name: f.string({ min: 1, max: 120 }),
    depth: f.int({ min: 1, max: MAX_DEPTH }),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: PERMISSIONS,
  label: { en: 'Media folder' },
  admin: { title: 'name', list: ['name', 'depth', 'createdAt'], icon: 'folder' },
  orm: { uniques: [{ properties: ['tenantId', 'parentKey', 'name'], name: 'bk_media_folders_name_uq' }] },
});
