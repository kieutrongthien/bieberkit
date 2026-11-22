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

export { auditTableSink, recordAudit } from './audit.ts';
export type { AuditEntry } from './audit.ts';
export {
  Attachment,
  AuditLog,
  Comment,
  DATA_PLUGIN,
  OutboxEntry,
  OutboxProcessed,
  Sequence,
  Tag,
  TimelineEntry,
  dataMigrationSteps,
  frameworkEntities,
  grantAuditLog,
} from './framework.ts';
export type { AuditLogRow, OutboxEntryRow, OutboxProcessedRow, SequenceRow } from './framework.ts';
export {
  addAttachment,
  addComment,
  addTag,
  addTimeline,
  deleteComment,
  listAttachments,
  listComments,
  listTags,
  listTimeline,
  removeAttachment,
  removeTag,
} from './features.ts';
export type {
  AttachmentInput,
  AttachmentRow,
  CommentRow,
  FeaturePage,
  PageRequest,
  TagRow,
  TimelineInput,
  TimelineRow,
} from './features.ts';
export { formatSequence, nextSequence, periodOf } from './sequence.ts';
export type { SequenceKey, SequenceOptions } from './sequence.ts';
export { availableTransitions, entityEventName, transition, transitionOf } from './state.ts';
export type { AvailableTransition, TransitionResult } from './state.ts';
export { createOutboxDispatcher, emitEvent, outboxLag, processOnce, purgeProcessed } from './outbox.ts';
export type {
  DispatchResult,
  OutboxDispatcher,
  OutboxDispatcherOptions,
  OutboxEvent,
  OutboxLag,
  OutboxMessage,
  OutboxPublisher,
  PurgeOptions,
} from './outbox.ts';
export { bulkInsert, bulkUpdate } from './bulk.ts';
export { compileEntities, entityOfSchema } from './compile.ts';
export type { CompileOptions, OrmSchema } from './compile.ts';
export { createDatabase, currentEntityManager, resolveConnection, runInUnitOfWork } from './connect.ts';
export type { Database, DatabaseEnv, DatabaseOptions, Orm, ResolvedConnection } from './connect.ts';
export { openMigrator } from './migrate.ts';
export type { MadeMigration, MigrationEnv, MigrationStatus, Migrator, MigratorOptions, UpOptions } from './migrate.ts';
export { runPluginMigrations } from './plugin-migrate.ts';
export type { PluginRefusal, PluginRun, PluginRunOptions } from './plugin-migrate.ts';
export { setNotNull, uuidType } from './portable.ts';
export { createSqliteDialect } from './sqlite.ts';
export type { SqliteOptions } from './sqlite.ts';
export { Uuid7Type } from './uuid7-type.ts';
export { BieberEntityManager } from './entity-manager.ts';
export type { ReferenceVisibility } from './references.ts';
export { restore, softDelete } from './softdelete.ts';
export { currentTenantId, runAsTenant } from './tenant.ts';
export type { AuditSink, SystemScopeEntry } from './tenant.ts';
export { expectVersion } from './version.ts';
export { listPage, queryableFields } from './query.ts';
export type { ListOptions, Page, SortOption } from './query.ts';
export { setTranslation, translationName } from './localize.ts';
export { toApiRow, toOrmData } from './mapper.ts';
