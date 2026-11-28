/**
 * BieberKit
 *
 * @file        plugins/media/src/services/views.ts
 * @description How a row of the media library is answered, and the pages and cursors of a list.
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

import { decodeCursor, encodeCursor } from '@bieberkit/data';
import { read } from './records.ts';
import type { FolderView, MediaView, Page } from './types.ts';

const textOf = (row: unknown, name: string): string | null => {
  const value = read(row, name);
  return typeof value === 'string' ? value : null;
};

const iso = (value: unknown): string =>
  value instanceof Date || typeof value === 'string' || typeof value === 'number' ? new Date(value).toISOString() : '';

export function viewOf(row: unknown): MediaView {
  return {
    id: String(read(row, 'id')),
    filename: String(read(row, 'filename')),
    contentType: String(read(row, 'contentType')),
    kind: String(read(row, 'kind')),
    size: Number(read(row, 'size')),
    status: String(read(row, 'status')),
    visibility: String(read(row, 'visibility')),
    alt: textOf(row, 'alt'),
    description: textOf(row, 'description'),
    folderId: textOf(row, 'folderId'),
    checksum: textOf(row, 'checksum'),
    createdAt: iso(read(row, 'createdAt')),
    updatedAt: iso(read(row, 'updatedAt')),
  };
}

export function folderViewOf(row: unknown): FolderView {
  return {
    id: String(read(row, 'id')),
    name: String(read(row, 'name')),
    parentId: textOf(row, 'parentId'),
    depth: Number(read(row, 'depth')),
    createdAt: iso(read(row, 'createdAt')),
  };
}

/** The `!` escape of LIKE: one character that every dialect accepts in `escape '!'`. */
export const likePrefix = (text: string): string => `${text.replaceAll(/[!%_]/g, (found) => `!${found}`)}%`;

/** The first and the last UUIDv7 of a millisecond, so a range of creation is a range of ids (as the users list does). */
export function idAt(ms: number, last: boolean): string {
  const hex = Math.max(0, Math.min(ms, 0xffff_ffff_ffff)).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${last ? '7fff-bfff-ffffffffffff' : '7000-8000-000000000000'}`;
}

export function page<T>(rows: unknown[], size: number, view: (row: unknown) => T, total: number | undefined): Page<T> {
  const shown = rows.slice(0, size);
  const last = shown.at(-1);
  return {
    data: shown.map(view),
    meta: {
      pageSize: size,
      nextCursor: rows.length > size && last !== undefined ? encodeCursor([String(read(last, 'id'))]) : null,
      ...(total === undefined ? {} : { total }),
    },
  };
}

export const cursorOf = (cursor: string | undefined): string | undefined =>
  cursor === undefined || cursor === '' ? undefined : String(decodeCursor(cursor)[0]);
