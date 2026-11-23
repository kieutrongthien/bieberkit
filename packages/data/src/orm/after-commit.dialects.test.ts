/**
 * BieberKit
 *
 * @file        packages/data/src/orm/after-commit.dialects.test.ts
 * @description Tests of afterCommit: work that runs when the transaction is committed, never when it is rolled back, and never fails the write (DATA-13).
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

import { EntitySchema } from '@mikro-orm/core';
import { expect, it } from 'vitest';
import { uuid7 } from '../keys/uuid7.ts';
import { describeDialects } from '../testing/dialects.ts';
import { afterCommit, runInTransaction } from './connect.ts';
import type { Database } from './connect.ts';
import { Uuid7Type } from './uuid7-type.ts';

interface ProbeRow {
  id: string;
  label: string;
}

const Probe = new EntitySchema<ProbeRow>({
  name: 'probe',
  tableName: 'probes',
  properties: {
    id: { type: Uuid7Type, primary: true, onCreate: () => uuid7() },
    label: { type: 'string', length: 50 },
  },
});

const labels = async (db: Database): Promise<string[]> =>
  (await db.orm.em.getConnection().execute('select label from probes order by label')).map(
    (row: { label: string }) => row.label,
  );

describeDialects('DATA-13 afterCommit', ({ open }) => {
  it('DATA-13 runs after the commit, in the order that it was asked, and sees the committed data', async () => {
    const db = await open([Probe]);
    const seen: string[][] = [];
    const order: number[] = [];
    await runInTransaction(db, async (em) => {
      em.create(Probe, { label: 'one' });
      await em.flush();
      afterCommit(async () => void (order.push(1), seen.push(await labels(db))));
      afterCommit(() => void order.push(2));
      expect(order).toEqual([]);
    });
    expect(order).toEqual([1, 2]);
    expect(seen).toEqual([['one']]);
  });

  it('DATA-13 does not run when the transaction is rolled back', async () => {
    const db = await open([Probe]);
    let ran = false;
    await expect(
      runInTransaction(db, async (em) => {
        em.create(Probe, { label: 'doomed' });
        await em.flush();
        afterCommit(() => void (ran = true));
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(ran).toBe(false);
    expect(await labels(db)).toEqual([]);
  });

  it('DATA-13 a callback that fails does not turn a committed write into an error, and the others still run', async () => {
    const db = await open([Probe]);
    let after = false;
    const result = await runInTransaction(db, async (em) => {
      em.create(Probe, { label: 'kept' });
      await em.flush();
      afterCommit(async () => {
        throw new Error('purge failed');
      });
      afterCommit(() => void (after = true));
      return 'done';
    });
    expect(result).toBe('done');
    expect(after).toBe(true);
    expect(await labels(db)).toEqual(['kept']);
  });

  it('DATA-13 outside a transaction the callback runs at once', async () => {
    let ran = false;
    afterCommit(() => void (ran = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ran).toBe(true);
  });

  it('DATA-13 two transactions at the same time keep their own callbacks', async () => {
    const db = await open([Probe]);
    const ran: string[] = [];
    await Promise.all([
      runInTransaction(db, async (em) => {
        em.create(Probe, { label: 'a' });
        await em.flush();
        afterCommit(() => void ran.push('a'));
      }).catch(() => undefined),
      runInTransaction(db, async () => {
        afterCommit(() => void ran.push('b'));
        throw new Error('b fails');
      }).catch(() => undefined),
    ]);
    expect(ran).toEqual(['a']);
  });
});
