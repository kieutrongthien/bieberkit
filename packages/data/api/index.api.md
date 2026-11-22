<!--
  BieberKit

  @file        packages/data/api/index.api.md
  @description API report of @bieberkit/data: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/data

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { BkError } from "@bieberkit/core";
export declare class DataError extends BkError {}
export declare function dataError(code: string, status: number, message: string, fix: string, cause?: unknown): DataError;
interface Uuid7Options {
  readonly now?: () => number;
  readonly random?: (bytes: Uint8Array) => void;
}
export declare function isUuid(value: unknown): value is string;
export declare function uuid7ToBytes(id: string): Uint8Array;
export declare function uuid7FromBytes(bytes: Uint8Array): string;
export declare function createUuid7(options?: Uuid7Options): () => string;
export declare const uuid7: () => string;
type Compare = "exact" | "ci" | "ci_ai";
export declare function nfc(text: string): string;
export declare function fold(mode: Compare, text: string): string;
export declare function codePointLength(text: string): number;
export declare const SAFE_MAX: bigint;
export declare function assertSafeScaled(value: bigint, label: string): void;
export declare function minorUnitOf(currency: string): number;
export declare function toScaled(value: string, scale: number): bigint;
export declare function fromScaled(scaled: bigint, scale: number): string;
export declare function toMinor(amount: string, currency: string): bigint;
export declare function fromMinor(minor: bigint, currency: string): string;
export declare const MAX_PAGE_SIZE = 100;
export declare const DEFAULT_PAGE_SIZE = 25;
type CursorValue = string | number | bigint | boolean | null;
export declare function pageSize(requested: unknown, fallback?: number): number;
export declare function encodeCursor(position: readonly CursorValue[]): string;
export declare function decodeCursor(cursor: string): readonly CursorValue[];
export declare const packageName = "@bieberkit/data";
export type { Compare, CursorValue, Uuid7Options };
```
