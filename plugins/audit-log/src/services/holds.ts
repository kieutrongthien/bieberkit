/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/services/holds.ts
 * @description The legal holds of the audit log: placing, listing and releasing a hold on an entity, a record or an actor (AUD-09, ADR 0032).
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

import { requestContext } from '@bieberkit/core';
import { decodeCursor, encodeCursor, isUuid, pageSize } from '@bieberkit/data';
import { AuditHold, recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { AuditHoldRow, Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';

/** How many holds may be active at once, so that the prune builds one bounded condition (ADR 0032). */
export const MAX_ACTIVE_HOLDS = 200;

export interface HoldView {
  readonly id: string;
  readonly tenant: string | null;
  readonly entity: string | null;
  readonly recordId: string | null;
  readonly actorId: string | null;
  readonly reason: string;
  readonly createdAt: string;
  readonly createdBy: string | null;
  readonly releasedAt: string | null;
  readonly releasedBy: string | null;
}

export interface NewHold {
  readonly entity?: string | undefined;
  readonly recordId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly reason: string;
  /** The tenant of the caller. A caller with no tenant places a hold on every tenant. */
  readonly scope: string | undefined;
}

const iso = (value: Date | null | undefined): string | null => (value == null ? null : new Date(value).toISOString());

const viewOf = (row: AuditHoldRow): HoldView => ({
  id: row.id,
  tenant: row.tenant ?? null,
  entity: row.entity ?? null,
  recordId: row.recordId ?? null,
  actorId: row.actorId ?? null,
  reason: row.reason,
  createdAt: new Date(row.createdAt).toISOString(),
  createdBy: row.createdBy ?? null,
  releasedAt: iso(row.releasedAt),
  releasedBy: row.releasedBy ?? null,
});

const notFound = (): never => {
  throw new HttpError('AUDIT_HOLD_NOT_FOUND', 404, 'The hold does not exist.', 'Check the id of the hold.');
};

/** Places a hold. At least one of entity, record and actor says what it covers, and a reason says why. */
export async function placeHold(db: Database, input: NewHold): Promise<HoldView> {
  const reason = input.reason.trim();
  const entity = input.entity?.trim();
  if (
    reason === '' ||
    ((entity === undefined || entity === '') && input.recordId === undefined && input.actorId === undefined)
  ) {
    throw new HttpError(
      'AUDIT_HOLD_INVALID',
      400,
      'A hold needs a reason and an entity, a record or an actor.',
      'Say what the hold covers and why.',
    );
  }
  const userId = requestContext.get()?.userId ?? null;
  return runInTransaction(db, async (em) => {
    const active = await em.count(AuditHold, { releasedAt: null });
    if (active >= MAX_ACTIVE_HOLDS) {
      throw new HttpError(
        'AUDIT_HOLD_LIMIT',
        409,
        `There are already ${String(MAX_ACTIVE_HOLDS)} active holds.`,
        'Release a hold that is no longer needed.',
      );
    }
    const row = em.create(AuditHold, {
      tenant: input.scope ?? null,
      entity: entity === undefined || entity === '' ? null : entity,
      recordId: input.recordId?.toLowerCase() ?? null,
      actorId: input.actorId?.toLowerCase() ?? null,
      reason,
      createdAt: new Date(),
      createdBy: userId,
    });
    await em.flush();
    recordAudit(em, {
      action: 'audit-log.hold.placed',
      entity: 'bieberkit.AuditHold',
      recordId: row.id,
      reason,
      data: { entity: row.entity, recordId: row.recordId, actorId: row.actorId },
    });
    await em.flush();
    return viewOf(row);
  });
}

/** The holds of the reader's tenant, or of every tenant for a reader outside one. Active ones unless `all`. */
export async function listHolds(
  db: Database,
  input: {
    readonly scope: string | undefined;
    readonly status: 'active' | 'released' | 'all';
    readonly pageSize?: unknown;
    readonly cursor?: string | undefined;
  },
): Promise<{ data: HoldView[]; meta: { pageSize: number; nextCursor: string | null } }> {
  const size = pageSize(input.pageSize);
  const after = input.cursor === undefined || input.cursor === '' ? undefined : String(decodeCursor(input.cursor)[0]);
  const rows = await runInUnitOfWork(db, (em) =>
    em.find(
      AuditHold,
      {
        ...(after === undefined ? {} : { id: { $lt: after } }),
        ...(input.scope === undefined ? {} : { tenant: input.scope }),
        ...(input.status === 'active'
          ? { releasedAt: null }
          : input.status === 'released'
            ? { releasedAt: { $ne: null } }
            : {}),
      },
      { orderBy: { id: 'desc' }, limit: size + 1 },
    ),
  );
  const shown = rows.slice(0, size);
  const last = shown.at(-1);
  return {
    data: shown.map(viewOf),
    meta: { pageSize: size, nextCursor: rows.length > size && last !== undefined ? encodeCursor([last.id]) : null },
  };
}

/** Releases a hold by a mark: the row stays. Releasing a hold that is released is not an error. */
export async function releaseHold(db: Database, id: string, scope: string | undefined): Promise<void> {
  if (!isUuid(id)) return notFound();
  const userId = requestContext.get()?.userId ?? null;
  await runInTransaction(db, async (em) => {
    const row = await em.findOne(AuditHold, { id, ...(scope === undefined ? {} : { tenant: scope }) });
    if (row === null) return notFound();
    if (row.releasedAt != null) return undefined;
    em.assign(row, { releasedAt: new Date(), releasedBy: userId });
    await em.flush();
    recordAudit(em, {
      action: 'audit-log.hold.released',
      entity: 'bieberkit.AuditHold',
      recordId: row.id,
      data: { entity: row.entity, recordId: row.recordId, actorId: row.actorId },
    });
    await em.flush();
    return undefined;
  });
}
