/**
 * BieberKit
 *
 * @file        packages/mail/src/transports.test.ts
 * @description Tests of the log and memory transports: the log never prints an address or a body unless it is told to (SEC-09).
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

import { describe, expect, it } from 'vitest';
import { createLogger } from '@bieberkit/core';
import { mailTransportContractSuite } from './testing/transport-suite.ts';
import { createLogTransport, createMemoryTransport } from './transports.ts';
import { MailError } from './contract.ts';
import type { PreparedMessage } from './contract.ts';

const prepared: PreparedMessage = {
  from: { address: 'shop@example.com' },
  to: [{ address: 'an@example.com' }],
  cc: [{ address: 'cc@example.com' }],
  bcc: [],
  subject: 'Reset your password',
  text: 'Open https://app.example.com/reset?token=SECRETTOKEN',
};

function logs() {
  const lines: string[] = [];
  return { lines, logger: createLogger({ level: 'info', role: 'web', write: (line) => void lines.push(line) }) };
}

describe('M-01 the log driver', () => {
  it('SEC-09 in production it writes the number of recipients, the subject and the size, and no address and no body', async () => {
    const { lines, logger } = logs();
    const receipt = await createLogTransport({ logger }).send(prepared);
    expect(receipt).toEqual({ id: 'log-1', rejected: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"recipients":2');
    expect(lines[0]).toContain('Reset your password');
    expect(lines[0]).not.toContain('example.com');
    expect(lines[0]).not.toContain('SECRETTOKEN');
  });

  it('M-01 in development it writes the addresses and the text, so that a link can be read', async () => {
    const { lines, logger } = logs();
    await createLogTransport({ logger, verbose: true }).send(prepared);
    expect(lines[0]).toContain('an@example.com');
    expect(lines[0]).toContain('reset?token=');
  });

  it('M-01 numbers its messages, verifies and closes', async () => {
    const { logger } = logs();
    const transport = createLogTransport({ logger });
    await transport.send(prepared);
    expect((await transport.send(prepared)).id).toBe('log-2');
    await expect(transport.verify()).resolves.toBeUndefined();
    await expect(transport.close()).resolves.toBeUndefined();
    expect(transport.name).toBe('log');
  });
});

describe('M-01 the memory transport', () => {
  it('M-01 keeps what is sent, and fails the calls that it is told to, one by one', async () => {
    const transport = createMemoryTransport();
    const failure = new MailError('x', { code: 'MAIL_UNREACHABLE' });
    transport.failWith(failure);
    await expect(transport.send(prepared)).rejects.toBe(failure);
    expect((await transport.send(prepared)).id).toBe('memory-1');
    expect(transport.sent).toEqual([prepared]);
    await transport.verify();
    await transport.close();
  });
});

mailTransportContractSuite('log', { make: async () => createLogTransport({ logger: logs().logger }) });
mailTransportContractSuite('log (verbose)', {
  make: async () => createLogTransport({ logger: logs().logger, verbose: true }),
});
mailTransportContractSuite('memory', { make: async () => createMemoryTransport() });
