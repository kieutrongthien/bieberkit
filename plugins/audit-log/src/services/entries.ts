/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/services/entries.ts
 * @description The reads of the audit log: filters in the tenant of the request, pages by keyset, the actor of each entry, the distinct actions and the pages of an export (AUD-01 to AUD-05).
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

import { raw } from '@mikro-orm/core';
import { SqlEntityManager } from '@mikro-orm/sql';
import { AuthUser } from '@bieberkit/auth';
import { decodeCursor, encodeCursor, isUuid } from '@bieberkit/data';
import { AuditLog, runInUnitOfWork } from '@bieberkit/data/orm';
import type { AuditLogRow, Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';

const NIL = '00000000-0000-0000-0000-000000000000';

/** The filters of AUD-01, as the query of a route gives them. */
export interface Filters {
  readonly from?: string;
  readonly to?: string;
  /** Exact, or a prefix when it ends in `*`. */
  readonly action?: string;
  readonly entity?: string;
  readonly recordId?: string;
  readonly actorId?: string;
  readonly requestId?: string;
}

export const FILTER_KEYS: readonly (keyof Filters)[] = [
  'from',
  'to',
  'action',
  'entity',
  'recordId',
  'actorId',
  'requestId',
];

export interface Actor {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface EntryView {
  readonly id: string;
  readonly at: string;
  readonly tenant: string | null;
  readonly actorId: string | null;
  readonly actor: Actor | null;
  readonly requestId: string | null;
  readonly action: string;
  readonly entity: string | null;
  readonly recordId: string | null;
  readonly reason: string | null;
  readonly data: unknown;
}

type Where = Record<string, unknown>;

/** The tenant that reads are limited to: the tenant of the request, or none for a reader outside a tenant or in the nil one (AUD-05). */
export const scopeOf = (tenantId: string | undefined): string | undefined =>
  tenantId === undefined || tenantId.toLowerCase() === NIL ? undefined : tenantId.toLowerCase();

/** The `!` escape of LIKE: one character that every dialect accepts in `escape '!'`. */
const likePrefix = (text: string): string => `${text.replaceAll(/[!%_]/g, (found) => `!${found}`)}%`;

/** The filters as a `where` of the ORM, inside the tenant of the reader. */
export function whereOf(filters: Filters, scope: string | undefined): Where {
  const at: Where = {};
  if (filters.from !== undefined) at['$gte'] = new Date(filters.from);
  if (filters.to !== undefined) at['$lte'] = new Date(filters.to);
  const action = filters.action;
  return {
    ...(scope === undefined ? {} : { tenant: scope }),
    ...(Object.keys(at).length === 0 ? {} : { at }),
    ...(action === undefined
      ? {}
      : action.endsWith('*')
        ? { [raw("action like ? escape '!'", [likePrefix(action.slice(0, -1))])]: [] }
        : { action }),
    ...(filters.entity === undefined ? {} : { entity: filters.entity }),
    ...(filters.recordId === undefined ? {} : { recordId: filters.recordId }),
    ...(filters.actorId === undefined ? {} : { actorId: filters.actorId }),
    ...(filters.requestId === undefined ? {} : { requestId: filters.requestId }),
  };
}

/** What was stored as JSON text is given back as JSON, and anything else as it is. */
function dataOf(value: string | null | undefined): unknown {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** The actors of some entries, in one query. A deleted user keeps its anonymized row (USR-06). */
async function actorsOf(db: Database, rows: readonly AuditLogRow[]): Promise<Map<string, Actor>> {
  const ids = [
    ...new Set(rows.flatMap((row) => (row.actorId === null || row.actorId === undefined ? [] : [row.actorId]))),
  ];
  if (ids.length === 0) return new Map();
  const users = await runInUnitOfWork(db, (em) => em.find(AuthUser, { id: { $in: ids } }));
  return new Map(users.map((user) => [user.id, { id: user.id, name: user.name, email: user.email }]));
}

async function viewsOf(db: Database, rows: readonly AuditLogRow[]): Promise<EntryView[]> {
  const actors = await actorsOf(db, rows);
  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    tenant: row.tenant ?? null,
    actorId: row.actorId ?? null,
    actor: row.actorId === null || row.actorId === undefined ? null : (actors.get(row.actorId) ?? null),
    requestId: row.requestId ?? null,
    action: row.action,
    entity: row.entity ?? null,
    recordId: row.recordId ?? null,
    reason: row.reason ?? null,
    data: dataOf(row.data),
  }));
}

/** One page, newest first. The ids are UUIDv7, so their order is the order of the writes, and a cursor on the id skips no row. */
async function pageOf(
  db: Database,
  where: Where,
  size: number,
  cursor: string | undefined,
  ascending = false,
): Promise<AuditLogRow[]> {
  return runInUnitOfWork(db, (em) =>
    em.find(AuditLog, cursor === undefined ? where : { ...where, id: { [ascending ? '$gt' : '$lt']: cursor } }, {
      orderBy: { id: ascending ? 'asc' : 'desc' },
      limit: size,
    }),
  );
}

/**
 * One page after an entry, oldest first, for a SIEM that polls (AUD-08). `nextAfter` is the id to resume from: the last entry of the
 * page, or the one that was given when nothing is newer. Each entry is read once and in order.
 */
export async function listAfter(
  db: Database,
  input: { readonly where: Where; readonly size: number; readonly after: string },
): Promise<{ data: EntryView[]; meta: { pageSize: number; nextCursor: null; nextAfter: string } }> {
  if (!isUuid(input.after)) {
    throw new HttpError(
      'AUDIT_AFTER_INVALID',
      400,
      'after is not the id of an entry.',
      'Give the id of the last entry read.',
    );
  }
  const rows = await pageOf(db, input.where, input.size, input.after.toLowerCase(), true);
  return {
    data: await viewsOf(db, rows),
    meta: { pageSize: input.size, nextCursor: null, nextAfter: rows.at(-1)?.id ?? input.after.toLowerCase() },
  };
}

const cursorOf = (cursor: string | undefined): string | undefined =>
  cursor === undefined || cursor === '' ? undefined : String(decodeCursor(cursor)[0]);

export async function listEntries(
  db: Database,
  input: { readonly where: Where; readonly size: number; readonly cursor?: string; readonly withTotal: boolean },
): Promise<{
  data: EntryView[];
  meta: { pageSize: number; nextCursor: string | null; total?: number };
}> {
  const rows = await pageOf(db, input.where, input.size + 1, cursorOf(input.cursor));
  const shown = rows.slice(0, input.size);
  const last = shown.at(-1);
  const total = input.withTotal ? await runInUnitOfWork(db, (em) => em.count(AuditLog, input.where)) : undefined;
  return {
    data: await viewsOf(db, shown),
    meta: {
      pageSize: input.size,
      nextCursor: rows.length > input.size && last !== undefined ? encodeCursor([last.id]) : null,
      ...(total === undefined ? {} : { total }),
    },
  };
}

export async function oneEntry(db: Database, id: string, scope: string | undefined): Promise<EntryView> {
  const row = isUuid(id)
    ? await runInUnitOfWork(db, (em) => em.findOne(AuditLog, { id, ...(scope === undefined ? {} : { tenant: scope }) }))
    : null;
  if (row === null) {
    throw new HttpError('AUDIT_NOT_FOUND', 404, 'The audit entry does not exist.', 'Check the id of the entry.');
  }
  const [view] = await viewsOf(db, [row]);
  if (view === undefined) throw new Error('An entry gave no view.');
  return view;
}

/** The distinct actions, in order, inside the tenant of the reader (AUD-04). */
export async function actionsOf(db: Database, scope: string | undefined): Promise<string[]> {
  return runInUnitOfWork(db, async (em) => {
    if (!(em instanceof SqlEntityManager)) throw new Error('The audit log needs an SQL database.');
    const query = em
      .createQueryBuilder(AuditLog)
      .select('action', true)
      .where(scope === undefined ? {} : { tenant: scope })
      .orderBy({ action: 'asc' });
    const rows: { action: string }[] = await query.execute('all');
    return rows.map((row) => row.action);
  });
}

/** Whether more than `max` entries match, found with one row past the limit and no count (AUD-03). */
export async function moreThan(db: Database, where: Where, max: number, after?: string): Promise<boolean> {
  const bounded = after === undefined ? where : { ...where, id: { $gt: after.toLowerCase() } };
  const rows = await runInUnitOfWork(db, (em) =>
    em.find(AuditLog, bounded, { orderBy: { id: 'desc' }, offset: max, limit: 1, fields: ['id'] }),
  );
  return rows.length > 0;
}

/** The entries of an export, page by page by keyset, at most `max` of them. */
export async function* exportPages(
  db: Database,
  where: Where,
  max: number,
  size = 500,
  after?: string,
): AsyncGenerator<EntryView[]> {
  const ascending = after !== undefined;
  let cursor: string | undefined = after?.toLowerCase();
  let left = max;
  while (left > 0) {
    const rows = await pageOf(db, where, Math.min(size, left), cursor, ascending);
    if (rows.length === 0) return;
    yield await viewsOf(db, rows);
    left -= rows.length;
    cursor = rows.at(-1)?.id;
    if (rows.length < Math.min(size, left + rows.length)) return;
  }
}
