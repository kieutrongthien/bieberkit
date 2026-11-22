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
import { Dialect } from "@bieberkit/core";
import { EntityManager, EntityProperty, EntitySchema, IDatabaseDriver, MikroORM, Platform, Type } from "@mikro-orm/core";
import { SqliteDialect } from "kysely";
interface DatabaseEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_READ_URLS: readonly string[];
  readonly DB_POOL_MAX: number;
}
interface DatabaseOptions {
  readonly entities: readonly EntitySchema[];
}
type Orm = MikroORM<IDatabaseDriver, EntityManager, readonly EntitySchema[]>;
interface Database {
  readonly dialect: Dialect;
  readonly orm: Orm;
  fork(): EntityManager;
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
  override compareAsType(): string;
  override ensureComparable(): boolean;
}
export type { Database, DatabaseEnv, DatabaseOptions, Orm, ResolvedConnection, SqliteOptions };
```
