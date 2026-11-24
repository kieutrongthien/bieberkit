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
import { C as ResetEvery, E as TransitionDef, a as EntityDef } from "./define-entity-CMoIdUz2.js";
import { Dialect, Logger } from "@bieberkit/core";
import { EntityData, EntityManager, EntityName, EntityProperty, EntitySchema, FilterOptions, FilterQuery, FindOneOptions, FindOptions, IDatabaseDriver, MikroORM, NativeInsertUpdateOptions, Platform, Primary, RequiredEntityData, Type, UpdateOptions } from "@mikro-orm/core";
import { Kysely, RawBuilder, SqliteDialect, Transaction } from "kysely";
import { SqlEntityManager } from "@mikro-orm/sql";
import { n as StepDatabase, t as PluginMigrationStep, u as DestructiveFinding } from "./steps-BowZpLj1.js";
type OrmSchema = EntitySchema<Record<string, unknown>>;
interface CompileOptions {
  readonly tenancy?: "single" | "shared-schema";
  readonly raw?: readonly OrmSchema[];
}
export declare function entityOfSchema(schema: object): EntityDef<string>;
export declare function compileEntities(defs: readonly EntityDef<string>[], options?: CompileOptions): OrmSchema[];
type Row$6 = Record<string, unknown>;
interface AggregateOptions {
  readonly groupBy?: readonly string[];
  readonly sum?: readonly string[];
  readonly count?: boolean;
  readonly where?: Row$6;
  readonly scope?: Row$6;
  readonly maxGroups?: number;
}
interface AggregateRow {
  readonly group: Row$6;
  readonly count?: number;
  readonly sum?: Row$6;
}
interface AggregateResult {
  readonly rows: AggregateRow[];
}
export declare function aggregate(em: EntityManager, schema: OrmSchema, options?: AggregateOptions): Promise<AggregateResult>;
interface EncryptionKeys {
  readonly current: string;
  readonly previous?: readonly string[];
}
export declare function useEncryptionKeys(keys: EncryptionKeys | undefined): void;
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
  readonly audit?: AuditSink | "table";
  readonly encryption?: EncryptionKeys;
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
export declare function resolveConnection(env: DatabaseEnv, variable?: string): ResolvedConnection;
export declare function createDatabase(env: DatabaseEnv, options: DatabaseOptions): Promise<Database>;
export declare function currentEntityManager(): EntityManager | undefined;
export declare function runInTransaction<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>;
type CommitHook = () => Promise<void> | void;
export declare function afterCommit(callback: CommitHook): void;
export declare function runInUnitOfWork<T>(db: Database, fn: (em: EntityManager) => Promise<T>): Promise<T>;
interface AuditEntry {
  readonly action: string;
  readonly entity?: string;
  readonly recordId?: string;
  readonly reason?: string;
  readonly data?: unknown;
  readonly piiOf?: EntityDef<string>;
  readonly tenantId?: string;
}
export declare function recordAudit(em: EntityManager, entry: AuditEntry): void;
export declare function auditTableSink(orm: Orm): AuditSink;
export declare const DATA_PLUGIN = "@bieberkit/data";
interface OutboxEntryRow {
  id: string;
  tenant?: string | null;
  event: string;
  eventVersion: number;
  entity?: string | null;
  recordId?: string | null;
  recordVersion?: number | null;
  payload: string;
  idempotencyKey?: string | null;
  requestId?: string | null;
  userId?: string | null;
  createdAt: number | string;
  availableAt: number | string;
  attempts: number;
  lastError?: string | null;
}
interface OutboxProcessedRow {
  subscriber: string;
  eventId: string;
  processedAt: number | string;
}
interface SequenceRow {
  tenant: string;
  name: string;
  period: string;
  value: number | string;
}
interface FeatureRowBase {
  id: string;
  tenant: string;
  entity: string;
  recordId: string;
}
interface CommentEntryRow extends FeatureRowBase {
  body: string;
  createdAt: Date;
  createdBy?: string | null;
}
interface TagEntryRow extends FeatureRowBase {
  tag: string;
  tagKey: string;
  createdAt: Date;
  createdBy?: string | null;
}
interface AttachmentEntryRow extends FeatureRowBase {
  storageKey: string;
  name: string;
  contentType: string;
  size: number | string;
  createdAt: Date;
  createdBy?: string | null;
}
interface TimelineEntryRow extends FeatureRowBase {
  type: string;
  data?: string | null;
  at: Date;
  actorId?: string | null;
}
interface AuditLogRow {
  id: string;
  tenant?: string | null;
  at: Date;
  actorId?: string | null;
  requestId?: string | null;
  action: string;
  entity?: string | null;
  recordId?: string | null;
  reason?: string | null;
  data?: string | null;
}
export declare const OutboxEntry: EntitySchema<OutboxEntryRow>;
export declare const OutboxProcessed: EntitySchema<OutboxProcessedRow>;
export declare const AuditLog: EntitySchema<AuditLogRow>;
export declare const Sequence: EntitySchema<SequenceRow>;
export declare const Comment: EntitySchema<CommentEntryRow>;
export declare const Tag: EntitySchema<TagEntryRow>;
export declare const Attachment: EntitySchema<AttachmentEntryRow>;
export declare const TimelineEntry: EntitySchema<TimelineEntryRow>;
export declare const frameworkEntities: readonly EntitySchema[];
type Trx = Kysely<StepDatabase>;
export declare const dataMigrationSteps: readonly PluginMigrationStep[];
export declare function grantAuditLog(trx: Trx, dialect: Dialect, role: string): Promise<void>;
interface FeaturePage<T> {
  readonly rows: T[];
  readonly limit: number;
  readonly nextCursor: string | null;
}
interface PageRequest {
  readonly limit?: unknown;
  readonly cursor?: string;
}
interface CommentRow {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}
interface TagRow {
  readonly id: string;
  readonly tag: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}
interface AttachmentInput {
  readonly key: string;
  readonly name: string;
  readonly contentType: string;
  readonly size: number;
}
interface AttachmentRow extends AttachmentInput {
  readonly id: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}
interface TimelineInput {
  readonly type: string;
  readonly data?: unknown;
}
interface TimelineRow {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
  readonly at: Date;
  readonly actorId: string | null;
}
export declare function addComment(em: EntityManager, schema: OrmSchema, recordId: string, input: {
  readonly body: string;
}): Promise<CommentRow>;
export declare function listComments(em: EntityManager, schema: OrmSchema, recordId: string, request?: PageRequest): Promise<FeaturePage<CommentRow>>;
export declare function deleteComment(em: EntityManager, schema: OrmSchema, recordId: string, commentId: string): Promise<boolean>;
export declare function addTag(em: EntityManager, schema: OrmSchema, recordId: string, text: string): Promise<TagRow>;
export declare function listTags(em: EntityManager, schema: OrmSchema, recordId: string, request?: PageRequest): Promise<FeaturePage<TagRow>>;
export declare function removeTag(em: EntityManager, schema: OrmSchema, recordId: string, text: string): Promise<boolean>;
export declare function addAttachment(em: EntityManager, schema: OrmSchema, recordId: string, input: AttachmentInput): Promise<AttachmentRow>;
export declare function listAttachments(em: EntityManager, schema: OrmSchema, recordId: string, request?: PageRequest): Promise<FeaturePage<AttachmentRow>>;
export declare function removeAttachment(em: EntityManager, schema: OrmSchema, recordId: string, attachmentId: string): Promise<boolean>;
export declare function addTimeline(em: EntityManager, schema: OrmSchema, recordId: string, input: TimelineInput): Promise<TimelineRow>;
export declare function listTimeline(em: EntityManager, schema: OrmSchema, recordId: string, request?: PageRequest): Promise<FeaturePage<TimelineRow>>;
export declare function formatSequence(pattern: string, value: number, now?: Date): string;
export declare function periodOf(resetEvery: ResetEvery | undefined, now?: Date): string;
interface SequenceKey {
  readonly entity: string;
  readonly field: string;
  readonly tenantId?: string;
}
interface SequenceOptions {
  readonly resetEvery?: ResetEvery;
  readonly now?: Date;
}
export declare function nextSequence(em: EntityManager, key: SequenceKey, options?: SequenceOptions): Promise<number>;
type Row$5 = Record<string, unknown>;
interface TransitionResult {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly event: string;
}
interface AvailableTransition {
  readonly name: string;
  readonly to: string;
  readonly permission?: string;
}
export declare function transitionOf(schema: OrmSchema, name: string): TransitionDef;
export declare function availableTransitions(schema: OrmSchema, row: Row$5): readonly AvailableTransition[];
export declare function entityEventName(entity: string, name: string): string;
export declare function transition(em: EntityManager, schema: OrmSchema, row: Row$5, name: string, input?: unknown): Promise<TransitionResult>;
export declare function retryOnDeadlock<T>(run: () => Promise<T>): Promise<T>;
interface OutboxEvent {
  readonly name: string;
  readonly version?: number;
  readonly payload: unknown;
  readonly record?: {
    readonly entity: string;
    readonly id: string;
    readonly version?: number;
  };
  readonly idempotencyKey?: string;
}
export declare function emitEvent(em: EntityManager, event: OutboxEvent): void;
interface OutboxMessage {
  readonly id: string;
  readonly jobId: string;
  readonly name: string;
  readonly version: number;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId?: string;
  readonly entity?: string;
  readonly recordId?: string;
  readonly recordVersion?: number;
  readonly payload: unknown;
  readonly idempotencyKey?: string;
  readonly createdAt: Date;
}
interface OutboxPublisher {
  publish(message: OutboxMessage, trx: Transaction<StepDatabase>): Promise<void>;
}
interface OutboxDispatcherOptions {
  readonly publisher: OutboxPublisher;
  readonly batchSize?: number;
  readonly pollMs?: number;
  readonly maxBackoffMs?: number;
  readonly logger?: Logger;
  readonly now?: () => number;
}
interface DispatchResult {
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
}
interface OutboxDispatcher {
  dispatchOnce(): Promise<DispatchResult>;
  start(): void;
  wake(): void;
  stop(): Promise<void>;
}
export declare function createOutboxDispatcher(db: Database, options: OutboxDispatcherOptions): OutboxDispatcher;
interface OutboxLag {
  readonly pending: number;
  readonly oldestAgeMs: number | null;
  readonly failing: number;
}
export declare function outboxLag(db: Database, now?: () => number): Promise<OutboxLag>;
export declare function processOnce(db: Database, subscriber: string, eventId: string, handler: (em: EntityManager) => Promise<void>): Promise<boolean>;
interface PurgeOptions {
  readonly olderThanMs?: number;
  readonly now?: () => number;
}
export declare function purgeProcessed(db: Database, options?: PurgeOptions): Promise<number>;
type Row$4 = Record<string, unknown>;
export declare function bulkInsert(em: EntityManager, schema: OrmSchema, rows: readonly Row$4[]): Promise<void>;
export declare function bulkUpdate(em: EntityManager, schema: OrmSchema, where: Row$4, data: Row$4): Promise<number>;
type RequestKysely = Kysely<StepDatabase>;
export declare function requestKysely(db: Database): RequestKysely;
export declare function rawKysely(db: {
  readonly orm: {
    readonly em: EntityManager;
  };
}): Promise<Kysely<StepDatabase>>;
interface PluginRefusal {
  readonly step: string;
  readonly code: string;
  readonly message: string;
}
interface PluginRun {
  readonly deployId: string;
  readonly applied: string[];
  readonly refused: PluginRefusal[];
  readonly waiting: string[];
}
interface PluginRunOptions {
  readonly pluginOrder: readonly string[];
  readonly deployId?: string;
}
export declare function runPluginMigrations(db: Kysely<StepDatabase>, dialect: Dialect, steps: readonly PluginMigrationStep[], options: PluginRunOptions): Promise<PluginRun>;
export declare function applyPluginMigrations(db: Database, steps: readonly PluginMigrationStep[], options: PluginRunOptions): Promise<PluginRun>;
interface MigrationEnv {
  readonly DB_CONNECTION: Dialect | undefined;
  readonly MIGRATE_DATABASE_URL: string | undefined;
  readonly DB_POOL_MAX: number;
}
interface MigratorOptions {
  readonly entities: readonly EntitySchema[];
  readonly directory: string;
  readonly logger?: Logger;
}
interface MadeMigration {
  readonly name: string;
  readonly path: string;
  readonly up: readonly string[];
  readonly down: readonly string[];
  readonly destructive: readonly DestructiveFinding[];
}
interface MigrationStatus {
  readonly executed: string[];
  readonly pending: string[];
}
interface UpOptions {
  readonly allowDestructive?: boolean;
}
interface Migrator {
  readonly dialect: Dialect;
  make(name?: string): Promise<MadeMigration | null>;
  up(options?: UpOptions): Promise<string[]>;
  down(): Promise<string[]>;
  status(): Promise<MigrationStatus>;
  runPluginSteps(steps: readonly PluginMigrationStep[], options: PluginRunOptions): Promise<PluginRun>;
  close(): Promise<void>;
}
export declare function openMigrator(env: MigrationEnv, options: MigratorOptions): Promise<Migrator>;
interface ReencryptOptions {
  readonly batchSize?: number;
}
interface ReencryptResult {
  readonly rows: number;
  readonly fields: number;
}
export declare function reencryptAll(db: Database, schemas: readonly OrmSchema[], options?: ReencryptOptions): Promise<ReencryptResult>;
export declare function uuidType(dialect: Dialect): RawBuilder<unknown>;
export declare function setNotNull(db: Kysely<StepDatabase>, dialect: Dialect, table: string, column: string, type: string): Promise<void>;
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
export declare const READ_YOUR_WRITES_MS: number;
interface ReadYourWrites {
  record(userId: string): Promise<void>;
  recently(userId: string): Promise<boolean>;
}
interface MemoryReadYourWritesOptions {
  readonly windowMs?: number;
  readonly now?: () => number;
}
export declare function createMemoryReadYourWrites(options?: MemoryReadYourWritesOptions): ReadYourWrites;
export declare function useReadYourWrites(port: ReadYourWrites): void;
export declare function expectVersion(row: object, expected: number | string): void;
type Row$3 = Record<string, unknown>;
interface SortOption {
  readonly field: string;
  readonly direction?: "asc" | "desc";
}
interface ListOptions {
  readonly where?: Row$3;
  readonly sort?: readonly SortOption[];
  readonly limit?: unknown;
  readonly cursor?: string;
  readonly offset?: number;
  readonly withTotal?: boolean;
  readonly select?: readonly string[];
  readonly populate?: readonly string[];
  readonly locale?: string;
  readonly scope?: Row$3;
}
interface Page {
  readonly rows: Row$3[];
  readonly limit: number;
  readonly nextCursor: string | null;
  readonly total?: number;
}
export declare function queryableFields(schema: OrmSchema): readonly string[];
export declare function listPage(em: EntityManager, schema: OrmSchema, options?: ListOptions): Promise<Page>;
type Row$2 = Record<string, unknown>;
export declare function findScoped(em: EntityManager, schema: OrmSchema, id: string, scope: Row$2 | undefined): Promise<Row$2 | null>;
export declare function findAllScoped(em: EntityManager, schema: OrmSchema, ids: readonly string[], scope: Row$2 | undefined): Promise<Row$2[]>;
type Row$1 = Record<string, unknown>;
export declare function translationName(entityName: string): string;
export declare function setTranslation(em: EntityManager, schema: OrmSchema, recordId: string, locale: string, values: Row$1): Promise<void>;
type Row = Record<string, unknown>;
export declare function toApiRow(schema: OrmSchema, row: Row): Row;
export declare function toOrmData(schema: OrmSchema, input: Row, _mode: "create" | "update"): Row;
export type { AggregateOptions, AggregateResult, AggregateRow, AttachmentInput, AttachmentRow, AuditEntry, AuditLogRow, AuditSink, AvailableTransition, CommentRow, CompileOptions, Database, DatabaseEnv, DatabaseOptions, DispatchResult, EncryptionKeys, FeaturePage, ListOptions, MadeMigration, MemoryReadYourWritesOptions, MigrationEnv, MigrationStatus, Migrator, MigratorOptions, Orm, OrmSchema, OutboxDispatcher, OutboxDispatcherOptions, OutboxEntryRow, OutboxEvent, OutboxLag, OutboxMessage, OutboxProcessedRow, OutboxPublisher, Page, PageRequest, PluginRefusal, PluginRun, PluginRunOptions, PurgeOptions, ReadYourWrites, ReencryptOptions, ReencryptResult, ReferenceVisibility, RequestKysely, ResolvedConnection, SequenceKey, SequenceOptions, SequenceRow, SortOption, SqliteOptions, SystemScopeEntry, TagRow, TimelineInput, TimelineRow, TransitionResult, UpOptions };
```
