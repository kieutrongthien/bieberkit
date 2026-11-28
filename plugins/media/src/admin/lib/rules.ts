/**
 * BieberKit
 *
 * @file        plugins/media/src/admin/lib/rules.ts
 * @description The rules of the control of a file that need no screen: the types that a field takes, what is wrong with a picked file, the name that it is sent under and how its size reads (UI-11).
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

import type { MetaField } from '@bieberkit/admin-core';

/** A media record as the media routes answer it. */
export interface MediaFile {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly kind: string;
  readonly size: number;
  readonly status: string;
}

/** Whether a media type is one of the patterns of a field: `image/*` takes any image, an exact type takes itself, none takes any. */
export function acceptsType(accept: readonly string[], contentType: string): boolean {
  if (accept.length === 0) return true;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return accept.some((pattern) => (pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern));
}

/** The value of the `accept` attribute of a file input for a field: the types, joined, or nothing for a field that takes any. */
export const acceptAttribute = (field: MetaField): string | undefined =>
  field.accept === undefined || field.accept.length === 0 ? undefined : field.accept.join(',');

/** What is wrong with a file that a person picked, before it is sent: it is empty, or not of a type that the field takes. */
export function fileProblem(
  field: MetaField,
  file: { readonly name: string; readonly size: number; readonly type: string },
): 'empty' | 'type' | undefined {
  if (file.size <= 0) return 'empty';
  // A browser gives no type for a file that it does not know. The server sees the bytes, so it decides then.
  if (file.type !== '' && !acceptsType(field.accept ?? [], file.type)) return 'type';
  return undefined;
}

/** The size of a file as people read it. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Whether a media record can be shown as a picture: it is an image that was uploaded. */
export const isPicture = (file: MediaFile): boolean => file.status === 'ready' && file.contentType.startsWith('image/');

/** The name that a file is sent under: the media routes take letters, digits, and `. _ -`, so a name from a disk is made fit. */
export function uploadName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replaceAll(/[^\w.-]+/g, '_')
    .replaceAll(/^[._]+|_+$/g, '');
  return cleaned.length >= 3 ? cleaned.slice(0, 200) : `file_${cleaned}`.slice(0, 200);
}
