/**
 * BieberKit
 *
 * @file        packages/data/src/orm/migration-lock.dialects.test.ts
 * @description Tests of the lock of the migrate role: one run at a time on every dialect, a second run waits and then finds nothing to do, and a lease that ran out is taken over (DATA-25).
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

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, expect, it } from 'vitest';
import { createLogger } from '@bieberkit/core';
import { defineEntity, f } from '../schema/index.ts';
import { describeDialects } from '../testing/dialects.ts';
import { createDatabase } from './connect.ts';
import type { Database } from './connect.ts';
import { compileEntities } from './compile.ts';
import { kyselyOf } from './internals.ts';
import { openMigrator } from './migrate.ts';
import type { Migrator } from './migrate.ts';
import { MIGRATION_LOCK_TABLE, withMigrationLock } from './migration-lock.ts';

const Note = defineEntity({
  name: 'notes.Note',
  table: 'notes_notes',
  fields: { id: f.id(), title: f.string({ max: 100 }) },
});

const ROOT = join(fileURLToPath(new URL('../..', import.meta.url)), '.tmp');
mkdirSync(ROOT, { recursive: true });
const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describeDialects('DATA-25 the lock of the migrate role', ({ dialect, emptyDatabase }) => {
  const databases: Database[] = [];
  const migrators: Migrator[] = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
    for (const migrator of migrators.splice(0)) await migrator.close();
  });

  async function open() {
    const { url } = await emptyDatabase();
    const db = await createDatabase(
      { DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 3 },
      { entities: [] },
    );
    databases.push(db);
    return { url, kysely: await kyselyOf(db.orm.em) };
  }

  it('DATA-25 lets one run at a time: a second run that does not wait is refused with DATA_MIGRATE_LOCKED, and gets in when the first ends', async () => {
    const { kysely } = await open();
    const gate = Promise.withResolvers<void>();
    const held = gate.promise;
    const first = withMigrationLock(kysely, dialect, () => held, { owner: 'a' });
    await sleep(50);
    await expect(withMigrationLock(kysely, dialect, async () => 1, { owner: 'b', waitMs: 0 })).rejects.toMatchObject({
      code: 'DATA_MIGRATE_LOCKED',
      status: 409,
    });
    gate.resolve();
    await first;
    expect(await withMigrationLock(kysely, dialect, async () => 'ran', { owner: 'b', waitMs: 0 })).toBe('ran');
  });

  it('DATA-25 makes a second run wait for the first, so that they never overlap', async () => {
    const { kysely } = await open();
    const events: string[] = [];
    const work = (name: string) => async (): Promise<void> => {
      events.push(`${name} start`);
      await sleep(150);
      events.push(`${name} end`);
    };
    await Promise.all([
      withMigrationLock(kysely, dialect, work('a'), { owner: 'a', pollMs: 20 }),
      withMigrationLock(kysely, dialect, work('b'), { owner: 'b', pollMs: 20 }),
    ]);
    expect(events).toHaveLength(4);
    expect(events[0]?.split(' ')[0]).toBe(events[1]?.split(' ')[0]);
    expect(events[2]?.split(' ')[0]).toBe(events[3]?.split(' ')[0]);
  });

  it('DATA-25 releases the lock when the run fails, and keeps the error', async () => {
    const { kysely } = await open();
    await expect(
      withMigrationLock(kysely, dialect, () => Promise.reject(new Error('boom')), { owner: 'a' }),
    ).rejects.toThrow('boom');
    expect(await withMigrationLock(kysely, dialect, async () => 'again', { owner: 'b', waitMs: 0 })).toBe('again');
  });

  it('DATA-25 takes over a lease that ran out, which is what a crashed run leaves behind', async () => {
    const { kysely } = await open();
    await withMigrationLock(kysely, dialect, async () => undefined, { owner: 'warm-up' });
    await kysely
      .insertInto(MIGRATION_LOCK_TABLE)
      .values({ name: 'migrate', owner: 'crashed', until: Date.now() - 1000 })
      .execute();
    expect(await withMigrationLock(kysely, dialect, async () => 'taken', { owner: 'b', waitMs: 0 })).toBe('taken');
  });

  it('DATA-25 renews the lease while a run lasts longer than it, so a slow migration is never taken over', async () => {
    const { kysely } = await open();
    const slow = withMigrationLock(kysely, dialect, () => sleep(400), { owner: 'a', ttlMs: 150 });
    await sleep(300);
    await expect(withMigrationLock(kysely, dialect, async () => 1, { owner: 'b', waitMs: 0 })).rejects.toMatchObject({
      code: 'DATA_MIGRATE_LOCKED',
    });
    await slow;
  });

  it('DATA-25 two migrators that run up at once apply each migration once', async () => {
    const { url } = await emptyDatabase();
    const directory = mkdtempSync(join(ROOT, 'lock-'));
    directories.push(directory);
    const env = { DB_CONNECTION: dialect, MIGRATE_DATABASE_URL: url, DB_POOL_MAX: 3 } as const;
    const quiet = createLogger({ level: 'error', role: 'migrate' });
    const a = await openMigrator(env, { entities: compileEntities([Note]), directory, logger: quiet });
    const b = await openMigrator(env, { entities: compileEntities([Note]), directory, logger: quiet });
    migrators.push(a, b);
    await a.make();
    const [first, second] = await Promise.all([a.up(), b.up()]);
    expect([...first, ...second]).toHaveLength(1);
    expect((await a.status()).pending).toEqual([]);
  });
});
