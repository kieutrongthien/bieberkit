<!--
  BieberKit

  @file        packages/storage/api/storage.api.md
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
import { Readable } from "node:stream";
import { i as SignedUpload, o as StoredFile, s as Visibility, t as Disk } from "./contract-BmeHIf6u.js";
type TypeRule = {
  readonly kind: "binary";
  readonly contentType: string;
  readonly detected: readonly string[];
} | {
  readonly kind: "text";
  readonly contentType: string;
};
interface StoragePolicy {
  readonly maxBytes?: number;
  readonly types?: Readonly<Record<string, TypeRule>>;
}
declare const DEFAULT_TYPES: Readonly<Record<string, TypeRule>>;
declare const DEFAULT_MAX_BYTES: number;
interface StorageOptions {
  readonly disk: Disk;
  readonly policy?: StoragePolicy;
  readonly publicBaseUrl?: string;
}
type StoreBody = string | Uint8Array | Readable;
interface Storage {
  put(path: string, body: StoreBody, options?: {
    readonly visibility?: Visibility;
  }): Promise<StoredFile>;
  get(path: string): Promise<Uint8Array>;
  stream(path: string, options?: {
    readonly range?: {
      readonly start: number;
      readonly end: number;
    };
  }): Promise<Readable>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StoredFile | undefined>;
  delete(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  setVisibility(path: string, visibility: Visibility): Promise<void>;
  url(path: string): Promise<string>;
  signedUrl(path: string, options?: {
    readonly ttlMs?: number;
    readonly download?: string;
  }): Promise<string>;
  signedUploadUrl(path: string, options: {
    readonly contentType: string;
    readonly size: number;
    readonly ttlMs?: number;
  }): Promise<SignedUpload>;
  confirmUpload(path: string, options?: {
    readonly visibility?: Visibility;
  }): Promise<StoredFile>;
  readonly tenant: Storage;
  close(): Promise<void>;
}
declare function createStorage(options: StorageOptions): Storage;
export { DEFAULT_MAX_BYTES as a, TypeRule as c, createStorage as i, StorageOptions as n, DEFAULT_TYPES as o, StoreBody as r, StoragePolicy as s, Storage as t };
```
