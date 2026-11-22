/**
 * BieberKit
 *
 * @file        packages/data/src/orm/index.ts
 * @description The ORM entry of @bieberkit/data, the only module of the package that imports MikroORM (ADR 0009).
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

export { bulkInsert, bulkUpdate } from './bulk.ts';
export { compileEntities } from './compile.ts';
export type { CompileOptions, OrmSchema } from './compile.ts';
export { createDatabase, currentEntityManager, resolveConnection, runInUnitOfWork } from './connect.ts';
export type { Database, DatabaseEnv, DatabaseOptions, Orm, ResolvedConnection } from './connect.ts';
export { createSqliteDialect } from './sqlite.ts';
export type { SqliteOptions } from './sqlite.ts';
export { Uuid7Type } from './uuid7-type.ts';
export { BieberEntityManager } from './entity-manager.ts';
export type { ReferenceVisibility } from './references.ts';
export { restore, softDelete } from './softdelete.ts';
export { currentTenantId, runAsTenant } from './tenant.ts';
export type { AuditSink, SystemScopeEntry } from './tenant.ts';
export { expectVersion } from './version.ts';
