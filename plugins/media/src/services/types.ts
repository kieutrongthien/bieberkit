/**
 * BieberKit
 *
 * @file        plugins/media/src/services/types.ts
 * @description What the media service takes and gives.
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

import type { Readable } from 'node:stream';

export interface MediaLimits {
  readonly maxBytes: number;
  readonly allowedTypes: readonly string[];
  /** The bytes of `pending` and `ready` files that one tenant may hold. No quota when it is not given. */
  readonly quotaBytes?: number;
}

export interface MediaView {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly kind: string;
  readonly size: number;
  readonly status: string;
  readonly visibility: string;
  readonly alt: string | null;
  readonly description: string | null;
  readonly folderId: string | null;
  readonly checksum: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FolderView {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly createdAt: string;
}

export interface Page<T> {
  readonly data: T[];
  readonly meta: { readonly pageSize: number; readonly nextCursor: string | null; readonly total?: number };
}

export interface NewMedia {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly visibility?: 'private' | 'public';
  readonly alt?: string;
  readonly description?: string;
  readonly folderId?: string;
}

export interface MediaChanges {
  readonly alt?: string | null;
  readonly description?: string | null;
  readonly folderId?: string | null;
}

export interface MediaQuery {
  readonly q?: string;
  readonly kind?: string;
  readonly folderId?: string;
  readonly status?: string;
  readonly visibility?: string;
  readonly sizeMin?: number;
  readonly sizeMax?: number;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly pageSize?: unknown;
  readonly cursor?: string;
  readonly withTotal?: boolean;
}

export interface MediaService {
  create(input: NewMedia): Promise<MediaView>;
  get(id: string): Promise<MediaView>;
  list(query: MediaQuery): Promise<Page<MediaView>>;
  update(id: string, changes: MediaChanges): Promise<MediaView>;
  /** Removes the record now and its object after commit (MED-03). */
  remove(id: string): Promise<void>;
  uploadUrl(id: string): Promise<{
    readonly url: string;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly expiresAt: number;
  }>;
  confirm(id: string): Promise<{ readonly id: string; readonly status: string; readonly size: number }>;
  /** A URL to read a ready file: public, signed, or `contentUrl` on a disk that cannot sign (MED-02). */
  readUrl(id: string, contentUrl: string): Promise<{ readonly url: string; readonly expiresAt: number | null }>;
  content(id: string): Promise<{ readonly stream: Readable; readonly contentType: string; readonly filename: string }>;
  folders(query: {
    readonly parentId?: string;
    readonly pageSize?: unknown;
    readonly cursor?: string;
  }): Promise<Page<FolderView>>;
  createFolder(input: { readonly name: string; readonly parentId?: string }): Promise<FolderView>;
  renameFolder(id: string, name: string): Promise<FolderView>;
  removeFolder(id: string): Promise<void>;
}
