/**
 * BieberKit
 *
 * @file        packages/storage/src/memory-disk.ts
 * @description A disk that keeps files in the memory of one process, with fake signed URLs so that the flows of a browser can be tested without a bucket.
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

import { Readable } from 'node:stream';
import { storageError } from './contract.ts';
import type { Disk, DiskBody, DiskObject } from './contract.ts';

export interface MemoryDiskOptions {
  /** Makes `signedUrl` and `signedUploadUrl` answer `memory://` URLs. `upload` plays the part of the browser. */
  readonly signing?: boolean;
  readonly publicBaseUrl?: string;
  readonly now?: () => number;
}

export interface MemoryDisk extends Disk {
  /** What a browser does with a URL of `signedUploadUrl`: sends the bytes with the headers that it was told to send. */
  upload(url: string, headers: Readonly<Record<string, string>>, body: Uint8Array): Promise<void>;
  /** What is stored, by key, for tests. */
  readonly files: ReadonlyMap<string, { readonly bytes: Uint8Array; readonly contentType: string }>;
}

async function collect(body: DiskBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body.slice();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of body) {
    const bytes: Uint8Array = chunk;
    chunks.push(bytes);
    length += bytes.length;
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const missing = (key: string) =>
  storageError('STORAGE_NOT_FOUND', 404, `There is no file at ${key}.`, 'Check the path.');

export function createMemoryDisk(options: MemoryDiskOptions = {}): MemoryDisk {
  const now = options.now ?? Date.now;
  const files = new Map<string, { bytes: Uint8Array; contentType: string; lastModified: number }>();
  const need = (key: string) => {
    const found = files.get(key);
    if (found === undefined) throw missing(key);
    return found;
  };

  return {
    name: 'memory',
    signing: options.signing === true,
    files,
    async put(key, body, putOptions) {
      files.set(key, { bytes: await collect(body), contentType: putOptions.contentType, lastModified: now() });
    },
    async get(key) {
      return need(key).bytes.slice();
    },
    async stream(key, range) {
      const bytes = need(key).bytes;
      return Readable.from([range === undefined ? bytes : bytes.subarray(range.start, range.end + 1)], {
        objectMode: false,
      });
    },
    async head(key): Promise<DiskObject | undefined> {
      const found = files.get(key);
      return found === undefined
        ? undefined
        : { size: found.bytes.length, contentType: found.contentType, lastModified: found.lastModified };
    },
    async delete(key) {
      files.delete(key);
    },
    async copy(from, to) {
      const found = need(from);
      files.set(to, { ...found, bytes: found.bytes.slice(), lastModified: now() });
    },
    async move(from, to) {
      const found = need(from);
      files.delete(from);
      files.set(to, found);
    },
    async publicUrl(key) {
      return options.publicBaseUrl === undefined ? undefined : `${options.publicBaseUrl}/${key}`;
    },
    async signedUrl(key, signedOptions) {
      need(key);
      const download =
        signedOptions.download === undefined ? '' : `&download=${encodeURIComponent(signedOptions.download)}`;
      return `memory://read/${key}?expires=${String(now() + signedOptions.ttlMs)}${download}`;
    },
    async signedUploadUrl(key, signedOptions) {
      return {
        url: `memory://upload/${key}?expires=${String(now() + signedOptions.ttlMs)}&size=${String(signedOptions.size)}`,
        headers: { 'content-type': signedOptions.contentType },
      };
    },
    async upload(url, headers, body) {
      const parsed = new URL(url);
      const expires = Number(parsed.searchParams.get('expires'));
      if (expires <= now())
        throw storageError('STORAGE_UPLOAD_EXPIRED', 403, 'The upload URL has expired.', 'Ask for a new one.');
      const size = Number(parsed.searchParams.get('size'));
      if (size !== body.length)
        throw storageError(
          'STORAGE_UPLOAD_REFUSED',
          403,
          'The size is not the one that was signed.',
          'Send what was announced.',
        );
      const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      files.set(key, {
        bytes: body.slice(),
        contentType: headers['content-type'] ?? 'application/octet-stream',
        lastModified: now(),
      });
    },
    async close() {
      files.clear();
    },
  };
}
