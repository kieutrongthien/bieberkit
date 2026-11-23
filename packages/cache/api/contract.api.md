<!--
  BieberKit

  @file        packages/cache/api/contract.api.md
  @description API report of @bieberkit/cache: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/cache

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { BkError } from "@bieberkit/core";
type CacheValue = null | boolean | number | string | readonly CacheValue[] | {
  readonly [key: string]: CacheValue;
};
interface Atomic {
  add(key: string, value: string, ttlMs: number): Promise<boolean>;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteIf(key: string, value: string): Promise<boolean>;
  increment(key: string, ttlMs: number): Promise<number>;
}
interface CacheEngine {
  readonly name: string;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  readonly atomic: Atomic;
  close(): Promise<void>;
}
declare class CacheError extends BkError {}
export { CacheValue as i, CacheEngine as n, CacheError as r, Atomic as t };
```
