<!--
  BieberKit

  @file        packages/data/api/connect.api.md
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
import { BkError, Dialect, Logger, Metrics, Tracer } from "@bieberkit/core";
import { EntityManager, EntitySchema, IDatabaseDriver, MikroORM } from "@mikro-orm/core";
import { Transaction } from "kysely";
declare class DataError extends BkError {}
declare function dataError(code: string, status: number, message: string, fix: string, cause?: unknown): DataError;
type DestructiveKind = "drop-column" | "drop-table" | "rename" | "alter-type" | "not-null-without-default";
interface DestructiveFinding {
  readonly kind: DestructiveKind;
  readonly statement: string;
}
declare function detectDestructive(statements: readonly string[]): DestructiveFinding[];
declare function upStatementsOfMigration(source: string): string[];
type StepDatabase = Record<string, Record<string, unknown>>;
type StepKind = "expand" | "migrate" | "contract";
interface PluginMigrationStep {
  readonly plugin: string;
  readonly version: string;
  readonly id: string;
  readonly kind: StepKind;
  readonly after?: string;
  up(trx: Transaction<StepDatabase>, dialect: Dialect): Promise<void>;
}
declare function compareVersions(a: string, b: string): number;
declare function stepName(step: Pick<PluginMigrationStep, "plugin" | "id">): string;
declare function orderSteps(steps: readonly PluginMigrationStep[], pluginOrder: readonly string[]): PluginMigrationStep[];
declare function validateSteps(steps: readonly PluginMigrationStep[], pluginOrder: readonly string[]): void;
interface StepRisk {
  readonly kind: "mysql-unguarded-ddl" | "destructive-before-contract" | "contract-without-after";
  readonly step: string;
  readonly message: string;
}
declare function findStepRisks(steps: readonly PluginMigrationStep[]): StepRisk[];
interface EncryptionKeys {
  readonly current: string;
  readonly previous?: readonly string[];
}
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
declare function currentTenantId(): string | undefined;
declare function runAsTenant<T>(tenantId: string, fn: () => T): T;
interface DatabaseEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_READ_URLS: readonly string[];
  readonly DB_POOL_MAX: number;
}
interface DatabaseOptions {
  readonly entities: readonly EntitySchema[];
  readonly audit?: AuditSink | "table";
  readonly auditMirror?: boolean;
  readonly encryption?: EncryptionKeys;
  readonly references?: ReferenceVisibility;
  readonly logger?: Logger;
  readonly queryLog?: (sql: string) => void;
  readonly tracer?: Tracer;
  readonly metrics?: Metrics;
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
declare function resolveConnection(env: DatabaseEnv, variable?: string): ResolvedConnection;
declare function createDatabase(env: DatabaseEnv, options: DatabaseOptions): Promise<Database>;
declare function currentEntityManager(): EntityManager | undefined;
declare function runInTransaction<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>;
type CommitHook = () => Promise<void> | void;
declare function afterCommit(callback: CommitHook): void;
declare function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>;
export { upStatementsOfMigration as A, findStepRisks as C, DestructiveFinding as D, validateSteps as E, dataError as M, DestructiveKind as O, compareVersions as S, stepName as T, EncryptionKeys as _, ResolvedConnection as a, StepKind as b, currentEntityManager as c, runInUnitOfWork as d, AuditSink as f, ReferenceVisibility as g, runAsTenant as h, Orm as i, DataError as j, detectDestructive as k, resolveConnection as l, currentTenantId as m, DatabaseEnv as n, afterCommit as o, SystemScopeEntry as p, DatabaseOptions as r, createDatabase as s, Database as t, runInTransaction as u, PluginMigrationStep as v, orderSteps as w, StepRisk as x, StepDatabase as y };
```
