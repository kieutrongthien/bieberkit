<!--
  BieberKit

  @file        packages/data/api/schema.api.md
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
import * as z from "zod/mini";
import { A as evaluateWhen, C as FieldKind, D as TransitionDef, E as StateOptions, M as mapWhenFields, N as whenFields, O as f, P as whenProblem, S as FieldDef, T as SchemaValue, _ as ColumnDef, a as EntityDef, b as FieldAdmin, c as FieldLike, d as StandardColumn, f as TableConstraints, g as tableConstraints, h as standardColumns, i as ConstraintDef, j as isUnset, k as When, l as OrmOverride, m as snake, n as AdminOptions, o as EntityOptions, p as defineEntity, r as ApiOptions, s as Feature, t as ActionDef, u as Permissions, v as ComputedFn, w as ResetEvery, x as FieldBuilders, y as Field } from "./define-entity-CgNUqL6l.js";
import { a as ResolvedEntities, c as resolveExtensions, i as ExtensionRef, n as ExtensionOptions, o as ResolvedExtension, r as ExtensionPermissions, s as defineExtension, t as ExtensionDef } from "./extend-txOG6agM.js";
import { a as UpdateInput, i as Row, n as EntityRegistry, o as generateRegistrySource, r as RegistryOptions, t as CreateInput } from "./registry-xVZjG8Qd.js";
type SchemaMode = "create" | "update" | "read";
interface ApiField {
  readonly key: string;
  readonly name: string;
  readonly def: FieldDef;
  readonly writable: boolean;
}
export declare function apiFields(entity: EntityDef<string>): readonly ApiField[];
type JsonSchema = Record<string, unknown>;
export declare function toJsonSchema(def: EntityDef<string>, mode: SchemaMode): JsonSchema;
export declare function normalizeInput(value: unknown): unknown;
export declare const EMAIL_PATTERN: string;
export declare const UTC_INSTANT_PATTERN: string;
export declare function decimalPattern(precision: number, scale: number): string;
interface PiiField {
  readonly entity: string;
  readonly field: string;
  readonly key: string;
  readonly encrypted: boolean;
}
export declare function piiFields(entities: readonly EntityDef<string>[]): PiiField[];
export declare function redactPii(entity: EntityDef<string>, data: unknown): unknown;
export declare function toZodMini(def: EntityDef<string>, mode: SchemaMode): z.ZodMiniType<Record<string, unknown>>;
export { type ActionDef, type AdminOptions, type ApiField, type ApiOptions, type ColumnDef, type ComputedFn, type ConstraintDef, type CreateInput, type EntityDef, type EntityOptions, type EntityRegistry, type ExtensionDef, type ExtensionOptions, type ExtensionPermissions, type ExtensionRef, type Feature, Field, type FieldAdmin, type FieldBuilders, type FieldDef, type FieldKind, type FieldLike, type JsonSchema, type OrmOverride, type Permissions, type PiiField, type RegistryOptions, type ResetEvery, type ResolvedEntities, type ResolvedExtension, type Row, type SchemaMode, type SchemaValue, type StandardColumn, type StateOptions, type TableConstraints, type TransitionDef, type UpdateInput, type When, defineEntity, defineExtension, evaluateWhen, f, generateRegistrySource, isUnset, mapWhenFields, resolveExtensions, snake, standardColumns, tableConstraints, whenFields, whenProblem };
```
