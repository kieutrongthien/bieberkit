/**
 * BieberKit
 *
 * @file        packages/data/src/schema/index.ts
 * @description The @bieberkit/data/schema entry: descriptors, schema compilers, the NFC step and the registry generator.
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

export { defineEntity, snake, standardColumns, tableConstraints } from './define-entity.ts';
export type {
  ActionDef,
  AdminOptions,
  ApiOptions,
  ConstraintDef,
  EntityDef,
  EntityOptions,
  Feature,
  FieldLike,
  OrmOverride,
  Permissions,
  StandardColumn,
  TableConstraints,
} from './define-entity.ts';
export { defineExtension, resolveExtensions } from './extend.ts';
export type {
  ExtensionDef,
  ExtensionOptions,
  ExtensionPermissions,
  ExtensionRef,
  ResolvedEntities,
  ResolvedExtension,
} from './extend.ts';
export { f, Field } from './fields.ts';
export type {
  ColumnDef,
  FieldAdmin,
  ComputedFn,
  FieldBuilders,
  FieldDef,
  FieldKind,
  ResetEvery,
  SchemaValue,
  StateOptions,
  TransitionDef,
} from './fields.ts';
export { evaluateWhen, isUnset, mapWhenFields, whenFields, whenProblem } from './when.ts';
export type { When } from './when.ts';
export { toJsonSchema } from './json-schema.ts';
export type { JsonSchema } from './json-schema.ts';
export { normalizeInput } from './normalize.ts';
export { decimalPattern, EMAIL_PATTERN, UTC_INSTANT_PATTERN } from './patterns.ts';
export { generateRegistrySource } from './registry.ts';
export type { CreateInput, EntityRegistry, RegistryOptions, Row, UpdateInput } from './registry.ts';
export { piiFields, redactPii } from './pii.ts';
export type { PiiField } from './pii.ts';
export { apiFields } from './shape.ts';
export type { ApiField, SchemaMode } from './shape.ts';
export { toZodMini } from './zod-mini.ts';
