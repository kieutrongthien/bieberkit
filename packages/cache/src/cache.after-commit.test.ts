/**
 * BieberKit
 *
 * @file        packages/cache/src/cache.after-commit.test.ts
 * @description Tests of flushAfterCommit: the tag is flushed when the transaction commits, never when it rolls back, and a failed flush only warns (DATA-13).
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

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, runInTransaction } from '@bieberkit/data/orm';
import { createLogger } from '@bieberkit/core';
import { createCache } from './cache.ts';
import type { CacheEngine } from './contract.ts';
import { createMemoryEngine } from './memory-engine.ts';

const ONE = randomUUID();
const TWO = randomUUID();

const db = await createDatabase(
  { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
  { entities: [] },
);
afterAll(() => db.close());

describe('DATA-13 flushAfterCommit', () => {
  it('DATA-13 the tag is flushed after the commit, not while the transaction is open', async () => {
    const cache = createCache({ engine: createMemoryEngine() });
    const deals = cache.tags(['deals']);
    await deals.set('list', 'old');
    let insideTransaction: string | undefined;
    await runInTransaction(db, async () => {
      deals.flushAfterCommit();
      insideTransaction = await deals.get<string>('list');
    });
    expect(insideTransaction).toBe('old');
    expect(await deals.get('list')).toBeUndefined();
  });

  it('DATA-13 a rolled back transaction flushes nothing', async () => {
    const cache = createCache({ engine: createMemoryEngine() });
    const deals = cache.tags(['deals']);
    await deals.set('list', 'kept');
    await expect(
      runInTransaction(db, async () => {
        deals.flushAfterCommit();
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(await deals.get('list')).toBe('kept');
  });

  it('DATA-13 a failed flush warns and never turns a committed write into an error', async () => {
    const memory = createMemoryEngine();
    const broken: CacheEngine = {
      ...memory,
      atomic: {
        ...memory.atomic,
        increment: async () => {
          throw new Error('redis is down');
        },
      },
    };
    const lines: string[] = [];
    const logger = createLogger({ level: 'warn', role: 'web', write: (line) => void lines.push(line) });
    const cache = createCache({ engine: broken, logger });
    const result = await runInTransaction(db, async () => {
      cache.tags(['deals']).flushAfterCommit();
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('flush after commit failed');
    expect(lines[0]).toContain('redis is down');
  });

  it('DATA-13 outside a transaction the flush happens at once', async () => {
    const cache = createCache({ engine: createMemoryEngine() });
    const deals = cache.tags(['deals']);
    await deals.set('list', 'old');
    deals.flushAfterCommit();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await deals.get('list')).toBeUndefined();
  });

  it('C-01 a tenant flush keeps the tenant of the request that asked, also after the request context is gone', async () => {
    const { runAsTenant } = await import('@bieberkit/data/orm');
    const cache = createCache({ engine: createMemoryEngine() });
    await runAsTenant(ONE, () => cache.tenant.tags(['deals']).set('list', 'one'));
    await runAsTenant(TWO, () => cache.tenant.tags(['deals']).set('list', 'two'));
    await runAsTenant(ONE, () =>
      runInTransaction(db, async () => {
        cache.tenant.tags(['deals']).flushAfterCommit();
      }),
    );
    expect(await runAsTenant(ONE, () => cache.tenant.tags(['deals']).get('list'))).toBeUndefined();
    expect(await runAsTenant(TWO, () => cache.tenant.tags(['deals']).get('list'))).toBe('two');
  });
});
