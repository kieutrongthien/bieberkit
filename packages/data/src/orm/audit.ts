/**
 * BieberKit
 *
 * @file        packages/data/src/orm/audit.ts
 * @description Audit entries written with the data of a unit of work, and the sink that records the use of asSystem in the audit log (OBS-05, AUTHZ-05).
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

import type { EntityManager } from '@mikro-orm/core';
import { SqlEntityManager } from '@mikro-orm/sql';
import { requestContext } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { redactPii } from '../schema/pii.ts';
import type { EntityDef } from '../schema/define-entity.ts';
import type { Database, Orm } from './connect.ts';
import { emitEvent } from './outbox.ts';
import { AuditHold, AuditLog } from './framework.ts';
import type { AuditSink, SystemScopeEntry } from './tenant.ts';

export interface AuditEntry {
  /** What happened, for example `auth.role.update` or `crm.customer.approve`. */
  readonly action: string;
  readonly entity?: string;
  readonly recordId?: string;
  /** Why, in words. `asSystem` writes the reason it was given. */
  readonly reason?: string;
  /** What changed. Anything that JSON can hold. Never put a value of a `pii` field in it in clear text (PDP-06). */
  readonly data?: unknown;
  /** The entity that `data` is about. The values of its `pii` fields are replaced by `[redacted]` before the entry is written. */
  readonly piiOf?: EntityDef<string>;
  /** The tenant of the entry. Defaults to the tenant of the request. */
  readonly tenantId?: string;
}

function dataText(data: unknown): string | null {
  if (data === undefined) return null;
  const text = JSON.stringify(data);
  if (text === undefined) {
    throw dataError(
      'DATA_AUDIT_INVALID',
      500,
      'The data of an audit entry is not JSON.',
      'Put text, numbers, booleans, null, arrays and objects in it.',
    );
  }
  return text;
}

/**
 * Adds an audit entry to the unit of work. The flush that writes the data writes it, in the same transaction, and a flush that
 * fails leaves no entry (§7.5, OBS-05). The actor and the request come from the request context.
 */
/** The name of the outbox event that carries an audit entry to the mirror (AUD-07). */
export const AUDIT_RECORDED_EVENT = 'audit.entry.recorded';

// The databases whose audit entries are also written to the outbox. Keyed by configuration, so a process may open several.
const mirrored = new WeakSet<object>();

/** Turns the mirror on for a database: each audit entry then also leaves an `audit.entry.recorded` event in its transaction (AUD-07). */
export function mirrorAudit(orm: Orm): void {
  mirrored.add(orm.config);
}

export function recordAudit(em: EntityManager, entry: AuditEntry): void {
  if (entry.action.trim() === '' || entry.action.length > 200) {
    throw dataError(
      'DATA_AUDIT_INVALID',
      500,
      'The action of an audit entry has 1 to 200 characters.',
      'Name it like auth.role.update.',
    );
  }
  const context = requestContext.get();
  const row = em.create(AuditLog, {
    action: entry.action,
    at: new Date(),
    entity: entry.entity ?? null,
    recordId: entry.recordId ?? null,
    reason: entry.reason ?? null,
    data: dataText(entry.piiOf === undefined ? entry.data : redactPii(entry.piiOf, entry.data)),
    tenant: entry.tenantId ?? context?.tenantId ?? null,
    actorId: context?.userId ?? null,
    requestId: context?.requestId ?? null,
  });
  if (mirrored.has(em.config)) {
    emitEvent(em, {
      name: AUDIT_RECORDED_EVENT,
      payload: {
        id: row.id,
        at: row.at.toISOString(),
        action: row.action,
        entity: row.entity,
        recordId: row.recordId,
        actorId: row.actorId,
        requestId: row.requestId,
        tenant: row.tenant,
        reason: row.reason,
        data: row.data == null ? null : JSON.parse(row.data),
      },
    });
  }
}

/**
 * The sink that writes the use of `asSystem` to the audit log (AUTHZ-05). It writes in a transaction of its own and before the
 * function runs, so a function that fails still leaves its entry, and a write that fails stops the scope from starting.
 */
export function auditTableSink(orm: Orm): AuditSink {
  return {
    async record(entry: SystemScopeEntry): Promise<void> {
      const em = orm.em.fork();
      em.create(AuditLog, {
        action: 'system.scope',
        reason: entry.reason,
        at: entry.at,
        tenant: entry.tenantId ?? null,
        actorId: entry.userId ?? null,
        requestId: entry.requestId ?? null,
      });
      await em.flush();
    },
  };
}

export interface AuditPruneOptions {
  /** Entries written before this instant are deleted. */
  readonly before: Date;
  /** Deletes when true. When false, only counts (AUD-06). */
  readonly apply: boolean;
}

export interface AuditPrune {
  /** The entries before the date that are not under a hold: counted, or deleted when `pruned`. */
  readonly count: number;
  readonly pruned: boolean;
  /** The entries before the date that a legal hold keeps (AUD-09). */
  readonly kept: number;
}

const NO_DELETE_TRIGGER =
  "create trigger bk_audit_log_no_delete before delete on bk_audit_log begin select raise(abort, 'bk_audit_log is append-only'); end";

/**
 * The retention of the audit log (AUD-06). Give it a database opened on `MIGRATE_DATABASE_URL`: the application role may not delete
 * audit rows (DATA-25). It deletes the entries before `before` and writes `audit.pruned` in one transaction. On SQLite, where a trigger is
 * the append-only rule, the trigger is lifted and made again inside that transaction, so no other writer ever sees the table without it.
 */
export async function pruneAuditLog(db: Database, options: AuditPruneOptions): Promise<AuditPrune> {
  const { before } = options;
  if (!(before instanceof Date) || Number.isNaN(before.getTime())) {
    throw dataError(
      'DATA_AUDIT_PRUNE_INVALID',
      400,
      'The date to prune before is not a date.',
      'Give an ISO 8601 date, for example 2026-01-01.',
    );
  }
  const older = { at: { $lt: before } };
  // The entries under a hold that is not released are kept, whatever their age (AUD-09, ADR 0032).
  const holds = await db.fork().find(AuditHold, { releasedAt: null });
  const covered = holds.map((hold) => ({
    ...(hold.tenant == null ? {} : { tenant: hold.tenant }),
    ...(hold.entity == null ? {} : { entity: hold.entity }),
    ...(hold.recordId == null ? {} : { recordId: hold.recordId }),
    ...(hold.actorId == null ? {} : { actorId: hold.actorId }),
  }));
  const prunable = covered.length === 0 ? older : { $and: [older, { $not: { $or: covered } }] };
  const kept = covered.length === 0 ? 0 : await db.fork().count(AuditLog, { $and: [older, { $or: covered }] });
  if (!options.apply) return { count: await db.fork().count(AuditLog, prunable), pruned: false, kept };
  const em = db.fork();
  if (!(em instanceof SqlEntityManager)) {
    throw dataError('DATA_DRIVER_UNSUPPORTED', 500, 'This database has no SQL.', 'Use PostgreSQL, MySQL or SQLite.');
  }
  return em.transactional(async (trx) => {
    const sqlite = db.dialect === 'sqlite';
    if (sqlite) await trx.execute('drop trigger if exists bk_audit_log_no_delete');
    const count = await trx.nativeDelete(AuditLog, prunable);
    if (sqlite) await trx.execute(NO_DELETE_TRIGGER);
    recordAudit(trx, { action: 'audit.pruned', data: { before: before.toISOString(), count, kept } });
    await trx.flush();
    return { count, pruned: true, kept };
  });
}
