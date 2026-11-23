/**
 * BieberKit
 *
 * @file        packages/storage/src/adapters/flydrive/disk.ts
 * @description A disk on any FlyDrive driver: the only code of the storage that imports FlyDrive (PKG-03).
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
import type { DriverContract } from 'flydrive/types';
import { storageError } from '../../contract.ts';
import type { Disk } from '../../contract.ts';

export interface FlydriveDiskOptions {
  readonly name: string;
  /** True for a driver that can make signed URLs (S3). */
  readonly signing: boolean;
  /**
   * True when the driver cannot take a stream of unknown length (S3 asks for a length, or a multipart upload). The disk then reads the
   * stream into memory first. The storage has already limited it to `maxBytes`, so the memory is bounded.
   */
  readonly bufferStreams: boolean;
  /** True when `getStream` of a key that is not there only fails when the stream is read (the local folder). The disk then asks first. */
  readonly lazyStreams?: boolean;
}

async function toBytes(stream: Readable): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
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

const seconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));

export function flydriveDisk(driver: DriverContract, options: FlydriveDiskOptions): Disk {
  return {
    name: options.name,
    signing: options.signing,
    async put(key, body, putOptions) {
      if (body instanceof Uint8Array) await driver.put(key, body, { contentType: putOptions.contentType });
      else if (options.bufferStreams)
        await driver.put(key, await toBytes(body), { contentType: putOptions.contentType });
      else await driver.putStream(key, body, { contentType: putOptions.contentType });
    },
    get: (key) => driver.getBytes(key),
    async stream(key, range) {
      if (options.lazyStreams === true && !(await driver.exists(key))) {
        throw storageError('STORAGE_NOT_FOUND', 404, `There is no file at ${key}.`, 'Check the path.');
      }
      return driver.getStream(key, range === undefined ? undefined : { range });
    },
    async head(key) {
      try {
        const meta = await driver.getMetaData(key);
        return { size: meta.contentLength, contentType: meta.contentType, lastModified: meta.lastModified.getTime() };
      } catch (error) {
        // A driver says "missing" in its own way, so ask it.
        if (!(await driver.exists(key))) return undefined;
        throw error;
      }
    },
    delete: (key) => driver.delete(key),
    copy: (from, to) => driver.copy(from, to),
    move: (from, to) => driver.move(from, to),
    async publicUrl(key) {
      try {
        return await driver.getUrl(key);
      } catch {
        return undefined;
      }
    },
    signedUrl: (key, signedOptions) =>
      driver.getSignedUrl(key, {
        expiresIn: seconds(signedOptions.ttlMs),
        ...(signedOptions.download === undefined
          ? {}
          : { contentDisposition: `attachment; filename="${signedOptions.download}"` }),
      }),
    async signedUploadUrl(key, signedOptions) {
      // ContentLength goes to the command of the driver, which signs it: the browser can only send what was announced.
      const url = await driver.getSignedUploadUrl(key, {
        expiresIn: seconds(signedOptions.ttlMs),
        contentType: signedOptions.contentType,
        ContentLength: signedOptions.size,
      });
      return { url, headers: { 'content-type': signedOptions.contentType } };
    },
    async close() {},
  };
}
