/**
 * BieberKit
 *
 * @file        packages/server/src/auth-mail.test.ts
 * @description Tests of password reset and verification messages sent through the real mailer and memory transport (BPL-02, M-03).
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

import { expect, it, onTestFinished } from 'vitest';
import { createLogger } from '@bieberkit/core';
import { createMailer, createMemoryTransport } from '@bieberkit/mail';
import { authMessages } from './auth-mail.ts';
import { createQueue } from '@bieberkit/queue';
import {
  applyPluginMigrations,
  createDatabase,
  DATA_PLUGIN,
  dataMigrationSteps,
  runInTransaction,
} from '@bieberkit/data/orm';

async function setup() {
  const transport = createMemoryTransport();
  const from = { name: 'BieberKit', address: 'hello@example.test' };
  const mailer = createMailer({
    from,
    transport,
    logger: createLogger({ level: 'fatal', role: 'web', write: () => {} }),
  });
  const queue = await createQueue({ driver: 'sync', jobs: [mailer.job] });
  onTestFinished(async () => {
    await queue.close();
    await mailer.close();
  });
  return { messages: authMessages(mailer.over(queue), from), transport };
}

it('BPL-02 the reset message names the link and has no line break in its subject', async () => {
  const { messages, transport } = await setup();
  const url = 'https://app.test/reset-password?token=reset-42';
  await messages.sendResetPassword({ to: 'reader@example.test', url, token: 'reset-42' });
  expect(transport.sent).toHaveLength(1);
  expect(transport.sent[0]).toMatchObject({
    to: [{ address: 'reader@example.test' }],
    subject: expect.stringMatching(/password|reset/i),
    text: expect.stringContaining(url),
  });
  expect(transport.sent[0]?.subject).not.toMatch(/[\r\n]/);
});

it('BPL-02 the verification message names the verification link', async () => {
  const { messages, transport } = await setup();
  const url = 'https://app.test/verify-email?token=verify-42';
  await messages.sendVerification({ to: 'reader@example.test', url, token: 'verify-42' });
  expect(transport.sent).toHaveLength(1);
  expect(transport.sent[0]).toMatchObject({
    to: [{ address: 'reader@example.test' }],
    subject: expect.stringMatching(/verify|verification/i),
    text: expect.stringContaining(url),
  });
  expect(transport.sent[0]?.subject).not.toMatch(/[\r\n]/);
});
it('BPL-02 authentication mail stays in the transaction and rollback sends nothing', async () => {
  const { messages, transport } = await setup();
  const db = await createDatabase(
    { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
    { entities: [] },
  );
  onTestFinished(() => db.close());
  await applyPluginMigrations(db, dataMigrationSteps, { pluginOrder: [DATA_PLUGIN] });
  await expect(
    runInTransaction(db, async (em) => {
      await messages.sendResetPassword({
        to: 'reader@example.test',
        url: 'https://app.test/reset?token=42',
        token: '42',
      });
      expect(transport.sent).toEqual([]);
      await em.flush();
      throw new Error('cancelled');
    }),
  ).rejects.toThrow('cancelled');
  expect(transport.sent).toEqual([]);
  expect(await db.orm.em.getConnection().execute('select * from bk_outbox')).toEqual([]);
});
