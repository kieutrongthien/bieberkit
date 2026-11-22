<!--
  BieberKit

  @file        packages/data/api/orm.api.md
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
import "./errors-Bn-3jo6Z.js";
import { Dialect, Logger } from "@bieberkit/core";
import { EntityData, EntityManager, EntityName, EntityProperty, EntitySchema, FilterOptions, FilterQuery, FindOneOptions, FindOptions, IDatabaseDriver, MikroORM, NativeInsertUpdateOptions, Platform, Primary, RequiredEntityData, Type, UpdateOptions } from "@mikro-orm/core";
import { SqlEntityManager } from "@mikro-orm/sql";
import { SqliteDialect } from "kysely";
import { a as EntityDef } from "./define-entity-B93nbOOC.js";
type OrmSchema = EntitySchema<Record<string, unknown>>;
interface CompileOptions {
  readonly tenancy?: "single" | "shared-schema";
  readonly raw?: readonly OrmSchema[];
}
export declare function compileEntities(defs: readonly EntityDef<string>[], options?: CompileOptions): OrmSchema[];
type Row$3 = Record<string, unknown>;
export declare function bulkInsert(em: EntityManager, schema: OrmSchema, rows: readonly Row$3[]): Promise<void>;
export declare function bulkUpdate(em: EntityManager, schema: OrmSchema, where: Row$3, data: Row$3): Promise<number>;
interface ReferenceVisibility {
  visible(entity: string, ids: readonly string[]): Promise<readonly string[]>;
}
interface SystemScopeEntry {
  readonly reason: string;
  readonly userId?: string;
  readonly requestId?: string;
  readonly tenantId?: string;
  readonly at: Date;
}
interface AuditSink {
  record(entry: SystemScopeEntry): void | Promise<void>;
}
export declare function currentTenantId(): string | undefined;
export declare function runAsTenant<T>(tenantId: string, fn: () => T): T;
interface DatabaseEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_READ_URLS: readonly string[];
  readonly DB_POOL_MAX: number;
}
interface DatabaseOptions {
  readonly entities: readonly EntitySchema[];
  readonly audit?: AuditSink;
  readonly references?: ReferenceVisibility;
  readonly logger?: Logger;
  readonly queryLog?: (sql: string) => void;
}
type Orm = MikroORM<IDatabaseDriver, EntityManager, readonly EntitySchema[]>;
interface Database {
  readonly dialect: Dialect;
  readonly orm: Orm;
  fork(): EntityManager;
  asSystem<T>(reason: string, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
interface ResolvedConnection {
  readonly dialect: Dialect;
  readonly location: string;
  readonly readLocations: readonly string[];
}
export declare function resolveConnection(env: DatabaseEnv): ResolvedConnection;
export declare function createDatabase(env: DatabaseEnv, options: DatabaseOptions): Promise<Database>;
export declare function currentEntityManager(): EntityManager | undefined;
export declare function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>;
interface SqliteOptions {
  readonly busyTimeoutMs?: number;
}
export declare function createSqliteDialect(location: string, options?: SqliteOptions): SqliteDialect;
export declare class Uuid7Type extends Type<string | null, string | Uint8Array | null> {
  override getColumnType(_prop: EntityProperty, platform: Platform): string;
  override convertToDatabaseValue(value: string | Uint8Array | null | undefined, platform: Platform): string | Uint8Array | null;
  override convertToJSValue(value: string | Uint8Array | null | undefined, _platform?: Platform): string | null;
  override compareValues(a: string | Uint8Array | null, b: string | Uint8Array | null): boolean;
  override compareAsType(): string;
  override ensureComparable(): boolean;
}
type FilterType = "read" | "update" | "delete";
export declare class BieberEntityManager extends SqlEntityManager {
  override applyFilters<Entity extends object>(entityName: EntityName<Entity>, where: FilterQuery<Entity> | undefined, options: FilterOptions | undefined, type: FilterType, findOptions?: FindOptions<Entity> | FindOneOptions<Entity>): Promise<FilterQuery<Entity> | undefined>;
  override flush(): Promise<void>;
  override nativeUpdate<Entity extends object>(entityName: EntityName<Entity>, where: FilterQuery<NoInfer<Entity>>, data: EntityData<Entity>, options?: UpdateOptions<Entity>): Promise<number>;
  override insert<Entity extends object>(entityNameOrEntity: EntityName<Entity> | Entity, data?: NoInfer<RequiredEntityData<Entity> | Entity>, options?: NativeInsertUpdateOptions<Entity>): Promise<Primary<Entity>>;
  override insertMany<Entity extends object>(entityNameOrEntities: EntityName<Entity> | Entity[], data?: NoInfer<RequiredEntityData<Entity>[] | Entity[]>, options?: NativeInsertUpdateOptions<Entity>): Promise<Primary<Entity>[]>;
}
export declare function softDelete(em: EntityManager, row: Record<string, unknown>): void;
export declare function restore(em: EntityManager, row: Record<string, unknown>): void;
export declare function expectVersion(row: {
  readonly version?: unknown;
}, expected: number | string): void;
type Row$2 = Record<string, unknown>;
interface SortOption {
  readonly field: string;
  readonly direction?: "asc" | "desc";
}
interface ListOptions {
  readonly where?: Row$2;
  readonly sort?: readonly SortOption[];
  readonly limit?: unknown;
  readonly cursor?: string;
  readonly withTotal?: boolean;
  readonly select?: readonly string[];
  readonly populate?: readonly string[];
  readonly locale?: string;
}
interface Page {
  readonly rows: Row$2[];
  readonly limit: number;
  readonly nextCursor: string | null;
  readonly total?: number;
}
export declare function queryableFields(schema: OrmSchema): readonly string[];
export declare function listPage(em: EntityManager, schema: OrmSchema, options?: ListOptions): Promise<Page>;
type Row$1 = Record<string, unknown>;
export declare function translationName(entityName: string): string;
export declare function setTranslation(em: EntityManager, schema: OrmSchema, recordId: string, locale: string, values: Row$1): Promise<void>;
type Row = Record<string, unknown>;
export declare function toApiRow(schema: OrmSchema, row: Row): Row;
export declare function toOrmData(schema: OrmSchema, input: Row, _mode: "create" | "update"): Row;
export type { AuditSink, CompileOptions, Database, DatabaseEnv, DatabaseOptions, ListOptions, Orm, OrmSchema, Page, ReferenceVisibility, ResolvedConnection, SortOption, SqliteOptions, SystemScopeEntry };
```
