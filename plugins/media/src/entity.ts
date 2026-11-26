/**
 * BieberKit
 *
 * @file        plugins/media/src/entity.ts
 * @description The entities of the media plugin: a file record of a tenant with fixed visibility, and the folders that hold files (MED-01, MED-04, MED-05).
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

export const KINDS: readonly string[] = ['image', 'video', 'audio', 'document', 'other'];
export const STATUSES: readonly string[] = ['pending', 'ready', 'rejected'];
export const VISIBILITIES: readonly string[] = ['private', 'public'];
/** The deepest a folder may be: a folder at the root has depth 1 (MED-05). */
export const MAX_DEPTH = 8;

const PERMISSIONS = {
  read: 'media.read',
  create: 'media.upload',
  update: 'media.manage',
  delete: 'media.manage',
} as const;

/**
 * One file of a tenant. The name, the size and the visibility are fixed when the record is made; confirm replaces the declared type with
 * the type the storage verified (S-06), and fills the kind and the checksum. The routes are those of the plugin, not generated ones.
 */
export const Media: EntityDef<'media.Media'> = defineEntity({
  name: 'media.Media',
  table: 'bk_media',
  tenant: true,
  features: ['tags'],
  fields: {
    id: f.id(),
    filename: f.string({ min: 1, max: 200 }),
    /** The filename in lower case, for the prefix search of `q` (MED-06). */
    nameKey: f.string({ min: 1, max: 200 }).index(),
    contentType: f.string({ min: 3, max: 120 }),
    kind: f.oneOf(KINDS).default('other').index(),
    size: f.int({ min: 1 }),
    status: f.oneOf(STATUSES).default('pending').index(),
    visibility: f.oneOf(VISIBILITIES).default('private'),
    alt: f.string({ min: 1, max: 500 }).optional(),
    description: f.text({ max: 2000 }).optional(),
    folderId: f.string({ min: 36, max: 36 }).optional().index(),
    /** The SHA-256 of the bytes, in hex, computed on confirm (MED-04). */
    checksum: f.string({ min: 64, max: 64 }).optional(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: PERMISSIONS,
  label: { en: 'Media' },
  admin: {
    title: 'filename',
    list: ['filename', 'kind', 'size', 'status', 'visibility', 'createdAt'],
    icon: 'picture',
  },
});

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
