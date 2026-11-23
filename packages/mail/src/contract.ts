/**
 * BieberKit
 *
 * @file        packages/mail/src/contract.ts
 * @description The types of the mail and of its transports, the errors, and the check that makes a message safe to send: addresses, subject, size and header injection (M-01).
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

import { BkError } from '@bieberkit/core';

export type Address = string | { readonly name?: string; readonly address: string };

/** What a caller gives to `send`. */
export interface Message {
  readonly to: Address | readonly Address[];
  readonly cc?: Address | readonly Address[];
  readonly bcc?: Address | readonly Address[];
  /** Defaults to the sender of the mailer (`MAIL_FROM`). */
  readonly from?: Address;
  readonly replyTo?: Address;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
}

export interface Mailbox {
  readonly name?: string;
  readonly address: string;
}

/** A message that was checked: every address is one mailbox, the sender is known, and nothing can start a new header. It is what a job stores. */
export interface PreparedMessage {
  readonly from: Mailbox;
  readonly to: readonly Mailbox[];
  readonly cc: readonly Mailbox[];
  readonly bcc: readonly Mailbox[];
  readonly replyTo?: Mailbox;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
}

export interface MailReceipt {
  /** The id that the server gave to the message. */
  readonly id: string;
  /** Recipients that the server refused while it took the message for the others. */
  readonly rejected: readonly string[];
}

/** Where a message goes. It never queues and never retries: the mailer and the queue do. */
export interface MailTransport {
  readonly name: string;
  /** Throws `MailError`. `permanent` says that the same message will never be taken, so it must not be tried again. */
  send(message: PreparedMessage): Promise<MailReceipt>;
  /** Checks that the server can be reached and that the login works. For `bieberkit doctor`. */
  verify(): Promise<void>;
  close(): Promise<void>;
}

export class MailError extends BkError {
  /** True when a retry cannot help: an address that does not exist, a message that the server refuses. */
  readonly permanent: boolean;

  constructor(message: string, options: ConstructorParameters<typeof BkError>[1] & { readonly permanent?: boolean }) {
    super(message, options);
    this.permanent = options.permanent ?? false;
  }
}

export function mailError(
  code: string,
  status: number,
  message: string,
  fix: string,
  extra: { readonly permanent?: boolean; readonly cause?: unknown } = {},
): MailError {
  return new MailError(message, {
    code,
    status,
    fix,
    ...(extra.permanent === undefined ? {} : { permanent: extra.permanent }),
    ...(extra.cause === undefined ? {} : { cause: extra.cause }),
  });
}

export const MAX_RECIPIENTS: number = 50;
export const MAX_PART_BYTES: number = 1024 * 1024;
export const MAX_SUBJECT: number = 998;

// No spaces, no quotes, no angle brackets, no comma or semicolon: one plain mailbox, as it is used in practice.
const LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
// Built from a string, because a regex literal with the line separators U+2028 and U+2029 is not valid.
// oxlint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\u0000-\u001f\u007f\u2028\u2029]');

const invalid = (message: string, fix: string): MailError =>
  mailError('MAIL_MESSAGE_INVALID', 400, message, fix, { permanent: true });

function mailbox(value: Address, what: string): Mailbox {
  const given = typeof value === 'string' ? { address: value } : value;
  const address = typeof given.address === 'string' ? given.address.trim() : '';
  const at = address.lastIndexOf('@');
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (
    at < 1 ||
    address.length > 254 ||
    !LOCAL.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !DOMAIN.test(domain)
  ) {
    throw invalid(`The ${what} address is not valid.`, 'Give one plain address, like name@example.com.');
  }
  const name = 'name' in given && given.name !== undefined ? given.name.trim() : undefined;
  if (name !== undefined && (name.length > 200 || CONTROL.test(name))) {
    throw invalid(`The name of the ${what} is not valid.`, 'A name has at most 200 characters and no line break.');
  }
  return { ...(name === undefined || name === '' ? {} : { name }), address };
}

function mailboxes(value: Address | readonly Address[] | undefined, what: string): Mailbox[] {
  if (value === undefined) return [];
  const list: readonly Address[] = typeof value === 'string' || !Array.isArray(value) ? [value] : value;
  return list.map((item) => mailbox(item, what));
}

const bytes = (text: string): number => new TextEncoder().encode(text).length;

/** Checks a message and fills the sender. Anything that is not right is `MAIL_MESSAGE_INVALID`, at the call of the caller. */
export function prepareMessage(message: Message, defaultFrom: Mailbox | undefined): PreparedMessage {
  const from = message.from === undefined ? defaultFrom : mailbox(message.from, 'sender');
  if (from === undefined) {
    throw mailError(
      'MAIL_FROM_REQUIRED',
      500,
      'The message has no sender.',
      'Set MAIL_FROM, or give `from` in the message.',
    );
  }
  const to = mailboxes(message.to, 'recipient');
  const cc = mailboxes(message.cc, 'cc');
  const bcc = mailboxes(message.bcc, 'bcc');
  if (to.length === 0) throw invalid('The message has no recipient.', 'Give at least one address in `to`.');
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    throw invalid(`The message has more than ${String(MAX_RECIPIENTS)} recipients.`, 'Send in smaller groups.');
  }
  const replyTo = message.replyTo === undefined ? undefined : mailbox(message.replyTo, 'reply-to');
  const subject = typeof message.subject === 'string' ? message.subject.trim() : '';
  if (subject === '' || subject.length > MAX_SUBJECT || CONTROL.test(subject)) {
    throw invalid(
      'The subject is empty, too long or has a line break.',
      `Use 1 to ${String(MAX_SUBJECT)} characters on one line.`,
    );
  }
  if (message.text === undefined && message.html === undefined) {
    throw invalid('The message has no body.', 'Give `text`, `html` or both.');
  }
  for (const [label, part] of [
    ['text', message.text],
    ['html', message.html],
  ] as const) {
    if (part !== undefined && (typeof part !== 'string' || bytes(part) > MAX_PART_BYTES)) {
      throw invalid(
        `The ${label} of the message is too large.`,
        'Keep each part under 1 MiB, and link to files instead of attaching them.',
      );
    }
  }
  return {
    from,
    to,
    cc,
    bcc,
    ...(replyTo === undefined ? {} : { replyTo }),
    subject,
    ...(message.text === undefined ? {} : { text: message.text }),
    ...(message.html === undefined ? {} : { html: message.html }),
  };
}

/** Reads a sender from `MAIL_FROM`: `a@b.com` or `Name <a@b.com>`. */
export function parseSender(value: string | undefined): Mailbox | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const match = /^(.*)<([^<>]+)>\s*$/.exec(value.trim());
  return match === null
    ? mailbox(value, 'sender')
    : mailbox({ name: (match[1] ?? '').trim().replace(/^"|"$/g, ''), address: match[2] ?? '' }, 'sender');
}
