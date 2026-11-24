/**
 * BieberKit
 *
 * @file        packages/server/src/failure-cleanup.test.ts
 * @description Regressions for releasing real database and metrics resources when platform registration fails (BPL-02, BPL-04).
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

import { expect, it, onTestFinished, vi } from 'vitest';
import type * as DataOrm from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { boot } from './boot.ts';
import { seed } from './seed.ts';
import { makeProject, testEnv } from './testing/project.ts';

const opened = vi.hoisted(() => [] as Database[]);
vi.mock('@bieberkit/data/orm', async (original) => {
  const actual = await original<typeof DataOrm>();
  return {
    ...actual,
    createDatabase: async (...args: Parameters<typeof actual.createDatabase>) => {
      const db = await actual.createDatabase(...args);
      await db.orm.connect();
      opened.push(db);
      return db;
    },
  };
});

const duplicate = `import { defineModule } from '@bieberkit/core';
import { defineJob } from '@bieberkit/queue';
import { z } from 'zod';
const job = defineJob({ name: 'fixture.receive', input: z.object({}), handler: async () => {} });
export default defineModule({ name: 'broken', jobs: [job], subscriptions: [
  { event: 'fixture.done', job }, { event: 'fixture.done', job },
] });`;

it.each(['boot', 'seed'] as const)(
  'BPL-04 %s preserves duplicate subscription errors and closes its database',
  async (entry) => {
    const fixture = makeProject({ 'apps/server/src/modules/broken/module.ts': duplicate });
    onTestFinished(() => fixture.cleanup());
    const env = await testEnv(fixture.root);
    const before = opened.length;
    onTestFinished(async () => {
      for (const db of opened.splice(before)) await db.close();
    });
    const attempt = entry === 'boot' ? boot({ role: 'web', cwd: fixture.root, env }) : seed({ cwd: fixture.root, env });
    await expect(attempt).rejects.toMatchObject({ code: 'QUEUE_SUBSCRIPTION_DUPLICATE' });
    expect(opened.length).toBeGreaterThan(before);
    for (const db of opened.slice(before)) expect(await db.orm.isConnected()).toBe(false);
  },
);

it('BPL-02 a failed registration releases the metrics port so boot can retry', async () => {
  const fixture = makeProject();
  onTestFinished(() => fixture.cleanup());
  const env = await testEnv(fixture.root, { ADMIN_URL: 'http://localhost:3000/api' });
  const before = opened.length;
  onTestFinished(async () => {
    for (const db of opened.splice(before)) await db.close();
  });
  await expect(boot({ role: 'web', cwd: fixture.root, env })).rejects.toMatchObject({ code: 'BK_ADMIN_URL_INVALID' });
  const again = await boot({ role: 'web', cwd: fixture.root, env: { ...env, ADMIN_URL: '' } });
  onTestFinished(async () => {
    await again.stop();
  });
  expect(again.metricsPort).toBe(Number(env['METRICS_PORT']));
});
