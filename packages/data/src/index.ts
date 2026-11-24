/**
 * BieberKit
 *
 * @file        packages/data/src/index.ts
 * @description Public entry point of @bieberkit/data.
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

// Public API of @bieberkit/data. Implementation starts after the Phase 0 ADRs (docs/adr/README.md).

/** npm name of this package. */
export const packageName = '@bieberkit/data';

export { DataError, dataError } from './errors.ts';
export { createUuid7, isUuid, uuid7, uuid7FromBytes, uuid7ToBytes } from './keys/uuid7.ts';
export type { Uuid7Options } from './keys/uuid7.ts';
export { codePointLength, fold, nfc } from './text/fold.ts';
export type { Compare } from './text/fold.ts';
export { assertSafeScaled, fromMinor, fromScaled, minorUnitOf, SAFE_MAX, toMinor, toScaled } from './numbers/scaled.ts';
export { decodeCursor, DEFAULT_PAGE_SIZE, encodeCursor, MAX_PAGE_SIZE, pageSize } from './query/page.ts';
export type { CursorValue } from './query/page.ts';
export { detectDestructive, upStatementsOfMigration } from './migrations/destructive.ts';
export type { DestructiveFinding, DestructiveKind } from './migrations/destructive.ts';
export { migrationFileName } from './migrations/names.ts';
export { compareVersions, findStepRisks, orderSteps, stepName, validateSteps } from './migrations/steps.ts';
export type { PluginMigrationStep, StepDatabase, StepKind, StepRisk } from './migrations/steps.ts';
// Descriptors and the pure expansions only. The compilers (Zod, JSON Schema) are at `@bieberkit/data/schema`, the ORM at `@bieberkit/data/orm`.
export { defineEntity, snake, standardColumns, tableConstraints } from './schema/define-entity.ts';
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
} from './schema/define-entity.ts';
export { f, Field } from './schema/fields.ts';
export type {
  ColumnDef,
  ComputedFn,
  FieldBuilders,
  FieldDef,
  FieldKind,
  ResetEvery,
  SchemaValue,
  StateOptions,
  TransitionDef,
} from './schema/fields.ts';
export type { CreateInput, EntityRegistry, Row, UpdateInput } from './schema/registry.ts';

import type { Database } from './orm/connect.ts';
import type { PluginMigrationStep as ModuleMigrationStep } from './migrations/steps.ts';
import type { EntityDef as ModuleEntityDef } from './schema/define-entity.ts';

declare module '@bieberkit/core' {
  interface ModuleContributions {
    /** The entities of the module. The project compiles them to tables and, with `@bieberkit/http`, to routes (MOD-02). */
    entities?: readonly ModuleEntityDef<string>[];
    /** The migration steps of a plugin, in the order of its versions. The migrate role runs them in the boot order of the plugins (DATA-24). */
    migrations?: readonly ModuleMigrationStep[];
  }
}

declare module '@bieberkit/core' {
  interface ServiceRegistry {
    /** The connection of the application, with its tenant filter, its audit and its outbox. The server registers it for every role. */
    database: Database;
  }
}
