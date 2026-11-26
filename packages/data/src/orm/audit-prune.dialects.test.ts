/**
 * BieberKit
 *
 * @file        packages/data/src/orm/audit-prune.dialects.test.ts
 * @description Tests of pruneAuditLog: it counts first, deletes only when asked, writes its own entry, and leaves the audit log append-only for the application (AUD-06, DATA-25).
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

import { sql } from 'kysely';
import { afterEach, expect, it, vi } from 'vitest';
import { describeDialects } from '../testing/dialects.ts';
import { pruneAuditLog, recordAudit } from './audit.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { AuditLog } from './framework.ts';
import { kyselyOf } from './internals.ts';

const DAY = 86_400_000;

async function write(db: Database, action: string): Promise<void> {
  await runInUnitOfWork(db, async (em) => {
    recordAudit(em, { action });
    await em.flush();
  });
}

const actions = async (db: Database): Promise<string[]> =>
  (await db.fork().find(AuditLog, {}, { orderBy: { id: 'asc' } })).map((row) => row.action);

afterEach(() => {
  vi.useRealTimers();
});

describeDialects('AUD-06 pruning the audit log', ({ dialect, openFramework }) => {
  async function aged(): Promise<{ db: Database; cutoff: Date }> {
    const db = await openFramework();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() - 400 * DAY);
    await write(db, 'old.one');
    await write(db, 'old.two');
    vi.useRealTimers();
    await write(db, 'new.one');
    return { db, cutoff: new Date(Date.now() - 365 * DAY) };
  }

  it('AUD-06 without apply it only counts the rows before the date', async () => {
    const { db, cutoff } = await aged();
    expect(await pruneAuditLog(db, { before: cutoff, apply: false })).toEqual({ count: 2, pruned: false });
    expect(await actions(db)).toEqual(['old.one', 'old.two', 'new.one']);
  });

  it('AUD-06 with apply it deletes the rows before the date and writes its own entry in the same transaction', async () => {
    const { db, cutoff } = await aged();
    expect(await pruneAuditLog(db, { before: cutoff, apply: true })).toEqual({ count: 2, pruned: true });
    expect(await actions(db)).toEqual(['new.one', 'audit.pruned']);
    const [entry] = await db.fork().find(AuditLog, { action: 'audit.pruned' });
    expect(JSON.parse(String(entry?.data))).toEqual({ before: cutoff.toISOString(), count: 2 });
    expect(await pruneAuditLog(db, { before: cutoff, apply: true })).toEqual({ count: 0, pruned: true });
  });

  it('AUD-06 refuses a date that is not a date', async () => {
    const { db } = await aged();
    await expect(pruneAuditLog(db, { before: new Date('nope'), apply: true })).rejects.toMatchObject({
      code: 'DATA_AUDIT_PRUNE_INVALID',
    });
  });

  it.runIf(dialect === 'sqlite')('DATA-25 after a prune the trigger still stops a raw delete on SQLite', async () => {
    const { db, cutoff } = await aged();
    await pruneAuditLog(db, { before: cutoff, apply: true });
    const kysely = await kyselyOf(db.orm.em);
    await expect(sql`delete from bk_audit_log`.execute(kysely)).rejects.toThrow(/append-only/);
    expect(await actions(db)).toEqual(['new.one', 'audit.pruned']);
  });
});
