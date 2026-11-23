<!--
  BieberKit

  @file        packages/storage/api/contract.api.md
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
import { BkError } from "@bieberkit/core";
import { Readable } from "node:stream";
type Visibility = "private" | "public";
interface DiskObject {
  readonly size: number;
  readonly contentType: string | undefined;
  readonly lastModified: number;
}
type DiskBody = Uint8Array | Readable;
interface SignedUpload {
  readonly url: string;
  readonly method: "PUT";
  readonly headers: Readonly<Record<string, string>>;
  readonly path: string;
  readonly expiresAt: number;
}
interface Disk {
  readonly name: string;
  readonly signing: boolean;
  put(key: string, body: DiskBody, options: {
    readonly contentType: string;
  }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  stream(key: string, range?: {
    readonly start: number;
    readonly end: number;
  }): Promise<Readable>;
  head(key: string): Promise<DiskObject | undefined>;
  delete(key: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  publicUrl(key: string): Promise<string | undefined>;
  signedUrl(key: string, options: {
    readonly ttlMs: number;
    readonly download?: string;
  }): Promise<string>;
  signedUploadUrl(key: string, options: {
    readonly ttlMs: number;
    readonly contentType: string;
    readonly size: number;
  }): Promise<{
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
  }>;
  close(): Promise<void>;
}
interface StoredFile {
  readonly path: string;
  readonly size: number;
  readonly contentType: string;
  readonly visibility: Visibility;
  readonly lastModified: number;
}
declare class StorageError extends BkError {}
export { StorageError as a, SignedUpload as i, DiskBody as n, StoredFile as o, DiskObject as r, Visibility as s, Disk as t };
```
