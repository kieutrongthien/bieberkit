/**
 * BieberKit
 *
 * @file        packages/cli/src/audit.test.ts
 * @description Tests of bieberkit audit:prune: it counts first, deletes only with --yes on the connection of the migrate role, and refuses a bad date (AUD-06).
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

import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditLog, createDatabase, recordAudit, runInUnitOfWork } from '@bieberkit/data/orm';
import { runCli } from './run.ts';
import { CRM_MODULE, makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

async function run(root: string, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: root,
    env: { DB_CONNECTION: 'sqlite', DATABASE_URL: join(root, 'test.db'), LOG_LEVEL: 'fatal' },
  });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? parsed : {};
  return { code, out: out.join(''), err: err.join(''), data: Reflect.get(json, 'data') };
}

/** The audit log of the project's database, as the application sees it. */
async function auditOf(root: string, write: readonly string[] = []): Promise<string[]> {
  const db = await createDatabase(
    { DB_CONNECTION: 'sqlite', DATABASE_URL: join(root, 'test.db'), DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
    { entities: [] },
  );
  try {
    return await runInUnitOfWork(db, async (em) => {
      for (const action of write) recordAudit(em, { action });
      await em.flush();
      return (await em.find(AuditLog, {}, { orderBy: { id: 'asc' } })).map((row) => row.action);
    });
  } finally {
    await db.close();
  }
}

describe('AUD-06 audit:prune', () => {
  it('AUD-06 prints the count first, deletes only with --yes, and leaves its own entry', async () => {
    const fixture = makeProject({ files: { 'apps/server/src/modules/crm/module.ts': CRM_MODULE } });
    fixtures.push(fixture);
    const { root } = fixture;
    expect((await run(root, ['migrate'])).code).toBe(0);
    const before = await auditOf(root, ['crm.deal.won', 'crm.deal.lost']);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    const counted = await run(root, ['audit:prune', '--before', tomorrow, '--json']);
    expect(counted.code).toBe(0);
    expect(counted.data).toEqual({ before: `${tomorrow}T00:00:00.000Z`, count: before.length, pruned: false });
    const told = await run(root, ['audit:prune', '--before', tomorrow]);
    expect(told.out).toContain(`${String(before.length)} audit entries are older than ${tomorrow}T00:00:00.000Z`);
    expect(told.out).toContain('--yes');
    expect(await auditOf(root)).toEqual(before);

    const pruned = await run(root, ['audit:prune', '--before', tomorrow, '--yes', '--json']);
    expect(pruned.code).toBe(0);
    expect(pruned.data).toEqual({ before: `${tomorrow}T00:00:00.000Z`, count: before.length, pruned: true });
    expect(await auditOf(root)).toEqual(['audit.pruned']);
  });

  it('AUD-06 a missing or bad --before is a usage error', async () => {
    const fixture = makeProject({ files: {} });
    fixtures.push(fixture);
    expect((await run(fixture.root, ['audit:prune'])).code).toBe(2);
    const bad = await run(fixture.root, ['audit:prune', '--before', 'last week']);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('BK_USAGE_DATE_INVALID');
  });
});
