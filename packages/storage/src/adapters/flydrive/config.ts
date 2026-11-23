/**
 * BieberKit
 *
 * @file        packages/storage/src/adapters/flydrive/config.ts
 * @description The part of the validated config that decides the storage: STORAGE_DISK, STORAGE_LOCAL_ROOT and S3_*.
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

/** The part of the validated config (`CoreEnv`) that decides the storage. */
export interface StorageConfig {
  readonly STORAGE_DISK: 'local' | 's3';
  readonly STORAGE_LOCAL_ROOT: string;
  readonly S3_BUCKET: string | undefined;
  readonly S3_REGION: string | undefined;
  readonly S3_ENDPOINT: string | undefined;
  readonly S3_ACCESS_KEY_ID: string | undefined;
  readonly S3_SECRET_ACCESS_KEY: string | undefined;
  readonly S3_FORCE_PATH_STYLE: boolean;
}
