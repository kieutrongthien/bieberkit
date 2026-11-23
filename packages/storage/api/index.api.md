<!--
  BieberKit

  @file        packages/storage/api/index.api.md
  @description API report of @bieberkit/storage: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/storage

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { a as DEFAULT_MAX_BYTES, c as TypeRule, i as createStorage, n as StorageOptions, o as DEFAULT_TYPES, r as StoreBody, s as StoragePolicy, t as Storage } from "./storage-mmKfH8I0.js";
import { a as StorageError, i as SignedUpload, n as DiskBody, o as StoredFile, r as DiskObject, s as Visibility, t as Disk } from "./contract-BmeHIf6u.js";
interface MemoryDiskOptions {
  readonly signing?: boolean;
  readonly publicBaseUrl?: string;
  readonly now?: () => number;
}
interface MemoryDisk extends Disk {
  upload(url: string, headers: Readonly<Record<string, string>>, body: Uint8Array): Promise<void>;
  readonly files: ReadonlyMap<string, {
    readonly bytes: Uint8Array;
    readonly contentType: string;
  }>;
}
export declare function createMemoryDisk(options?: MemoryDiskOptions): MemoryDisk;
export { DEFAULT_MAX_BYTES, DEFAULT_TYPES, type Disk, type DiskBody, type DiskObject, type MemoryDisk, type MemoryDiskOptions, type SignedUpload, type Storage, StorageError, type StorageOptions, type StoragePolicy, type StoreBody, type StoredFile, type TypeRule, type Visibility, createStorage };
```
