/**
 * BieberKit
 *
 * @file        packages/storage/src/storage.ts
 * @description createStorage: files with a policy for uploads, private by default, signed URLs, confirmed browser uploads and the tenant view (S-01 to S-03).
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
import { currentTenantId } from '@bieberkit/data/orm';
import { checkContent, resolvePolicy, ruleFor, SNIFF_BYTES } from './content.ts';
import type { StoragePolicy } from './content.ts';
import { checkPath, checkTtl, extensionOf, storageError } from './contract.ts';
import type { Disk, SignedUpload, StorageError, StoredFile, Visibility } from './contract.ts';

export interface StorageOptions {
  readonly disk: Disk;
  readonly policy?: StoragePolicy;
  /** Where public files are served from, for example a CDN. It is followed by `public/<path>`. Defaults to the URL of the disk. */
  readonly publicBaseUrl?: string;
}

export type StoreBody = string | Uint8Array | Readable;

export interface Storage {
  put(path: string, body: StoreBody, options?: { readonly visibility?: Visibility }): Promise<StoredFile>;
  get(path: string): Promise<Uint8Array>;
  stream(
    path: string,
    options?: { readonly range?: { readonly start: number; readonly end: number } },
  ): Promise<Readable>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StoredFile | undefined>;
  delete(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  setVisibility(path: string, visibility: Visibility): Promise<void>;
  /** The public URL of a public file. */
  url(path: string): Promise<string>;
  /** A URL that lets a browser read a file, for a short time. */
  signedUrl(path: string, options?: { readonly ttlMs?: number; readonly download?: string }): Promise<string>;
  /** A URL that lets a browser send one file straight to the disk (S-01). Call `confirmUpload` when it is done. */
  signedUploadUrl(
    path: string,
    options: { readonly contentType: string; readonly size: number; readonly ttlMs?: number },
  ): Promise<SignedUpload>;
  /** Checks what the browser sent, keeps it, or deletes it and throws `STORAGE_UPLOAD_REJECTED` (S-01, S-02). */
  confirmUpload(path: string, options?: { readonly visibility?: Visibility }): Promise<StoredFile>;
  /** The same storage inside the folder of the tenant of the request. Without a tenant each call throws `STORAGE_TENANT_REQUIRED`. */
  readonly tenant: Storage;
  close(): Promise<void>;
}

const MINUTE = 60_000;
const SIGNED_READ_MAX_MS = 7 * 24 * 60 * MINUTE;
const SIGNED_UPLOAD_MAX_MS = 60 * MINUTE;
const VISIBILITIES: readonly Visibility[] = ['private', 'public'];

const tenantScope = (): string => {
  const tenantId = currentTenantId();
  if (tenantId === undefined) {
    throw storageError(
      'STORAGE_TENANT_REQUIRED',
      500,
      'storage.tenant was used with no tenant in the request context.',
      'Use storage.tenant inside a request or a job of a tenant, or use the root storage for files that every tenant shares.',
    );
  }
  return `t/${tenantId}/`;
};

const keyOf = (visibility: Visibility, scope: string, path: string): string => `${visibility}/${scope}${path}`;

function tooLarge(maxBytes: number): Error {
  return storageError(
    'STORAGE_TOO_LARGE',
    413,
    'The file is larger than the limit.',
    `Send a file of at most ${String(maxBytes)} bytes.`,
  );
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const mediaType = (value: string): string | undefined => value.split(';')[0]?.trim().toLowerCase();

/** The characters of a download name that are safe in a header and a file name. */
const safeName = (name: string): string => name.replace(/[^\w. -]/g, '_').slice(0, 200);

const notFound = (path: string): StorageError =>
  storageError('STORAGE_NOT_FOUND', 404, `There is no file at ${path}.`, 'Check the path.');

export function createStorage(options: StorageOptions): Storage {
  const { disk } = options;
  const policy = resolvePolicy(options.policy);
  const baseUrl = options.publicBaseUrl?.replace(/\/+$/, '');

  /** The visibility under which `path` exists, or `undefined`. */
  async function locate(
    path: string,
    scope: string,
  ): Promise<
    { visibility: Visibility; size: number; lastModified: number; contentType: string | undefined } | undefined
  > {
    for (const visibility of VISIBILITIES) {
      const found = await disk.head(keyOf(visibility, scope, path));
      if (found !== undefined)
        return { visibility, size: found.size, lastModified: found.lastModified, contentType: found.contentType };
    }
    return undefined;
  }

  /** Reads the stream far enough to know what it is, then gives back a stream of all of it that stops at the limit. */
  async function guarded(
    source: Readable,
    rule: ReturnType<typeof ruleFor>,
  ): Promise<{ stream: Readable; size: () => number; failure: () => unknown; contentType: string }> {
    const iterator = source[Symbol.asyncIterator]();
    const held: Uint8Array[] = [];
    let heldLength = 0;
    let ended = false;
    while (heldLength < SNIFF_BYTES && !ended) {
      const next = await iterator.next();
      if (next.done === true) ended = true;
      else {
        const chunk: Uint8Array = next.value;
        held.push(chunk);
        heldLength += chunk.length;
        if (heldLength > policy.maxBytes) {
          source.destroy();
          throw tooLarge(policy.maxBytes);
        }
      }
    }
    const head = concat(held, heldLength).subarray(0, SNIFF_BYTES);
    const contentType = await checkContent(rule, head, ended && heldLength <= SNIFF_BYTES).catch((error: unknown) => {
      source.destroy();
      throw error;
    });
    let total = 0;
    let failure: unknown;
    async function* body(): AsyncGenerator<Uint8Array> {
      for (const chunk of held) {
        total += chunk.length;
        yield chunk;
      }
      if (ended) return;
      for (;;) {
        const next = await iterator.next();
        if (next.done === true) return;
        const chunk: Uint8Array = next.value;
        total += chunk.length;
        if (total > policy.maxBytes) {
          failure = tooLarge(policy.maxBytes);
          source.destroy();
          throw failure;
        }
        yield chunk;
      }
    }
    return {
      stream: Readable.from(body(), { objectMode: false }),
      size: () => total,
      failure: () => failure,
      contentType,
    };
  }

  function requireSigning(): void {
    if (!disk.signing) {
      throw storageError(
        'STORAGE_SIGNING_UNSUPPORTED',
        500,
        `The ${disk.name} disk cannot sign URLs.`,
        'Use the s3 disk, or receive the file in the API and call put.',
      );
    }
  }

  async function readHead(key: string, size: number): Promise<Uint8Array> {
    const stream = await disk.stream(key, { start: 0, end: Math.max(0, Math.min(size, SNIFF_BYTES) - 1) });
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of stream) {
      const bytes: Uint8Array = chunk;
      chunks.push(bytes);
      length += bytes.length;
      if (length >= SNIFF_BYTES) break;
    }
    stream.destroy();
    return concat(chunks, length).subarray(0, SNIFF_BYTES);
  }

  function view(scopeOf: () => string): Storage {
    const self: Storage = {
      async put(path, body, putOptions = {}) {
        checkPath(path);
        const scope = scopeOf();
        const visibility = putOptions.visibility ?? 'private';
        const rule = ruleFor(policy, path);
        const key = keyOf(visibility, scope, path);
        let size: number;
        let contentType: string;
        if (body instanceof Readable) {
          const guard = await guarded(body, rule);
          contentType = guard.contentType;
          try {
            await disk.put(key, guard.stream, { contentType });
          } catch (error) {
            await disk.delete(key).catch(() => undefined);
            throw guard.failure() ?? error;
          }
          size = guard.size();
        } else {
          const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
          if (bytes.length > policy.maxBytes) throw tooLarge(policy.maxBytes);
          contentType = await checkContent(rule, bytes.subarray(0, SNIFF_BYTES), bytes.length <= SNIFF_BYTES);
          await disk.put(key, bytes, { contentType });
          size = bytes.length;
        }
        // A path has one copy: the one that was just written.
        await disk.delete(keyOf(visibility === 'private' ? 'public' : 'private', scope, path));
        return { path, size, contentType, visibility, lastModified: Date.now() };
      },

      async get(path) {
        checkPath(path);
        const scope = scopeOf();
        const found = await locate(path, scope);
        if (found === undefined) throw notFound(path);
        return disk.get(keyOf(found.visibility, scope, path));
      },

      async stream(path, streamOptions = {}) {
        checkPath(path);
        const scope = scopeOf();
        const range = streamOptions.range;
        if (
          range !== undefined &&
          !(
            Number.isSafeInteger(range.start) &&
            Number.isSafeInteger(range.end) &&
            range.start >= 0 &&
            range.end >= range.start
          )
        ) {
          throw storageError(
            'STORAGE_RANGE_INVALID',
            416,
            'The range is not valid.',
            'Give whole numbers, with start at most end.',
          );
        }
        const found = await locate(path, scope);
        if (found === undefined) throw notFound(path);
        return disk.stream(keyOf(found.visibility, scope, path), range);
      },

      async exists(path) {
        checkPath(path);
        return (await locate(path, scopeOf())) !== undefined;
      },

      async stat(path) {
        checkPath(path);
        const found = await locate(path, scopeOf());
        if (found === undefined) return undefined;
        return {
          path,
          size: found.size,
          contentType: found.contentType ?? 'application/octet-stream',
          visibility: found.visibility,
          lastModified: found.lastModified,
        };
      },

      async delete(path) {
        checkPath(path);
        const scope = scopeOf();
        await Promise.all(VISIBILITIES.map((visibility) => disk.delete(keyOf(visibility, scope, path))));
      },

      async copy(from, to) {
        await transfer(from, to, 'copy');
      },

      async move(from, to) {
        await transfer(from, to, 'move');
      },

      async setVisibility(path, visibility) {
        checkPath(path);
        const scope = scopeOf();
        const found = await locate(path, scope);
        if (found === undefined) throw notFound(path);
        if (found.visibility === visibility) return;
        await disk.move(keyOf(found.visibility, scope, path), keyOf(visibility, scope, path));
      },

      async url(path) {
        checkPath(path);
        const scope = scopeOf();
        const found = await locate(path, scope);
        if (found === undefined) throw notFound(path);
        if (found.visibility !== 'public') {
          throw storageError(
            'STORAGE_NOT_PUBLIC',
            403,
            `The file ${path} is private.`,
            'Make it public with visibility: "public", or use signedUrl for a short link.',
          );
        }
        const key = keyOf('public', scope, path);
        const url =
          baseUrl === undefined
            ? await disk.publicUrl(key)
            : `${baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
        if (url === undefined) {
          throw storageError(
            'STORAGE_PUBLIC_UNSUPPORTED',
            500,
            `The ${disk.name} disk has no public URL.`,
            'Give publicBaseUrl, the address of the CDN or of the static server that serves public/.',
          );
        }
        return url;
      },

      async signedUrl(path, signedOptions = {}) {
        checkPath(path);
        requireSigning();
        const ttlMs = checkTtl(signedOptions.ttlMs ?? 5 * MINUTE, SIGNED_READ_MAX_MS);
        const scope = scopeOf();
        const found = await locate(path, scope);
        if (found === undefined) throw notFound(path);
        const download = signedOptions.download === undefined ? undefined : safeName(signedOptions.download);
        return disk.signedUrl(keyOf(found.visibility, scope, path), {
          ttlMs,
          ...(download === undefined ? {} : { download }),
        });
      },

      async signedUploadUrl(path, uploadOptions) {
        checkPath(path);
        requireSigning();
        const rule = ruleFor(policy, path);
        const ttlMs = checkTtl(uploadOptions.ttlMs ?? 5 * MINUTE, SIGNED_UPLOAD_MAX_MS);
        if (mediaType(uploadOptions.contentType) !== mediaType(rule.contentType)) {
          throw storageError(
            'STORAGE_TYPE_NOT_ALLOWED',
            415,
            `A .${extensionOf(path)} file is ${rule.contentType}, not ${uploadOptions.contentType}.`,
            'Send the content type of the extension.',
          );
        }
        if (!Number.isSafeInteger(uploadOptions.size) || uploadOptions.size <= 0) {
          throw storageError(
            'STORAGE_TOO_LARGE',
            400,
            'The size of the file is not a positive whole number.',
            'Give the size in bytes.',
          );
        }
        if (uploadOptions.size > policy.maxBytes) throw tooLarge(policy.maxBytes);
        const signed = await disk.signedUploadUrl(keyOf('private', scopeOf(), path), {
          ttlMs,
          contentType: rule.contentType,
          size: uploadOptions.size,
        });
        return { url: signed.url, method: 'PUT', headers: signed.headers, path, expiresAt: Date.now() + ttlMs };
      },

      async confirmUpload(path, confirmOptions = {}) {
        checkPath(path);
        const scope = scopeOf();
        const visibility = confirmOptions.visibility ?? 'private';
        const key = keyOf('private', scope, path);
        const found = await disk.head(key);
        if (found === undefined) throw notFound(path);
        try {
          const rule = ruleFor(policy, path);
          if (found.size > policy.maxBytes) throw tooLarge(policy.maxBytes);
          const head = await readHead(key, found.size);
          await checkContent(rule, head, found.size <= SNIFF_BYTES);
        } catch (error) {
          await disk.delete(key);
          throw storageError(
            'STORAGE_UPLOAD_REJECTED',
            422,
            'The uploaded file was refused and deleted.',
            error instanceof Error ? error.message : 'Send a file that the policy allows.',
            error,
          );
        }
        if (visibility === 'public') await disk.move(key, keyOf('public', scope, path));
        await disk.delete(keyOf(visibility === 'private' ? 'public' : 'private', scope, path));
        const rule = ruleFor(policy, path);
        return { path, size: found.size, contentType: rule.contentType, visibility, lastModified: found.lastModified };
      },

      get tenant() {
        return scopeOf === tenantScope ? self : view(tenantScope);
      },

      close: () => disk.close(),
    };

    async function transfer(from: string, to: string, how: 'copy' | 'move'): Promise<void> {
      checkPath(from);
      checkPath(to);
      if (extensionOf(from) !== extensionOf(to)) {
        throw storageError(
          'STORAGE_TYPE_NOT_ALLOWED',
          415,
          'A file keeps its extension when it is copied or moved.',
          'Give a destination with the same extension.',
        );
      }
      const scope = scopeOf();
      const found = await locate(from, scope);
      if (found === undefined) throw notFound(from);
      if (from === to) return;
      const source = keyOf(found.visibility, scope, from);
      const target = keyOf(found.visibility, scope, to);
      if (how === 'copy') await disk.copy(source, target);
      else await disk.move(source, target);
      await disk.delete(keyOf(found.visibility === 'private' ? 'public' : 'private', scope, to));
    }

    return self;
  }

  return view(() => '');
}
