/**
 * BieberKit
 *
 * @file        packages/mail/src/testing/fake-smtp.ts
 * @description A small SMTP server for tests: it takes messages, can ask for a login, and refuses the addresses that the test names, with no dependency.
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
import type { Server, Socket } from 'node:net';

export interface FakeSmtpOptions {
  /** The login that the server asks for (AUTH PLAIN or LOGIN). With none, no login is asked. */
  readonly auth?: { readonly user: string; readonly pass: string };
}

export interface ReceivedMail {
  readonly from: string;
  readonly to: readonly string[];
  /** The whole message as the server got it, headers and body. */
  readonly data: string;
}

export interface FakeSmtp {
  readonly port: number;
  readonly url: string;
  readonly received: readonly ReceivedMail[];
  /** Addresses that hold this text are refused with 550 (never exists), or 451 when the text is `tempfail`. */
  close(): Promise<void>;
}

const text = (value: string) => Buffer.from(value, 'base64').toString('utf8');

/** Starts the server on a free port of the loopback address. A recipient with `reject` in it gets 550, one with `tempfail` gets 451. */
export async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const received: ReceivedMail[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let from = '';
    let to: string[] = [];
    let data: string[] | undefined;
    let loggedIn = options.auth === undefined;
    let loginStep: 'user' | 'pass' | undefined;
    let user = '';
    let buffer = '';
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 fake.example ESMTP');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const end = buffer.indexOf('\r\n');
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data !== undefined) {
          if (line === '.') {
            received.push({ from, to, data: data.join('\r\n') });
            data = undefined;
            reply('250 2.0.0 queued as fake-1');
          } else data.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        if (loginStep !== undefined) {
          const value = text(line);
          if (loginStep === 'user') {
            user = value;
            loginStep = 'pass';
            reply(`334 ${Buffer.from('Password:').toString('base64')}`);
          } else {
            loginStep = undefined;
            loggedIn = value === options.auth?.pass && user === options.auth.user;
            reply(loggedIn ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication failed');
          }
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write(
            `250-fake.example\r\n${options.auth === undefined ? '' : '250-AUTH PLAIN LOGIN\r\n'}250 8BITMIME\r\n`,
          );
        } else if (command.startsWith('AUTH PLAIN')) {
          const [, name = '', pass = ''] = text(line.slice(11).trim()).split('\u0000');
          loggedIn = name === options.auth?.user && pass === options.auth.pass;
          reply(loggedIn ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication failed');
        } else if (command.startsWith('AUTH LOGIN')) {
          loginStep = 'user';
          reply(`334 ${Buffer.from('Username:').toString('base64')}`);
        } else if (command.startsWith('MAIL FROM')) {
          if (!loggedIn) reply('530 5.7.0 Authentication required');
          else {
            from = /<([^>]*)>/.exec(line)?.[1] ?? '';
            to = [];
            reply('250 2.1.0 OK');
          }
        } else if (command.startsWith('RCPT TO')) {
          const address = /<([^>]*)>/.exec(line)?.[1] ?? '';
          if (address.includes('tempfail')) reply('451 4.3.0 Try again later');
          else if (address.includes('reject')) reply('550 5.1.1 No such user');
          else {
            to.push(address);
            reply('250 2.1.5 OK');
          }
        } else if (command === 'DATA') {
          if (to.length === 0) reply('554 5.5.1 No valid recipients');
          else {
            data = [];
            reply('354 End data with <CR><LF>.<CR><LF>');
          }
        } else if (command === 'RSET' || command === 'NOOP') reply('250 OK');
        else if (command === 'QUIT') {
          reply('221 Bye');
          socket.end();
        } else reply('502 5.5.2 Command not recognized');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    port,
    url: `smtp://127.0.0.1:${String(port)}`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
