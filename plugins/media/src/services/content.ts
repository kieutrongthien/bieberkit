/**
 * BieberKit
 *
 * @file        plugins/media/src/services/content.ts
 * @description What a file may be: the allowed types, the kind and the storage path of a file, and the limits of an upload.
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

import { fail } from './errors.ts';
import type { MediaLimits } from './types.ts';

const OFFICE = 'application/vnd.openxmlformats-officedocument';

/** Images, PDF, text and the Office formats of the storage's list (MED-07). */
export const MB: number = 1024 * 1024;

export const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  'text/csv',
  `${OFFICE}.wordprocessingml.document`,
  `${OFFICE}.spreadsheetml.sheet`,
  `${OFFICE}.presentationml.presentation`,
];

export const mediaType = (value: string): string => (value.split(';')[0] ?? '').trim().toLowerCase();

/** The path of the object in the root storage: `<tenant>/media/<id>/<filename>`, under the visibility prefix of S-05 (OPS-04). */
export const pathOf = (row: { readonly id: string; readonly filename: string; readonly tenantId: string }): string =>
  `${row.tenantId}/media/${row.id}/${row.filename}`;

/** The kind of a file, from its type (MED-06). */
export function kindOf(contentType: string): string {
  const type = mediaType(contentType);
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || type === 'application/pdf' || type === 'application/json' || type.startsWith(OFFICE))
    return 'document';
  return 'other';
}

export function checkLimits(limits: MediaLimits, contentType: string, size: number): void {
  if (!limits.allowedTypes.includes(mediaType(contentType))) {
    fail(
      'MEDIA_TYPE_REFUSED',
      422,
      `Files of type ${mediaType(contentType)} are not allowed.`,
      `Send one of ${limits.allowedTypes.join(', ')}.`,
    );
  }
  if (size > limits.maxBytes) {
    fail(
      'MEDIA_TOO_LARGE',
      413,
      'The file is larger than the limit.',
      `Send a file of at most ${String(limits.maxBytes / MB)} MB.`,
    );
  }
}
