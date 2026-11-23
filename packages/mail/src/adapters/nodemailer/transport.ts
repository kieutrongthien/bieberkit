/**
 * BieberKit
 *
 * @file        packages/mail/src/adapters/nodemailer/transport.ts
 * @description The SMTP transport on nodemailer: the only code of the mail that imports it (PKG-03), with timeouts, and errors sorted into those that a retry can mend and those that it cannot.
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

import { createTransport } from 'nodemailer';
import { mailError } from '../../contract.ts';
import type { MailReceipt, MailTransport, Mailbox, PreparedMessage } from '../../contract.ts';

export interface NodemailerTransportOptions {
  /** `smtp://user:password@host:587` or `smtps://...`. Options such as `?requireTLS=true` are read from the query. */
  readonly url: string;
  readonly connectionTimeoutMs?: number;
  readonly socketTimeoutMs?: number;
}

const format = (box: Mailbox): { name: string; address: string } => ({ name: box.name ?? '', address: box.address });

interface SmtpFailure {
  readonly code?: unknown;
  readonly responseCode?: unknown;
  readonly message?: unknown;
}

/**
 * Sorts a failure of nodemailer. A reply of 5xx (but not a refused login) and `EENVELOPE` (an address that is not valid) cannot be mended
 * by a retry. A timeout, a refused connection, a 4xx reply or a refused login can: the server may come back, or the setting be fixed.
 */
export function classify(error: unknown): { permanent: boolean; code: string } {
  const failure: SmtpFailure = typeof error === 'object' && error !== null ? error : {};
  const response = typeof failure.responseCode === 'number' ? failure.responseCode : 0;
  // A login that is refused or missing is a setting to fix, not a message that is bad: the job waits, and a fix lets it through.
  if (failure.code === 'EAUTH' || [530, 534, 535, 538].includes(response))
    return { permanent: false, code: 'MAIL_AUTH_FAILED' };
  // A 4xx reply says "later", even when nodemailer calls the failure an envelope error.
  if (response >= 400 && response < 500) return { permanent: false, code: 'MAIL_TEMPORARY_FAILURE' };
  if (failure.code === 'EENVELOPE') return { permanent: true, code: 'MAIL_RECIPIENT_REFUSED' };
  if (response >= 500 && response < 600) return { permanent: true, code: 'MAIL_REFUSED' };
  return { permanent: false, code: 'MAIL_UNREACHABLE' };
}

export function nodemailerTransport(options: NodemailerTransportOptions): MailTransport {
  const transporter = createTransport({
    url: options.url,
    connectionTimeout: options.connectionTimeoutMs ?? 10_000,
    greetingTimeout: options.connectionTimeoutMs ?? 10_000,
    socketTimeout: options.socketTimeoutMs ?? 30_000,
    // A message has no attachments, so nothing can be read from a file or an address that the sender named.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    name: 'smtp',
    async send(message: PreparedMessage): Promise<MailReceipt> {
      let info;
      try {
        info = await transporter.sendMail({
          from: format(message.from),
          to: message.to.map(format),
          cc: message.cc.map(format),
          bcc: message.bcc.map(format),
          ...(message.replyTo === undefined ? {} : { replyTo: format(message.replyTo) }),
          subject: message.subject,
          ...(message.text === undefined ? {} : { text: message.text }),
          ...(message.html === undefined ? {} : { html: message.html }),
        });
      } catch (error) {
        const { permanent, code } = classify(error);
        throw mailError(
          code,
          permanent ? 502 : 503,
          // The text of the server is kept out: it can repeat an address, and the error may reach a log.
          `The mail server did not take the message (${code}).`,
          permanent ? 'The server will not take this message. Check the addresses.' : 'It is tried again by the queue.',
          { permanent, cause: error },
        );
      }
      const rejected = info.rejected;
      if (info.accepted.length === 0) {
        throw mailError('MAIL_RECIPIENT_REFUSED', 502, 'The server refused every recipient.', 'Check the addresses.', {
          permanent: true,
        });
      }
      return { id: info.messageId, rejected };
    },
    async verify() {
      try {
        await transporter.verify();
      } catch (error) {
        throw mailError(
          'MAIL_UNREACHABLE',
          503,
          'The mail server could not be reached, or the login is refused.',
          'Check SMTP_URL.',
          {
            cause: error,
          },
        );
      }
    },
    async close() {
      transporter.close();
    },
  };
}
