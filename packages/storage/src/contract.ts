/**
 * BieberKit
 *
 * @file        packages/storage/src/contract.ts
 * @description The types of the storage and of its disks, the errors and the rules for paths and TTLs (S-01 to S-03).
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
import { BkError } from '@bieberkit/core';

export type Visibility = 'private' | 'public';

/** What a disk says about an object that it holds. */
export interface DiskObject {
  readonly size: number;
  readonly contentType: string | undefined;
  readonly lastModified: number;
}

export type DiskBody = Uint8Array | Readable;

export interface SignedUpload {
  /** Where the browser sends the file. */
  readonly url: string;
  readonly method: 'PUT';
  /** Headers that the browser must send, for example the content type that was signed. */
  readonly headers: Readonly<Record<string, string>>;
  /** The path to give to `confirmUpload` once the browser is done. */
  readonly path: string;
  readonly expiresAt: number;
}

/**
 * A plain key store. A disk knows nothing of visibility, tenants or policy: the storage puts those in the key (`private/...`,
 * `public/...`), so every disk behaves the same way, with no ACL.
 */
export interface Disk {
  readonly name: string;
  /** True when the disk can make signed URLs for a browser to read or send a file. */
  readonly signing: boolean;
  put(key: string, body: DiskBody, options: { readonly contentType: string }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  stream(key: string, range?: { readonly start: number; readonly end: number }): Promise<Readable>;
  /** The object, or `undefined` when there is none. */
  head(key: string): Promise<DiskObject | undefined>;
  /** Deleting what is not there is not an error. */
  delete(key: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  /** The URL that serves a public key, or `undefined` when the disk has none. */
  publicUrl(key: string): Promise<string | undefined>;
  signedUrl(key: string, options: { readonly ttlMs: number; readonly download?: string }): Promise<string>;
  signedUploadUrl(
    key: string,
    options: { readonly ttlMs: number; readonly contentType: string; readonly size: number },
  ): Promise<{ readonly url: string; readonly headers: Readonly<Record<string, string>> }>;
  close(): Promise<void>;
}

/** What `put`, `stat` and `confirmUpload` answer. */
export interface StoredFile {
  readonly path: string;
  readonly size: number;
  readonly contentType: string;
  readonly visibility: Visibility;
  readonly lastModified: number;
}

export class StorageError extends BkError {}

export function storageError(
  code: string,
  status: number,
  message: string,
  fix: string,
  cause?: unknown,
): StorageError {
  return new StorageError(message, { code, status, fix, ...(cause === undefined ? {} : { cause }) });
}

const SEGMENT = /^[\w.-]+(?: [\w.-]+)*$/;

/** A path of the application: relative, with `/`, and every segment safe in a file name, a URL and an S3 key. */
export function checkPath(path: string): string {
  const segments = typeof path === 'string' ? path.split('/') : [];
  const ok =
    typeof path === 'string' &&
    path.length >= 1 &&
    path.length <= 512 &&
    segments.every((segment) => segment !== '.' && segment !== '..' && SEGMENT.test(segment));
  if (!ok) {
    throw storageError(
      'STORAGE_PATH_INVALID',
      400,
      `The path ${JSON.stringify(path)} is not valid.`,
      'Use a relative path of up to 512 characters, with / between segments made of letters, digits, _ . - and single spaces.',
    );
  }
  return path;
}

export function checkTtl(ttlMs: number, maxMs: number): number {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxMs) {
    throw storageError(
      'STORAGE_TTL_INVALID',
      500,
      `The TTL ${String(ttlMs)} ms is not valid.`,
      `Give a whole number of milliseconds from 1 to ${String(maxMs)}.`,
    );
  }
  return ttlMs;
}

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}
