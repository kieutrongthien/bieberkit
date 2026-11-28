/**
 * BieberKit
 *
 * @file        packages/server/src/account.test.ts
 * @description Tests that a booted project serves the second factor with the name of the project, and that the password links it mails lead to the reset page of the admin (AUTH-03, USR-10, UI-26).
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

import { execFile } from 'node:child_process';
import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it, onTestFinished } from 'vitest';
import { makeProject, testEnv } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const run = promisify(execFile);
const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOT = JSON.stringify(new URL('./boot.ts', import.meta.url).href);
const SEED = JSON.stringify(new URL('./seed.ts', import.meta.url).href);

/** A project with an admin, not built: the links lead to it all the same, as in `bieberkit dev`, which builds no files. */
const ADMIN_INSTALLED = { 'apps/admin/package.json': '{}' };

/** Invites one person as the users plugin does, and prints where the mailed link would send them. */
const INVITING_SEED = `import { createUserService } from '@bieberkit/auth';

export default async function seed(services) {
  const users = createUserService({ db: services.database, auth: services.auth });
  await users.create({ name: 'Max', email: 'max@example.test', invite: true, actorId: null });
  const rows = await services.database.orm.em.getConnection().execute('select * from bk_outbox');
  const link = /callbackURL=([A-Za-z0-9%._~-]+)/.exec(JSON.stringify(rows));
  console.log('BK_CALLBACK ' + decodeURIComponent(link === null ? '' : link[1]));
}
`;

/** A child process, so that the project and the server load one copy of each package, as a deployed project does. */
async function probe(fixture: Fixture, code: string, marker: string): Promise<string> {
  const { stdout } = await run(
    process.execPath,
    [
      '--conditions=@bieberkit/source',
      '--input-type=module',
      '-e',
      `${code}\nprocess.stdout.write('', () => process.exit(0));`,
    ],
    { cwd: fixture.root, timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  const line = stdout.split('\n').find((item) => item.startsWith(`${marker} `));
  if (line === undefined) throw new Error(`The probe printed no ${marker}:\n${stdout}`);
  return line.slice(marker.length + 1);
}

function project(files: Readonly<Record<string, string>>): Fixture {
  const fixture = makeProject(files);
  onTestFinished(() => fixture.cleanup());
  return fixture;
}

async function environment(fixture: Fixture, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const env = await testEnv(fixture.root, {
    QUEUE_DRIVER: 'database',
    MAIL_DRIVER: 'log',
    MAIL_FROM: 'BieberKit <hello@example.test>',
    ...extra,
  });
  env['APP_URL'] = `http://127.0.0.1:${env['APP_PORT']}`;
  return env;
}

async function invitedTo(files: Readonly<Record<string, string>>, adminUrl?: string) {
  const fixture = project({ 'apps/server/src/seed.ts': INVITING_SEED, ...files });
  symlinkSync(join(PACKAGES, 'auth'), join(fixture.root, 'node_modules/@bieberkit/auth'), 'dir');
  const env = await environment(fixture, adminUrl === undefined ? {} : { ADMIN_URL: adminUrl });
  const callback = await probe(
    fixture,
    `import { boot } from ${BOOT};
import { seed } from ${SEED};
const options = { cwd: ${JSON.stringify(fixture.root)}, env: ${JSON.stringify(env)} };
const migrated = await boot({ role: 'migrate', ...options });
await migrated.stop();
await seed(options);`,
    'BK_CALLBACK',
  );
  return { callback, appUrl: String(env['APP_URL']) };
}

it('USR-10 with the admin installed, the invitation leads to the reset page of the admin at /admin', async () => {
  const { callback, appUrl } = await invitedTo(ADMIN_INSTALLED);
  expect(callback).toBe(`${appUrl}/admin/reset-password?invite=1`);
}, 60_000);

it('USR-10 the invitation follows a path of ADMIN_URL', async () => {
  const { callback } = await invitedTo(ADMIN_INSTALLED, 'https://panel.example.test/back/office');
  expect(callback).toBe('https://panel.example.test/back/office/reset-password?invite=1');
}, 60_000);

it('USR-10 the invitation follows a host of its own with the admin at its root', async () => {
  const { callback } = await invitedTo(ADMIN_INSTALLED, 'https://admin.example.test');
  expect(callback).toBe('https://admin.example.test/reset-password?invite=1');
}, 60_000);

it('USR-10 without the admin the invitation leads to /reset-password of the application, as before', async () => {
  const { callback, appUrl } = await invitedTo({});
  expect(callback).toBe(`${appUrl}/reset-password`);
}, 60_000);

/** Signs up in a booted web role, turns the second factor on, and answers the status and the address for the authenticator app. */
async function enable(brand: string | undefined): Promise<{ status: number; uri: string }> {
  const fixture = project({});
  if (brand !== undefined) {
    const path = join(fixture.root, 'bieberkit.config.ts');
    const config = readFileSync(path, 'utf8');
    writeFileSync(path, config.replace('plugins: [],', `plugins: [],\n  admin: { brand: { name: '${brand}' } },`));
  }
  const env = await environment(fixture);
  const answered = await probe(
    fixture,
    `import { boot } from ${BOOT};
const env = ${JSON.stringify(env)};
const cwd = ${JSON.stringify(fixture.root)};
const migrated = await boot({ role: 'migrate', cwd, env });
await migrated.stop();
const running = await boot({ role: 'web', cwd, env });
const password = 'correct-test-password';
try {
  const call = (path, payload, cookie) => fetch(env.APP_URL + '/api/auth' + path, {
    method: 'POST',
    // What a browser sends for a request of the admin. Without it a request with a cookie is refused as cross site (SEC-03).
    headers: {
      origin: env.APP_URL, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(payload),
  });
  const signup = await call('/sign-up/email', { name: 'Reader', email: 'reader@example.test', password });
  const cookie = signup.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ');
  const reply = await call('/two-factor/enable', { password }, cookie);
  const body = await reply.json().catch(() => ({}));
  console.log('BK_TOTP ' + JSON.stringify({ status: reply.status, uri: body.totpURI ?? '' }));
} finally { await running.stop(); }`,
    'BK_TOTP',
  );
  const value: unknown = JSON.parse(answered);
  return {
    status: Number(Reflect.get(Object(value), 'status')),
    uri: String(Reflect.get(Object(value), 'uri')),
  };
}

it('AUTH-03 a booted project serves the second factor, named after the project', async () => {
  const { status, uri } = await enable(undefined);
  expect(status).toBe(200);
  expect(uri).toMatch(/^otpauth:\/\/totp\/demo:/);
}, 60_000);

it('AUTH-03 the name of the brand wins over the name of the project', async () => {
  const { status, uri } = await enable('Acme Works');
  expect(status).toBe(200);
  expect(uri).toMatch(/^otpauth:\/\/totp\/Acme%20Works:/);
}, 60_000);
