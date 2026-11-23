/**
 * BieberKit
 *
 * @file        packages/mail/src/mailer.test.ts
 * @description Tests of the mailer on the sync queue: a message is checked when it is sent and delivered by a job, a failure is retried, a refusal for good is not (M-01).
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
import { describe, expect, it } from 'vitest';
import { createLogger, createMemoryReporter, requestContext } from '@bieberkit/core';
import { createQueue } from '@bieberkit/queue';
import { MailError } from './contract.ts';
import { createMailer, MAIL_JOB } from './mailer.ts';
import { createMemoryTransport } from './transports.ts';

const FROM = { name: 'Shop', address: 'shop@example.com' };
const lines: string[] = [];
const logger = createLogger({ level: 'info', role: 'worker', write: (line) => void lines.push(line) });

async function setup(options: { attempts?: number } = {}) {
  const transport = createMemoryTransport();
  const reporter = createMemoryReporter();
  const mailer = createMailer({
    transport,
    from: FROM,
    logger,
    errorReporter: reporter,
    backoffMs: () => 1,
    ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
  });
  const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
  return { transport, reporter, mailer, queue, mail: mailer.over(queue) };
}

const message = { to: 'an@example.com', subject: 'Welcome', text: 'Hello' };
const down = (): MailError => new MailError('down', { code: 'MAIL_UNREACHABLE', permanent: false });

describe('M-01 the mail goes through the queue', () => {
  it('M-01 the job has a name, a queue and the schema of a prepared message', async () => {
    const { mailer } = await setup();
    expect(mailer.job.name).toBe(MAIL_JOB);
    expect(mailer.job.queue).toBe('default');
  });

  it('M-01 send checks the message, puts a job on the queue, and the job sends it with the sender filled', async () => {
    const { transport, mail } = await setup();
    const dispatched = await mail.send(message);
    expect(dispatched.duplicate).toBe(false);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      from: FROM,
      to: [{ address: 'an@example.com' }],
      subject: 'Welcome',
      text: 'Hello',
    });
  });

  it('M-01 an invalid message is refused to the caller, before anything is queued', async () => {
    const { transport, mail, queue } = await setup();
    await expect(mail.send({ ...message, to: 'nope' })).rejects.toMatchObject({ code: 'MAIL_MESSAGE_INVALID' });
    expect(transport.sent).toEqual([]);
    expect((await queue.stats()).default).toBeDefined();
  });

  it('M-01 a message with a jobId is sent once, however many times it is asked', async () => {
    const { transport, mail } = await setup();
    const first = await mail.send(message, { jobId: 'reset-7' });
    const second = await mail.send(message, { jobId: 'reset-7' });
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ id: 'reset-7', duplicate: true });
    expect(transport.sent).toHaveLength(1);
  });

  it('M-01 the job restores the tenant and the user of the code that sent the mail (Q-10)', async () => {
    const transport = createMemoryTransport();
    const seen: { tenantId?: string; userId?: string }[] = [];
    const original = transport.send.bind(transport);
    transport.send = async (prepared) => {
      const known = requestContext.get();
      seen.push({
        ...(known?.tenantId === undefined ? {} : { tenantId: known.tenantId }),
        ...(known?.userId === undefined ? {} : { userId: known.userId }),
      });
      return original(prepared);
    };
    const mailer = createMailer({ transport, from: FROM, logger });
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
    const tenantId = randomUUID();
    const userId = randomUUID();
    await requestContext.run({ requestId: 'r1', tenantId, userId }, () => mailer.over(queue).send(message));
    expect(seen).toEqual([{ tenantId, userId }]);
  });

  it('M-01 sendNow does not use the queue and answers with the receipt', async () => {
    const { transport, mail } = await setup();
    expect(await mail.sendNow(message)).toEqual({ id: 'memory-1', rejected: [] });
    expect(transport.sent).toHaveLength(1);
    await expect(mail.sendNow({ ...message, subject: '' })).rejects.toMatchObject({ code: 'MAIL_MESSAGE_INVALID' });
  });
});

describe('M-01 failures', () => {
  it('M-01 a failure of the server is retried by the queue, and the message goes out once it works', async () => {
    const { transport, reporter, mail } = await setup();
    transport.failWith(
      new MailError('busy', { code: 'MAIL_UNREACHABLE', permanent: false }),
      new MailError('busy', { code: 'MAIL_UNREACHABLE', permanent: false }),
    );
    await mail.send(message);
    expect(transport.sent).toHaveLength(1);
    expect(reporter.reports).toEqual([]);
  });

  it('M-01 a message that never goes out is a dead job after its attempts, and is reported by the queue', async () => {
    const { transport, reporter, mail, queue } = await setup({ attempts: 2 });
    transport.failWith(down(), down());
    await mail.send(message, { jobId: 'down-1' });
    expect(transport.sent).toEqual([]);
    expect((await queue.deadLetters()).jobs).toHaveLength(1);
    expect(reporter.reports).toHaveLength(0);
  });

  it('M-01 a server that refuses for good is not asked again: it is logged and reported, and the job is done', async () => {
    lines.length = 0;
    const { transport, reporter, mail, queue } = await setup();
    const refused = new MailError('no such user', { code: 'MAIL_RECIPIENT_REFUSED', permanent: true });
    transport.failWith(refused, refused, refused);
    await mail.send(message, { jobId: 'refused-1' });
    expect(transport.sent).toEqual([]);
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toBe(refused);
    expect(reporter.reports[0]?.context).toMatchObject({ source: 'job', job: { name: MAIL_JOB, id: 'refused-1' } });
    expect((await queue.deadLetters()).jobs).toHaveLength(0);
    expect(lines.some((line) => line.includes('mail refused for good'))).toBe(true);
    // Only one delivery was tried: the two other failures are still waiting.
    await mail.sendNow(message).catch(() => undefined);
  });

  it('M-01 an error that is not a MailError is retried like a failure of the server', async () => {
    const { transport, mail } = await setup();
    const original = transport.send.bind(transport);
    let calls = 0;
    transport.send = async (prepared) => {
      calls += 1;
      if (calls === 1) throw new Error('socket hang up');
      return original(prepared);
    };
    await mail.send(message);
    expect(calls).toBe(2);
    expect(transport.sent).toHaveLength(1);
  });

  it('M-01 a recipient that the server refuses while it takes the others is a warning, not a failure', async () => {
    lines.length = 0;
    const transport = createMemoryTransport();
    transport.send = async () => ({ id: 'x-1', rejected: ['gone@example.com'] });
    const mailer = createMailer({ transport, from: FROM, logger });
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
    await mailer.over(queue).send({ ...message, to: ['an@example.com', 'gone@example.com'] });
    expect((await queue.deadLetters()).jobs).toHaveLength(0);
    expect(lines.some((line) => line.includes('refused some recipients'))).toBe(true);
  });
});

describe('M-01 the mailer', () => {
  it('M-01 verify and close go to the transport', async () => {
    let verified = 0;
    let closed = 0;
    const transport = createMemoryTransport();
    transport.verify = async () => void (verified += 1);
    transport.close = async () => void (closed += 1);
    const mailer = createMailer({ transport, from: FROM, logger });
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
    await mailer.over(queue).verify();
    await mailer.close();
    expect([verified, closed]).toEqual([1, 1]);
  });

  it('M-01 a mailer with no sender and a message with none is MAIL_FROM_REQUIRED', async () => {
    const mailer = createMailer({ transport: createMemoryTransport(), logger });
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
    await expect(mailer.over(queue).send(message)).rejects.toMatchObject({ code: 'MAIL_FROM_REQUIRED' });
    await expect(mailer.over(queue).send({ ...message, from: 'x@example.com' })).resolves.toBeDefined();
  });
});
