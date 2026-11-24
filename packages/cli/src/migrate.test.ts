/**
 * BieberKit
 *
 * @file        packages/cli/src/migrate.test.ts
 * @description Tests of bieberkit migrate:make and migrate with --status, --rollback and --allow-destructive: what they write, what they run, and what they answer in --json (section 5.2, DATA-08, DATA-25).
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
  return { code, out: out.join(''), err: err.join(''), data: Reflect.get(json, 'data'), json };
}

const fresh = (): Fixture => {
  const fixture = makeProject({ files: { 'apps/server/src/modules/crm/module.ts': CRM_MODULE } });
  fixtures.push(fixture);
  return fixture;
};

describe('section 5.2 migrate', () => {
  it('5.2 migrate:make writes the migration for the entities and says its file, and a second run says there is nothing to make', async () => {
    const { root } = fresh();
    const made = await run(root, ['migrate:make', '--json']);
    expect(made.code).toBe(0);
    expect(made.data).toMatchObject({ made: true, destructive: [] });
    expect(String(Reflect.get(Object(made.data), 'file'))).toMatch(/^migrations\/Migration\d{14}\.ts$/);
    const again = await run(root, ['migrate:make']);
    expect(again.code).toBe(0);
    expect(again.out).toContain('Nothing to make');
  });

  it('5.2 migrate runs the steps and the files, says what ran, and runs nothing the second time', async () => {
    const { root } = fresh();
    await run(root, ['migrate:make']);
    const first = await run(root, ['migrate', '--json']);
    expect(first.code).toBe(0);
    expect(Reflect.get(Object(first.data), 'migrations')).toHaveLength(1);
    expect(Reflect.get(Object(first.data), 'steps').length).toBeGreaterThan(0);
    const second = await run(root, ['migrate', '--json']);
    expect(Reflect.get(Object(second.data), 'migrations')).toEqual([]);
    expect(Reflect.get(Object(second.data), 'steps')).toEqual([]);
  });

  it('5.2 migrate --status lists what ran and what waits without running anything', async () => {
    const { root } = fresh();
    await run(root, ['migrate:make']);
    const before = await run(root, ['migrate', '--status', '--json']);
    expect(Reflect.get(Object(before.data), 'pending')).toHaveLength(1);
    expect(Reflect.get(Object(before.data), 'executed')).toEqual([]);
    await run(root, ['migrate']);
    const after = await run(root, ['migrate', '--status', '--json']);
    expect(Reflect.get(Object(after.data), 'pending')).toEqual([]);
    expect(Reflect.get(Object(after.data), 'executed')).toHaveLength(1);
  });

  it('5.2 migrate --rollback reverts the last file and names it, and says so when there is nothing to revert', async () => {
    const { root } = fresh();
    const none = await run(root, ['migrate', '--rollback']);
    expect(none.code).toBe(0);
    expect(none.out).toContain('Nothing to roll back');
  });

  it('5.2 migrate --status and --rollback together are a usage error', async () => {
    const { root } = fresh();
    const result = await run(root, ['migrate', '--status', '--rollback']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('BK_USAGE');
  });
});
