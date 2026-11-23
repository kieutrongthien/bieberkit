/**
 * BieberKit
 *
 * @file        packages/storage/src/adapters/flydrive/test-bucket.ts
 * @description Makes a bucket on the S3 compatible server of the tests (MinIO) and answers the config of STORAGE_DISK=s3 for it.
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

import { randomBytes } from 'node:crypto';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageConfig } from './config.ts';

/** The config of `STORAGE_DISK=s3` for a bucket that this call creates on the test server (MinIO with `minioadmin`). */
export async function makeTestBucket(endpoint: string): Promise<StorageConfig> {
  const bucket = `bk-${randomBytes(6).toString('hex')}`;
  const credentials = { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' };
  const client = new S3Client({ region: 'us-east-1', endpoint, forcePathStyle: true, credentials });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  client.destroy();
  return {
    STORAGE_DISK: 's3',
    STORAGE_LOCAL_ROOT: './storage',
    S3_BUCKET: bucket,
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: endpoint,
    S3_ACCESS_KEY_ID: credentials.accessKeyId,
    S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    S3_FORCE_PATH_STYLE: true,
  };
}
