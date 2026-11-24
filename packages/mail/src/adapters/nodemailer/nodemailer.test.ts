/**
 * BieberKit
 *
 * @file        packages/mail/src/adapters/nodemailer/nodemailer.test.ts
 * @description Tests of the SMTP transport against a fake server: delivery, the headers, a login, refusals for good and for now, partial refusals, a server that is down, and the mail that MAIL_DRIVER selects (M-01).
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

import type { Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger, createMemoryReporter } from '@bieberkit/core';
import { createQueue } from '@bieberkit/queue';
import { startFakeSmtp } from '../../testing/fake-smtp.ts';
import { mailTransportContractSuite } from '../../testing/transport-suite.ts';
import type { FakeSmtp } from '../../testing/fake-smtp.ts';
import type { PreparedMessage } from '../../contract.ts';
import { classify, createMailerFromConfig, nodemailerTransport, transportFromConfig } from './index.ts';
import type { MailConfig } from './index.ts';

const message: PreparedMessage = {
  from: { name: 'Shop', address: 'shop@example.com' },
  to: [{ name: 'An', address: 'an@example.com' }],
  cc: [{ address: 'cc@example.com' }],
  bcc: [{ address: 'hidden@example.com' }],
  subject: 'Hello world',
  text: 'Plain text body',
  html: '<p>Html body</p>',
};

const logger = createLogger({ level: 'fatal', role: 'worker', write: () => undefined });
let open: FakeSmtp;
let secured: FakeSmtp;

beforeAll(async () => {
  open = await startFakeSmtp();
  secured = await startFakeSmtp({ auth: { user: 'mailer', pass: 'p@ss:word/1' } });
});
afterAll(async () => {
  await open.close();
  await secured.close();
});

describe('M-01 the SMTP transport', () => {
  it('M-01 delivers a message: the envelope has every recipient, and the headers have none of the bcc', async () => {
    const transport = nodemailerTransport({ url: open.url });
    const before = open.received.length;
    const receipt = await transport.send(message);
    await transport.close();
    const got = open.received[before];
    expect(receipt.id).toMatch(/^<.+>$/);
    expect(receipt.rejected).toEqual([]);
    expect(got?.from).toBe('shop@example.com');
    expect(got?.to).toEqual(['an@example.com', 'cc@example.com', 'hidden@example.com']);
    expect(got?.data).toContain('Subject: Hello world');
    expect(got?.data).toContain('From: Shop <shop@example.com>');
    expect(got?.data).toContain('To: An <an@example.com>');
    expect(got?.data).toContain('Cc: cc@example.com');
    expect(got?.data).not.toContain('hidden@example.com');
    expect(got?.data).toContain('Plain text body');
    expect(got?.data).toContain('Html body');
    expect(got?.data).toContain('multipart/alternative');
  });

  it('M-01 a reply-to and a subject with Vietnamese letters are kept, in the encoding that mail needs', async () => {
    const transport = nodemailerTransport({ url: open.url });
    const before = open.received.length;
    const { from, to, cc, bcc, text } = message;
    await transport.send({
      from,
      to,
      cc,
      bcc,
      ...(text === undefined ? {} : { text }),
      replyTo: { address: 'help@example.com' },
      subject: 'Chào mừng bạn đến với cửa hàng',
    });
    await transport.close();
    const data = open.received[before]?.data ?? '';
    expect(data).toContain('Reply-To: help@example.com');
    expect(data).toMatch(/Subject: =\?UTF-8\?[BQ]\?/);
    expect(data).not.toContain('multipart/alternative');
  });

  it('M-01 the lines of a header cannot be split by a subject: the check stops it, and the transport has none left to carry', async () => {
    const transport = nodemailerTransport({ url: open.url });
    const before = open.received.length;
    await transport.send({ ...message, subject: 'Subject with a colon: and a Bcc: word' });
    await transport.close();
    const headers = (open.received[before]?.data ?? '').split('\r\n\r\n')[0] ?? '';
    expect(headers.split('\r\n').filter((line) => line.startsWith('Bcc:'))).toEqual([]);
  });

  it('M-01 logs in with the user and the password of the URL, also with characters that need encoding', async () => {
    const url = `smtp://mailer:${encodeURIComponent('p@ss:word/1')}@127.0.0.1:${String(secured.port)}`;
    const transport = nodemailerTransport({ url });
    const before = secured.received.length;
    await transport.send(message);
    await transport.verify();
    await transport.close();
    expect(secured.received.length).toBe(before + 1);
  });

  it('M-01 a wrong password is a failure that a retry may mend, with a code that says so', async () => {
    const transport = nodemailerTransport({ url: `smtp://mailer:wrong@127.0.0.1:${String(secured.port)}` });
    await expect(transport.send(message)).rejects.toMatchObject({ code: 'MAIL_AUTH_FAILED', permanent: false });
    await expect(transport.verify()).rejects.toMatchObject({ code: 'MAIL_UNREACHABLE' });
    await transport.close();
  });

  it('M-01 a server that wants a login and gets none says so, and it is not for good', async () => {
    const transport = nodemailerTransport({ url: secured.url });
    await expect(transport.send(message)).rejects.toMatchObject({ permanent: false });
    await transport.close();
  });

  it('M-01 an address that the server says does not exist is a failure for good', async () => {
    const transport = nodemailerTransport({ url: open.url });
    const refused = { ...message, to: [{ address: 'reject-me@example.com' }], cc: [], bcc: [] };
    await expect(transport.send(refused)).rejects.toMatchObject({
      code: 'MAIL_RECIPIENT_REFUSED',
      permanent: true,
      status: 502,
    });
    await transport.close();
  });

  it('M-01 a recipient that the server refuses while it takes the others is a receipt with the refused ones', async () => {
    const transport = nodemailerTransport({ url: open.url });
    const before = open.received.length;
    const receipt = await transport.send({
      ...message,
      to: [{ address: 'an@example.com' }, { address: 'reject-me@example.com' }],
      cc: [],
      bcc: [],
    });
    await transport.close();
    expect(receipt.rejected).toEqual(['reject-me@example.com']);
    expect(open.received[before]?.to).toEqual(['an@example.com']);
  });

  it('M-01 a server that says "try later" is a failure that a retry may mend', async () => {
    const transport = nodemailerTransport({ url: open.url });
    const later = { ...message, to: [{ address: 'tempfail@example.com' }], cc: [], bcc: [] };
    await expect(transport.send(later)).rejects.toMatchObject({ permanent: false });
    await transport.close();
  });

  it('M-01 a server that is not there is a failure that a retry may mend, and the error does not carry the address of the mail', async () => {
    const closed = await startFakeSmtp();
    const { port } = closed;
    await closed.close();
    const transport = nodemailerTransport({ url: `smtp://127.0.0.1:${String(port)}`, connectionTimeoutMs: 500 });
    let caught: unknown;
    try {
      await transport.send(message);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'MAIL_UNREACHABLE', permanent: false, status: 503 });
    expect(caught instanceof Error ? caught.message : '').not.toContain('example.com');
    await expect(transport.verify()).rejects.toMatchObject({ code: 'MAIL_UNREACHABLE' });
    await transport.close();
  });

  it('M-01 a server that does not answer is cut after the timeout', async () => {
    const net = await import('node:net');
    const held = new Set<Socket>();
    const silent = net.createServer((socket) => void held.add(socket));
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const address = silent.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const transport = nodemailerTransport({
      url: `smtp://127.0.0.1:${String(port)}`,
      connectionTimeoutMs: 300,
      socketTimeoutMs: 300,
    });
    const started = Date.now();
    await expect(transport.send(message)).rejects.toMatchObject({ permanent: false });
    expect(Date.now() - started).toBeLessThan(5_000);
    await transport.close();
    for (const socket of held) socket.destroy();
    await new Promise((resolve) => silent.close(resolve));
  });

  it('M-01 verify answers when the server and the login work', async () => {
    const transport = nodemailerTransport({ url: open.url });
    await expect(transport.verify()).resolves.toBeUndefined();
    await transport.close();
  });
});

describe('M-01 classify', () => {
  it('M-01 5xx replies and invalid envelopes are for good, a refused login and 4xx replies and network errors are not', () => {
    expect(classify({ responseCode: 550 })).toEqual({ permanent: true, code: 'MAIL_REFUSED' });
    expect(classify({ responseCode: 554 }).permanent).toBe(true);
    expect(classify({ code: 'EENVELOPE' })).toEqual({ permanent: true, code: 'MAIL_RECIPIENT_REFUSED' });
    expect(classify({ responseCode: 530 })).toEqual({ permanent: false, code: 'MAIL_AUTH_FAILED' });
    expect(classify({ code: 'EAUTH', responseCode: 535 })).toEqual({ permanent: false, code: 'MAIL_AUTH_FAILED' });
    expect(classify({ responseCode: 451 })).toEqual({ permanent: false, code: 'MAIL_TEMPORARY_FAILURE' });
    expect(classify({ code: 'ECONNECTION' })).toEqual({ permanent: false, code: 'MAIL_UNREACHABLE' });
    expect(classify({ code: 'ETIMEDOUT' }).permanent).toBe(false);
    expect(classify(null).permanent).toBe(false);
    expect(classify('text').permanent).toBe(false);
    expect(classify({ code: 'EENVELOPE', responseCode: 451 }).permanent).toBe(false);
  });
});

describe('M-01 the config', () => {
  const base: MailConfig = {
    APP_ENV: 'development',
    MAIL_DRIVER: 'log',
    SMTP_URL: undefined,
    MAIL_FROM: 'Shop <shop@example.com>',
  };

  it('M-01 MAIL_DRIVER=log gives the log transport, with addresses and text only outside production', async () => {
    const lines: string[] = [];
    const verbose = createLogger({ level: 'info', role: 'web', write: (line) => void lines.push(line) });
    await transportFromConfig(base, verbose).send(message);
    expect(lines[0]).toContain('an@example.com');
    lines.length = 0;
    await transportFromConfig({ ...base, APP_ENV: 'production' }, verbose).send(message);
    expect(lines[0]).not.toContain('an@example.com');
  });

  it('M-01 MAIL_DRIVER=smtp needs SMTP_URL', () => {
    expect(() => transportFromConfig({ ...base, MAIL_DRIVER: 'smtp' }, logger)).toThrow(/SMTP_URL/);
  });

  it('SEC-04 in production a plain SMTP URL to another host is refused, and an encrypted one or a loopback one is not', () => {
    const production = { ...base, APP_ENV: 'production', MAIL_DRIVER: 'smtp' as const };
    expect(() =>
      transportFromConfig({ ...production, SMTP_URL: 'smtp://user:pass@mail.example.com:587' }, logger),
    ).toThrowError(expect.objectContaining({ code: 'MAIL_TLS_REQUIRED' }));
    expect(() =>
      transportFromConfig({ ...production, SMTP_URL: 'smtps://user:pass@mail.example.com:465' }, logger),
    ).not.toThrow();
    expect(() =>
      transportFromConfig({ ...production, SMTP_URL: 'smtp://user:pass@mail.example.com:587?requireTLS=true' }, logger),
    ).not.toThrow();
    expect(() => transportFromConfig({ ...production, SMTP_URL: 'smtp://localhost:1025' }, logger)).not.toThrow();
    expect(() =>
      transportFromConfig({ ...base, MAIL_DRIVER: 'smtp', SMTP_URL: 'smtp://mail.example.com:587' }, logger),
    ).not.toThrow();
  });

  it('M-01 a mailer from the config sends through the queue to the server, with the sender of MAIL_FROM', async () => {
    const reporter = createMemoryReporter();
    const mailer = createMailerFromConfig(
      { ...base, MAIL_DRIVER: 'smtp', SMTP_URL: open.url },
      { logger, errorReporter: reporter },
    );
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
    const before = open.received.length;
    await mailer.over(queue).send({ to: 'an@example.com', subject: 'Through the queue', text: 'Queued' });
    await mailer.over(queue).verify();
    await mailer.close();
    expect(open.received).toHaveLength(before + 1);
    expect(open.received[before]?.data).toContain('From: Shop <shop@example.com>');
    expect(open.received[before]?.data).toContain('Subject: Through the queue');
    expect(reporter.reports).toEqual([]);
  });

  it('M-01 a mailer from the config reports the address that the server will never take, and the job is done', async () => {
    const reporter = createMemoryReporter();
    const mailer = createMailerFromConfig(
      { ...base, MAIL_DRIVER: 'smtp', SMTP_URL: open.url },
      { logger, errorReporter: reporter },
    );
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job], logger });
    await mailer.over(queue).send({ to: 'reject-me@example.com', subject: 'Nobody home', text: 'x' });
    await mailer.close();
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toMatchObject({ code: 'MAIL_RECIPIENT_REFUSED' });
    expect((await queue.deadLetters()).jobs).toHaveLength(0);
  });

  it('M-01 a bad MAIL_FROM is refused at boot', () => {
    expect(() => createMailerFromConfig({ ...base, MAIL_FROM: 'not an address' }, { logger })).toThrow(/not valid/);
    expect(createMailerFromConfig({ ...base, MAIL_FROM: undefined }, { logger }).job.name).toBe('mail.send');
  });
});

mailTransportContractSuite('smtp', {
  make: async () => {
    const server = await startFakeSmtp();
    const transport = nodemailerTransport({ url: server.url });
    const close = transport.close.bind(transport);
    transport.close = async () => {
      await close();
      await server.close();
    };
    return transport;
  },
  refusedAddress: 'reject-me@example.com',
});
