/**
 * BieberKit
 *
 * @file        packages/storage/src/adapters/flydrive/index.ts
 * @description Subpath @bieberkit/storage/flydrive: disks on FlyDrive drivers and the storage that STORAGE_DISK selects.
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

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Logger } from '@bieberkit/core';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Driver } from 'flydrive/drivers/s3';
import type { StoragePolicy } from '../../content.ts';
import { storageError } from '../../contract.ts';
import type { Disk } from '../../contract.ts';
import { createStorage } from '../../storage.ts';
import type { Storage } from '../../storage.ts';
import type { StorageConfig } from './config.ts';
import { flydriveDisk } from './disk.ts';

export type { StorageConfig } from './config.ts';
export { flydriveDisk } from './disk.ts';
export type { FlydriveDiskOptions } from './disk.ts';

export interface StorageFromConfigOptions {
  readonly policy?: StoragePolicy;
  /** The address that serves `public/`: a CDN, or the static server of the local folder. */
  readonly publicBaseUrl?: string;
  readonly logger?: Logger;
}

/** The disk for `STORAGE_DISK`. Switching it changes this and nothing in the application (S-04). */
export function diskFromConfig(config: StorageConfig): Disk {
  if (config.STORAGE_DISK === 'local') {
    const root = resolve(config.STORAGE_LOCAL_ROOT);
    mkdirSync(root, { recursive: true });
    return flydriveDisk(new FSDriver({ location: root, visibility: 'private' }), {
      name: 'local',
      signing: false,
      bufferStreams: false,
      lazyStreams: true,
    });
  }
  const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = config;
  if (bucket === undefined || accessKeyId === undefined || secretAccessKey === undefined) {
    throw storageError(
      'STORAGE_CONFIG_INVALID',
      500,
      'STORAGE_DISK=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
      'Set the three variables. S3_ENDPOINT and S3_FORCE_PATH_STYLE are for R2 and MinIO.',
    );
  }
  const client = new S3Client({
    region: config.S3_REGION ?? 'auto',
    ...(config.S3_ENDPOINT === undefined ? {} : { endpoint: config.S3_ENDPOINT }),
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId, secretAccessKey },
    // The SDK adds a CRC32 of the body to a presigned upload by default, and for a browser that sends another body the store would
    // refuse it. R2 and MinIO also ask for this.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  // No ACL: visibility is the prefix of the key (private/ and public/), so R2 and buckets that turn ACLs off work the same way.
  return flydriveDisk(
    new S3Driver({
      client,
      bucket,
      visibility: 'private',
      supportsACL: false,
      urlBuilder: {
        // The content type is a signed header, so the browser can only send the type that the policy gave (S-02). The default URL of
        // the driver leaves it unsigned.
        generateSignedUploadURL: (_key, input, signer, expiresIn) =>
          getSignedUrl(signer, new PutObjectCommand(input), {
            expiresIn: typeof expiresIn === 'number' ? expiresIn : 300,
            signableHeaders: new Set(['content-type']),
          }),
      },
    }),
    {
      name: 's3',
      signing: true,
      bufferStreams: true,
    },
  );
}

export function createStorageFromConfig(config: StorageConfig, options: StorageFromConfigOptions = {}): Storage {
  return createStorage({
    disk: diskFromConfig(config),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    ...(options.publicBaseUrl === undefined ? {} : { publicBaseUrl: options.publicBaseUrl }),
  });
}
