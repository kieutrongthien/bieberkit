/**
 * BieberKit
 *
 * @file        packages/data/src/orm/framework.ts
 * @description The tables that the framework owns, as plugin steps and as MikroORM schemas: outbox, processed ids and audit log (MOD-18, OBS-05, DATA-24, DATA-25).
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

import { EntitySchema, DateTimeType } from '@mikro-orm/core';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { uuid7 } from '../keys/uuid7.ts';
import type { PluginMigrationStep, StepDatabase } from '../migrations/steps.ts';
import { uuidType } from './portable.ts';
import { Uuid7Type } from './uuid7-type.ts';

/** The name of the plugin that owns the framework tables in the ledger of plugin steps. */
export const DATA_PLUGIN = '@bieberkit/data';

export const OUTBOX_TABLE = 'bieberkit_outbox';
export const PROCESSED_TABLE = 'bieberkit_outbox_processed';
export const AUDIT_TABLE = 'audit_log';
export const SEQUENCE_TABLE = 'bieberkit_sequences';
/** The class name of the audit schema. The unit of work refuses to change an entity of this name (DATA-25). */
export const AUDIT_ENTITY = 'bieberkit.AuditLog';

/** A row of the outbox. Times are epoch milliseconds, and bigint columns may come back as text. */
export interface OutboxEntryRow {
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

export interface OutboxProcessedRow {
  subscriber: string;
  eventId: string;
  processedAt: number | string;
}

export interface SequenceRow {
  tenant: string;
  name: string;
  period: string;
  value: number | string;
}

export interface AuditLogRow {
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

const uuid = <T extends object>(extra: T): { type: typeof Uuid7Type } & T => ({ type: Uuid7Type, ...extra });

export const OutboxEntry: EntitySchema<OutboxEntryRow> = new EntitySchema<OutboxEntryRow>({
  name: 'bieberkit.OutboxEntry',
  tableName: OUTBOX_TABLE,
  properties: {
    id: uuid({ primary: true, onCreate: () => uuid7() }),
    tenant: uuid({ fieldName: 'tenant_id', nullable: true }),
    event: { type: 'string', length: 200 },
    eventVersion: { type: 'integer', onCreate: () => 1 },
    entity: { type: 'string', length: 200, nullable: true },
    recordId: uuid({ nullable: true }),
    recordVersion: { type: 'integer', nullable: true },
    payload: { type: 'text' },
    idempotencyKey: { type: 'string', length: 120, nullable: true },
    requestId: { type: 'string', length: 64, nullable: true },
    userId: uuid({ nullable: true }),
    createdAt: { type: 'bigint', onCreate: () => Date.now() },
    availableAt: { type: 'bigint', onCreate: () => 0 },
    attempts: { type: 'integer', onCreate: () => 0 },
    lastError: { type: 'text', nullable: true },
  },
  indexes: [{ name: 'bieberkit_outbox_due_index', properties: ['availableAt', 'createdAt', 'id'] }],
});

export const OutboxProcessed: EntitySchema<OutboxProcessedRow> = new EntitySchema<OutboxProcessedRow>({
  name: 'bieberkit.OutboxProcessed',
  tableName: PROCESSED_TABLE,
  properties: {
    subscriber: { type: 'string', length: 200, primary: true },
    eventId: uuid({ primary: true }),
    processedAt: { type: 'bigint' },
  },
  indexes: [{ name: 'bieberkit_outbox_processed_at_index', properties: ['processedAt'] }],
});

export const AuditLog: EntitySchema<AuditLogRow> = new EntitySchema<AuditLogRow>({
  name: AUDIT_ENTITY,
  tableName: AUDIT_TABLE,
  properties: {
    id: uuid({ primary: true, onCreate: () => uuid7() }),
    tenant: uuid({ fieldName: 'tenant_id', nullable: true }),
    at: { type: DateTimeType, length: 3, onCreate: () => new Date() },
    actorId: uuid({ nullable: true }),
    requestId: { type: 'string', length: 64, nullable: true },
    action: { type: 'string', length: 200 },
    entity: { type: 'string', length: 200, nullable: true },
    recordId: uuid({ nullable: true }),
    reason: { type: 'text', nullable: true },
    data: { type: 'text', nullable: true },
  },
  indexes: [{ name: 'audit_log_tenant_at_index', properties: ['tenant', 'at'] }],
});

export const Sequence: EntitySchema<SequenceRow> = new EntitySchema<SequenceRow>({
  name: 'bieberkit.Sequence',
  tableName: SEQUENCE_TABLE,
  properties: {
    tenant: uuid({ primary: true, fieldName: 'tenant_id' }),
    name: { type: 'string', length: 200, primary: true },
    period: { type: 'string', length: 16, primary: true },
    value: { type: 'bigint' },
  },
});

/** The schemas that `createDatabase` adds to the entities of the project. */
export const frameworkEntities: readonly EntitySchema[] = [OutboxEntry, OutboxProcessed, AuditLog, Sequence];

type Trx = Kysely<StepDatabase>;

const instant = (dialect: Dialect): ReturnType<typeof sql.raw> =>
  sql.raw(dialect === 'postgres' ? 'timestamptz(3)' : dialect === 'mysql' ? 'datetime(3)' : 'datetime');

function step(
  id: string,
  kind: PluginMigrationStep['kind'],
  up: PluginMigrationStep['up'],
  version = '0.1.0',
): PluginMigrationStep {
  return { plugin: DATA_PLUGIN, version, id, kind, up };
}

/**
 * The steps that make the tables of the framework (DATA-24). One step is one DDL statement, so a failed run on MySQL can be
 * repeated. The application role gets no rights here: `grantAuditLog` and the grants of the deploy do that (DATA-25).
 */
export const dataMigrationSteps: readonly PluginMigrationStep[] = [
  step('outbox-create', 'expand', async (trx: Trx, dialect) => {
    await trx.schema
      .createTable(OUTBOX_TABLE)
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('tenant_id', uuidType(dialect))
      .addColumn('event', 'varchar(200)', (c) => c.notNull())
      .addColumn('event_version', 'integer', (c) => c.notNull())
      .addColumn('entity', 'varchar(200)')
      .addColumn('record_id', uuidType(dialect))
      .addColumn('record_version', 'integer')
      .addColumn('payload', 'text', (c) => c.notNull())
      .addColumn('idempotency_key', 'varchar(120)')
      .addColumn('request_id', 'varchar(64)')
      .addColumn('user_id', uuidType(dialect))
      .addColumn('created_at', 'bigint', (c) => c.notNull())
      .addColumn('available_at', 'bigint', (c) => c.notNull())
      .addColumn('attempts', 'integer', (c) => c.notNull())
      .addColumn('last_error', 'text')
      .addPrimaryKeyConstraint(`${OUTBOX_TABLE}_pkey`, ['id'])
      .execute();
  }),
  step('outbox-due-index', 'expand', async (trx: Trx) => {
    await trx.schema
      .createIndex('bieberkit_outbox_due_index')
      .on(OUTBOX_TABLE)
      .columns(['available_at', 'created_at', 'id'])
      .execute();
  }),
  step('outbox-processed-create', 'expand', async (trx: Trx, dialect) => {
    await trx.schema
      .createTable(PROCESSED_TABLE)
      .addColumn('subscriber', 'varchar(200)', (c) => c.notNull())
      .addColumn('event_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('processed_at', 'bigint', (c) => c.notNull())
      .addPrimaryKeyConstraint(`${PROCESSED_TABLE}_pkey`, ['subscriber', 'event_id'])
      .execute();
  }),
  step('outbox-processed-index', 'expand', async (trx: Trx) => {
    await trx.schema
      .createIndex('bieberkit_outbox_processed_at_index')
      .on(PROCESSED_TABLE)
      .column('processed_at')
      .execute();
  }),
  step('audit-log-create', 'expand', async (trx: Trx, dialect) => {
    await trx.schema
      .createTable(AUDIT_TABLE)
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('tenant_id', uuidType(dialect))
      .addColumn('at', instant(dialect), (c) => c.notNull())
      .addColumn('actor_id', uuidType(dialect))
      .addColumn('request_id', 'varchar(64)')
      .addColumn('action', 'varchar(200)', (c) => c.notNull())
      .addColumn('entity', 'varchar(200)')
      .addColumn('record_id', uuidType(dialect))
      .addColumn('reason', 'text')
      .addColumn('data', 'text')
      .addPrimaryKeyConstraint(`${AUDIT_TABLE}_pkey`, ['id'])
      .execute();
  }),
  step('audit-log-index', 'expand', async (trx: Trx) => {
    await trx.schema.createIndex('audit_log_tenant_at_index').on(AUDIT_TABLE).columns(['tenant_id', 'at']).execute();
  }),
  // On SQLite a trigger is the append-only rule. PostgreSQL and MySQL use grants instead (`grantAuditLog`).
  step('audit-log-no-update', 'expand', async (trx: Trx, dialect) => {
    if (dialect !== 'sqlite') return;
    await sql`create trigger audit_log_no_update before update on audit_log begin select raise(abort, 'audit_log is append-only'); end`.execute(
      trx,
    );
  }),
  step('audit-log-no-delete', 'expand', async (trx: Trx, dialect) => {
    if (dialect !== 'sqlite') return;
    await sql`create trigger audit_log_no_delete before delete on audit_log begin select raise(abort, 'audit_log is append-only'); end`.execute(
      trx,
    );
  }),
  step(
    'sequences-create',
    'expand',
    async (trx: Trx, dialect) => {
      await trx.schema
        .createTable(SEQUENCE_TABLE)
        .addColumn('tenant_id', uuidType(dialect), (c) => c.notNull())
        .addColumn('name', 'varchar(200)', (c) => c.notNull())
        .addColumn('period', 'varchar(16)', (c) => c.notNull())
        .addColumn('value', 'bigint', (c) => c.notNull())
        .addPrimaryKeyConstraint(`${SEQUENCE_TABLE}_pkey`, ['tenant_id', 'name', 'period'])
        .execute();
    },
    '0.2.0',
  ),
];

const ROLE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MYSQL_ROLE = /^([A-Za-z_][A-Za-z0-9_]*)(?:@([A-Za-z0-9_.%:-]+))?$/;

/**
 * Gives the application role `select` and `insert` on the audit log and nothing else on it (DATA-25, OBS-05). Run it as the
 * migrate role after the steps, with the user of `DATABASE_URL`. On MySQL `role` may be `user@host`, and the host is `%` when
 * it is left out. A role that has rights on the whole database keeps them, because MySQL cannot take one table out of that:
 * grant the application role its tables one by one. SQLite has no roles, and its triggers do the work.
 */
export async function grantAuditLog(trx: Trx, dialect: Dialect, role: string): Promise<void> {
  const mysql = MYSQL_ROLE.exec(role);
  if (dialect === 'mysql' ? mysql === null : !ROLE.test(role)) {
    throw dataError(
      'DATA_IDENTIFIER_INVALID',
      500,
      `"${role}" is not the name of a database role.`,
      'Use the user of DATABASE_URL: letters, digits and underscores.',
    );
  }
  if (dialect === 'postgres') {
    await sql.raw(`revoke all on ${AUDIT_TABLE} from "${role}"`).execute(trx);
    await sql.raw(`grant select, insert on ${AUDIT_TABLE} to "${role}"`).execute(trx);
  } else if (dialect === 'mysql') {
    const account = `'${mysql?.[1] ?? role}'@'${mysql?.[2] ?? '%'}'`;
    await sql.raw(`grant select, insert on ${AUDIT_TABLE} to ${account}`).execute(trx);
  }
}
