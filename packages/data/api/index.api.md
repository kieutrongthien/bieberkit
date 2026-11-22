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
import { A as fold, C as ResetEvery, D as f, E as TransitionDef, O as Compare, S as FieldKind, T as StateOptions, _ as ColumnDef, a as EntityDef, b as FieldBuilders, c as FieldLike, d as StandardColumn, f as TableConstraints, g as tableConstraints, h as standardColumns, i as ConstraintDef, j as nfc, k as codePointLength, l as OrmOverride, m as snake, n as AdminOptions, o as EntityOptions, p as defineEntity, r as ApiOptions, s as Feature, t as ActionDef, u as Permissions, v as ComputedFn, w as SchemaValue, x as FieldDef, y as Field } from "./define-entity-B93nbOOC.js";
import { a as UpdateInput, i as Row, n as EntityRegistry, t as CreateInput } from "./registry-CxjCK9gx.js";
import { n as dataError, t as DataError } from "./errors-Bn-3jo6Z.js";
interface Uuid7Options {
  readonly now?: () => number;
  readonly random?: (bytes: Uint8Array) => void;
}
export declare function isUuid(value: unknown): value is string;
export declare function uuid7ToBytes(id: string): Uint8Array;
export declare function uuid7FromBytes(bytes: Uint8Array): string;
export declare function createUuid7(options?: Uuid7Options): () => string;
export declare const uuid7: () => string;
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
export { type ActionDef, type AdminOptions, type ApiOptions, type ColumnDef, type Compare, type ComputedFn, type ConstraintDef, type CreateInput, type CursorValue, DataError, type EntityDef, type EntityOptions, type EntityRegistry, type Feature, Field, type FieldBuilders, type FieldDef, type FieldKind, type FieldLike, type OrmOverride, type Permissions, type ResetEvery, type Row, type SchemaValue, type StandardColumn, type StateOptions, type TableConstraints, type TransitionDef, type UpdateInput, type Uuid7Options, codePointLength, dataError, defineEntity, f, fold, nfc, snake, standardColumns, tableConstraints };
```
