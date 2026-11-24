/**
 * BieberKit
 *
 * @file        packages/server/src/auth-http-mail.test.ts
 * @description Regressions for mounted authentication mail on SQLite with the database queue and no worker (BPL-02, AUTH-06).
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
import { promisify } from 'node:util';
import { expect, it, onTestFinished } from 'vitest';
import { makeProject, testEnv } from './testing/project.ts';

const run = promisify(execFile);

async function mountedMail(mode: 'reset' | 'verification'): Promise<unknown> {
  const fixture = makeProject();
  onTestFinished(() => fixture.cleanup());
  const env = await testEnv(fixture.root, {
    QUEUE_DRIVER: 'database',
    MAIL_DRIVER: 'log',
    MAIL_FROM: 'BieberKit <hello@example.test>',
  });
  env['APP_URL'] = 'http://127.0.0.1:' + env['APP_PORT'];
  // A child gives a deadlocked pre-fix request a hard deadline and always releases its SQLite file.
  const code = `
import { boot } from ${JSON.stringify(new URL('./boot.ts', import.meta.url).href)};
const env = ${JSON.stringify(env)};
const root = ${JSON.stringify(fixture.root)};
const migrated = await boot({ role: 'migrate', cwd: root, env });
await migrated.stop();
const one = await boot({ role: 'web', cwd: root, env });
try {
  const call = (path, payload) => fetch(env.APP_URL + '/api/auth' + path, {
    method: 'POST', headers: { origin: env.APP_URL, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const signup = await call('/sign-up/email', { name: 'Reader', email: 'reader@example.test', password: 'correct-test-password' });
  const unknown = await call('/request-password-reset', { email: 'nobody@example.test' });
  const known = await call(${JSON.stringify(mode === 'reset' ? '/request-password-reset' : '/send-verification-email')}, {
    email: 'reader@example.test', redirectTo: env.APP_URL + '/reset', callbackURL: env.APP_URL + '/verified',
  });
  const events = await one.database.orm.em.getConnection().execute('select event from bk_outbox');
  const jobs = await one.database.orm.em.getConnection().execute('select count(*) as n from bk_jobs');
  console.log('BK_MAIL_RESULT ' + JSON.stringify({
    signup: signup.status, unknown: unknown.status, known: known.status,
    mail: events.filter((event) => event.event === 'mail.send').length, jobs: Number(jobs[0].n),
  }));
} finally { await one.stop(); }
// The probe owns its deadline; dependency timers must not extend it after all assertions can be read.
process.stdout.write('', () => process.exit(0));
`;
  const { stdout } = await run(
    process.execPath,
    ['--conditions=@bieberkit/source', '--input-type=module', '-e', code],
    {
      cwd: fixture.root,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const line = stdout.split('\n').find((item) => item.startsWith('BK_MAIL_RESULT '));
  if (line === undefined) throw new Error('Expected the mounted mail probe result');
  const value: unknown = JSON.parse(line.slice('BK_MAIL_RESULT '.length));
  return value;
}

it.each(['reset', 'verification'] as const)(
  'BPL-02 mounted %s mail completes and commits an outbox intent before a worker runs',
  async (mode) => {
    expect(await mountedMail(mode)).toEqual({ signup: 200, unknown: 200, known: 200, mail: 1, jobs: 0 });
  },
  30_000,
);
