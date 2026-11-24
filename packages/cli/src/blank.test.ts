/**
 * BieberKit
 *
 * @file        packages/cli/src/blank.test.ts
 * @description The test of the milestone M1.8: a project with the base plugins migrates, seeds the administrator, boots, and the administrator signs in and lists the users, from the commands of the CLI (spec section 12, DATA-24, AUTH-01).
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

import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { boot } from '@bieberkit/server';
import type { Running } from '@bieberkit/server';
import { runCli } from './run.ts';
import { BASE_PLUGINS, linkBasePlugins, makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
const running: Running[] = [];
afterEach(async () => {
  for (const one of running.splice(0)) await one.stop();
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address !== null && typeof address === 'object' ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });

async function cli(root: string, env: Record<string, string>, argv: string[]): Promise<{ code: number; out: string }> {
  const out: string[] = [];
  const code = await runCli(argv, { stdout: (t) => out.push(t), stderr: (t) => out.push(t), cwd: root, env });
  return { code, out: out.join('') };
}

it('12 a blank project migrates, seeds the administrator, boots, and the administrator signs in and lists the users', async () => {
  const fixture = makeProject({
    entries: BASE_PLUGINS.map((name) => `'@bieberkit/plugin-${name}'`),
    files: { 'apps/server/src/seed.ts': 'export default async function seed() {}\n' },
  });
  fixtures.push(fixture);
  const { root } = fixture;
  linkBasePlugins(root);
  const password = 'correct horse battery staple';
  const env = {
    APP_ENV: 'development',
    DB_CONNECTION: 'sqlite',
    DATABASE_URL: join(root, 'blank.db'),
    APP_URL: 'http://localhost:3000',
    APP_PORT: String(await freePort()),
    METRICS_PORT: String(await freePort()),
    LOG_LEVEL: 'fatal',
    QUEUE_DRIVER: 'sync',
    CACHE_DRIVER: 'memory',
    USERS_ADMIN_EMAIL: 'admin@example.com',
    USERS_ADMIN_PASSWORD: password,
  };

  const made = await cli(root, env, ['migrate:make']);
  expect([made.code, made.out]).toEqual([0, expect.stringContaining('migrations/Migration')]);
  expect((await cli(root, env, ['migrate'])).code).toBe(0);
  const seeded = await cli(root, env, ['db:seed']);
  expect(seeded.out).toContain('@bieberkit/plugin-users');

  const one = await boot({ role: 'web', cwd: root, env });
  running.push(one);
  const base = `http://127.0.0.1:${String(one.port)}`;
  const headers = { 'content-type': 'application/json', origin: env.APP_URL, 'sec-fetch-site': 'same-origin' };
  const signedIn = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: env.USERS_ADMIN_EMAIL, password }),
  });
  expect(signedIn.status).toBe(200);
  const cookie =
    signedIn.headers
      .getSetCookie()
      .find((line) => line.startsWith('__Host-bk_session='))
      ?.split(';')[0] ?? '';
  const users = await fetch(`${base}/api/v1/users/users`, { headers: { cookie } });
  expect(users.status).toBe(200);
  const body: unknown = await users.json();
  expect(JSON.stringify(body)).toContain('admin@example.com');
  const roles = await fetch(`${base}/api/v1/roles/roles`, { headers: { cookie } });
  expect(JSON.stringify(await roles.json())).toContain('"name":"admin"');
});
