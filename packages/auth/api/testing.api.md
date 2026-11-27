<!--
  BieberKit

  @file        packages/auth/api/testing.api.md
  @description API report of @bieberkit/auth: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/auth

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { D as ScopedPermission, n as AuthorizerOptions, t as AccessAuthorizer } from "./authorizer-CAQRsGSc.js";
import { EntityDef } from "@bieberkit/data";
type Row = Record<string, unknown>;
interface MatrixReply {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}
interface MatrixCaller {
  readonly id: string;
  get(url: string, headers?: Record<string, string>): Promise<MatrixReply>;
  post(url: string, payload?: object, headers?: Record<string, string>): Promise<MatrixReply>;
  patch(url: string, payload: object, version: number, headers?: Record<string, string>): Promise<MatrixReply>;
  delete(url: string, version: number, headers?: Record<string, string>): Promise<MatrixReply>;
  inTenant(tenant: string): MatrixCaller;
}
interface MatrixHarness {
  readonly entity: EntityDef<string>;
  readonly path: string;
  readonly tenants: readonly [string, string];
  sample(extra?: Row): Row;
  edit(): Row;
  valueOf(field: string): unknown;
  caller(permissions: readonly string[], options?: {
    tenant?: string;
    userId?: string;
  }): Promise<MatrixCaller>;
  seed(tenant: string, rows: readonly Row[]): Promise<string[]>;
  stored(id: string, field: string): Promise<unknown>;
}
interface MatrixCase {
  readonly id: string;
  readonly title: string;
  run(harness: MatrixHarness): Promise<void>;
}
interface MatrixOptions {
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  readonly conditions?: readonly {
    readonly permission: string;
    inside(userId: string): Row;
    outside(userId: string): Row;
  }[];
}
export declare function permissionMatrix(entity: EntityDef<string>, options?: MatrixOptions): MatrixCase[];
interface Mutant {
  readonly id: "ignore-conditions" | "no-read-mask" | "no-write-mask" | "write-checks-read" | "unsupported-allows-all" | "tenant-blind-grants";
  readonly description: string;
  build(options: AuthorizerOptions, tenants: readonly string[]): AccessAuthorizer;
}
export declare const MUTANTS: readonly Mutant[];
export type { MatrixCaller, MatrixCase, MatrixHarness, MatrixOptions, MatrixReply, Mutant };
```
