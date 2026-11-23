<!--
  BieberKit

  @file        packages/storage/api/testing.api.md
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
import { t as Disk } from "./contract-BmeHIf6u.js";
import { t as StorageConfig } from "./config-DfRc-h_1.js";
interface DiskSubject {
  readonly make: () => Promise<Disk>;
  readonly cleanup?: () => Promise<void>;
  readonly keepsContentType?: boolean;
}
export declare function diskContractSuite(name: string, subject: DiskSubject): void;
export declare function makeTestBucket(endpoint: string): Promise<StorageConfig>;
declare module "vitest" {
  interface ProvidedContext {
    storageS3Endpoint: string;
    dialectUrls: {
      postgres: string;
      mysql: string;
      require: string;
    };
  }
}
export declare function describeS3(name: string, suite: (endpoint: string) => void): void;
export type { DiskSubject };
```
