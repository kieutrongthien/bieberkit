/**
 * BieberKit
 *
 * @file        packages/storage/src/content.ts
 * @description The policy for uploads: the types that are allowed, the check of the content against the extension, and the size limit (S-02).
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

import { fileTypeFromBuffer } from 'file-type';
import { extensionOf, storageError } from './contract.ts';

/** What a file with this extension must be. */
export type TypeRule =
  | { readonly kind: 'binary'; readonly contentType: string; readonly detected: readonly string[] }
  | { readonly kind: 'text'; readonly contentType: string };

export interface StoragePolicy {
  /** The largest file, in bytes. Defaults to 25 MiB. */
  readonly maxBytes?: number;
  /** Extension (lower case, no dot) to rule. It replaces the default list. */
  readonly types?: Readonly<Record<string, TypeRule>>;
}

const binary = (contentType: string, ...also: string[]): TypeRule => ({
  kind: 'binary',
  contentType,
  detected: [contentType, ...also],
});
const OFFICE = 'application/vnd.openxmlformats-officedocument';

/** Images that cannot run script, documents, archives, media and text. `svg` and `html` are left out on purpose: they run script. */
export const DEFAULT_TYPES: Readonly<Record<string, TypeRule>> = {
  jpg: binary('image/jpeg'),
  jpeg: binary('image/jpeg'),
  png: binary('image/png'),
  gif: binary('image/gif'),
  webp: binary('image/webp'),
  avif: binary('image/avif'),
  pdf: binary('application/pdf'),
  docx: binary(`${OFFICE}.wordprocessingml.document`),
  xlsx: binary(`${OFFICE}.spreadsheetml.sheet`),
  pptx: binary(`${OFFICE}.presentationml.presentation`),
  zip: binary('application/zip'),
  mp4: binary('video/mp4', 'video/quicktime'),
  webm: binary('video/webm'),
  mp3: binary('audio/mpeg'),
  txt: { kind: 'text', contentType: 'text/plain; charset=utf-8' },
  csv: { kind: 'text', contentType: 'text/csv; charset=utf-8' },
  json: { kind: 'text', contentType: 'application/json' },
};

export const DEFAULT_MAX_BYTES: number = 25 * 1024 * 1024;
/** How many bytes are enough to know what a file is: 64 KiB, because an Office file names its type in the entries of a zip. */
export const SNIFF_BYTES: number = 65_536;

export interface ResolvedPolicy {
  readonly maxBytes: number;
  readonly types: Readonly<Record<string, TypeRule>>;
}

export function resolvePolicy(policy: StoragePolicy = {}): ResolvedPolicy {
  const maxBytes = policy.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw storageError(
      'STORAGE_CONFIG_INVALID',
      500,
      'policy.maxBytes is not a positive whole number.',
      'Give a number of bytes.',
    );
  }
  return { maxBytes, types: policy.types ?? DEFAULT_TYPES };
}

/** The rule of the extension of `path`, or `STORAGE_TYPE_NOT_ALLOWED`. */
export function ruleFor(policy: ResolvedPolicy, path: string): TypeRule {
  const extension = extensionOf(path);
  const rule = Object.hasOwn(policy.types, extension) ? policy.types[extension] : undefined;
  if (rule === undefined) {
    throw storageError(
      'STORAGE_TYPE_NOT_ALLOWED',
      415,
      extension === '' ? 'The file has no extension.' : `Files of type .${extension} are not allowed.`,
      'Send one of the allowed types.',
    );
  }
  return rule;
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** The length of `head` without a character that is cut at its end, which is not an error when `head` is only the start of the file. */
function withoutCutCharacter(head: Uint8Array): Uint8Array {
  for (let back = 1; back <= Math.min(3, head.length); back += 1) {
    const byte = head[head.length - back] ?? 0;
    if ((byte & 0xc0) === 0x80) continue; // a continuation byte: look further back for the start of the character
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return needed > back ? head.subarray(0, head.length - back) : head;
  }
  return head;
}

/** True when the bytes are text: valid UTF-8 with no NUL. */
function isText(head: Uint8Array, whole: boolean): boolean {
  if (head.includes(0)) return false;
  try {
    UTF8.decode(whole ? head : withoutCutCharacter(head));
    return true;
  } catch {
    return false;
  }
}

/** Checks the first bytes of a file against its rule, and answers the content type to store. `whole` says that `head` is all of it. */
export async function checkContent(rule: TypeRule, head: Uint8Array, whole: boolean): Promise<string> {
  const detected = await fileTypeFromBuffer(head);
  if (rule.kind === 'binary') {
    if (detected === undefined || !rule.detected.includes(detected.mime)) {
      throw storageError(
        'STORAGE_CONTENT_MISMATCH',
        415,
        'The content of the file is not what its extension says.',
        'Send a real file of the type of the extension.',
      );
    }
  } else if (detected !== undefined || !isText(head, whole)) {
    throw storageError(
      'STORAGE_CONTENT_MISMATCH',
      415,
      'The content of the file is not text.',
      'Send a text file in UTF-8.',
    );
  }
  return rule.contentType;
}
