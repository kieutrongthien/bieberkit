/**
 * BieberKit
 *
 * @file        packages/storage/src/index.ts
 * @description Public API of @bieberkit/storage: the storage, the policy, the memory disk and the errors.
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

export { DEFAULT_MAX_BYTES, DEFAULT_TYPES } from './content.ts';
export type { StoragePolicy, TypeRule } from './content.ts';
export { StorageError } from './contract.ts';
export type { Disk, DiskBody, DiskObject, SignedUpload, StoredFile, Visibility } from './contract.ts';
export { createMemoryDisk } from './memory-disk.ts';
export type { MemoryDisk, MemoryDiskOptions } from './memory-disk.ts';
export { createStorage } from './storage.ts';
export type { Storage, StorageOptions, StoreBody } from './storage.ts';
