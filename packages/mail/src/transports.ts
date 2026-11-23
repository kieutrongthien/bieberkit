/**
 * BieberKit
 *
 * @file        packages/mail/src/transports.ts
 * @description The transports that need no server: log writes the message to the log, and memory keeps it for tests.
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

import type { Logger } from '@bieberkit/core';
import type { MailReceipt, MailTransport, PreparedMessage } from './contract.ts';
import type { MailError } from './contract.ts';

export interface LogTransportOptions {
  readonly logger: Logger;
  /** Writes the addresses and the text of the message. It is for development, where the link of a reset has to be read. Defaults to false. */
  readonly verbose?: boolean;
}

/**
 * The `log` driver: nothing is sent, the message is written to the log. In production (not verbose) a line has the number of recipients,
 * the subject and the size, and never an address or a body, because an address is personal data and a body may hold a token (SEC-09).
 */
export function createLogTransport(options: LogTransportOptions): MailTransport {
  let count = 0;
  return {
    name: 'log',
    async send(message) {
      count += 1;
      const id = `log-${String(count)}`;
      const size = (message.text?.length ?? 0) + (message.html?.length ?? 0);
      options.logger.info(
        'mail (log driver)',
        options.verbose === true
          ? {
              id,
              from: message.from.address,
              to: message.to.map((item) => item.address),
              cc: message.cc.map((item) => item.address),
              bcc: message.bcc.map((item) => item.address),
              subject: message.subject,
              text: message.text,
            }
          : {
              id,
              recipients: message.to.length + message.cc.length + message.bcc.length,
              subject: message.subject,
              size,
            },
      );
      return { id, rejected: [] };
    },
    async verify() {},
    async close() {},
  };
}

export interface MemoryTransport extends MailTransport {
  readonly sent: readonly PreparedMessage[];
  /** Makes the next sends fail with these errors, one for each call, before they work again. */
  failWith(...errors: MailError[]): void;
}

/** Keeps the messages in a list, for the tests of the code that sends mail. */
export function createMemoryTransport(): MemoryTransport {
  const sent: PreparedMessage[] = [];
  const failures: MailError[] = [];
  return {
    name: 'memory',
    sent,
    failWith: (...errors) => void failures.push(...errors),
    async send(message): Promise<MailReceipt> {
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      sent.push(message);
      return { id: `memory-${String(sent.length)}`, rejected: [] };
    },
    async verify() {},
    async close() {},
  };
}
