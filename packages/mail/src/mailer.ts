/**
 * BieberKit
 *
 * @file        packages/mail/src/mailer.ts
 * @description createMailer: the job that sends a message through a transport, and the Mail that puts messages on the queue (M-01).
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

import { reportError, createNoopReporter } from '@bieberkit/core';
import type { ErrorReporter, Logger } from '@bieberkit/core';
import { defineJob } from '@bieberkit/queue';
import type { Dispatched, DispatchOptions, JobDef, Queue } from '@bieberkit/queue';
import * as z from 'zod/mini';
import { MailError, prepareMessage } from './contract.ts';
import type { Mailbox, MailReceipt, MailTransport, Message, PreparedMessage } from './contract.ts';

export interface MailerOptions {
  readonly transport: MailTransport;
  /** The sender of a message that gives none (`MAIL_FROM`). */
  readonly from?: Mailbox;
  readonly logger: Logger;
  /** Receives a message that the server refused for good. */
  readonly errorReporter?: ErrorReporter;
  /** Deliveries of a message before it is a dead job. Defaults to 5. */
  readonly attempts?: number;
  /** The wait before a retry. Defaults to 30 seconds, doubled each time, at most an hour. */
  readonly backoffMs?: (attempt: number) => number;
}

export interface Mail {
  /** Checks the message now, then puts it on the queue (M-01). The answer is the job, not the delivery. */
  send(message: Message, options?: DispatchOptions): Promise<Dispatched>;
  /** Sends at once, without the queue, and waits for the server. For a caller that needs the answer, and for tests. */
  sendNow(message: Message): Promise<MailReceipt>;
  verify(): Promise<void>;
}

export interface Mailer {
  /** The job that sends a message. Register it in `createQueue({ jobs })`. */
  readonly job: JobDef<PreparedMessage>;
  /** The mail that queues its messages on `queue`. */
  over(queue: Queue): Mail;
  close(): Promise<void>;
}

const mailbox = z.object({ name: z.optional(z.string()), address: z.string() });
const input = z.object({
  from: mailbox,
  to: z.array(mailbox),
  cc: z.array(mailbox),
  bcc: z.array(mailbox),
  replyTo: z.optional(mailbox),
  subject: z.string(),
  text: z.optional(z.string()),
  html: z.optional(z.string()),
});

export const MAIL_JOB = 'mail.send';
const HOUR = 3_600_000;

/**
 * The part of the mail that is the same for every driver. A message is checked when it is sent, so a bad address is an error for the
 * caller, and then it is a job: the request does not wait for the server (M-01), a failure is retried with a backoff, and a message
 * that the server refuses for good is logged and reported and is not tried again.
 */
export function createMailer(options: MailerOptions): Mailer {
  const reporter = options.errorReporter ?? createNoopReporter();
  const job = defineJob<PreparedMessage>({
    name: MAIL_JOB,
    queue: 'default',
    input,
    attempts: options.attempts ?? 5,
    backoffMs: options.backoffMs ?? ((attempt) => Math.min(30_000 * 2 ** (attempt - 1), HOUR)),
    timeoutMs: 60_000,
    handler: async (message, context) => {
      try {
        const receipt = await options.transport.send(message);
        context.log.info('mail sent', { id: receipt.id, rejected: receipt.rejected.length });
        if (receipt.rejected.length > 0) {
          context.log.warn('the server refused some recipients', { rejected: receipt.rejected.length });
        }
      } catch (error) {
        if (!(error instanceof MailError) || !error.permanent) throw error;
        // The same message will never be taken: a retry would only send the same refusal again.
        context.log.error('mail refused for good', { code: error.code, reason: error.message });
        reportError(reporter, error, {
          source: 'job',
          job: { name: MAIL_JOB, id: context.jobId, queue: 'default', attempt: context.attempt },
        });
      }
    },
  });

  return {
    job,
    over(queue) {
      return {
        // `async`, so that a message that is not valid is a rejection of the promise and not an exception of the call.
        send: async (message, dispatchOptions) =>
          queue.dispatch(job, prepareMessage(message, options.from), dispatchOptions),
        sendNow: async (message) => options.transport.send(prepareMessage(message, options.from)),
        verify: () => options.transport.verify(),
      };
    },
    close: () => options.transport.close(),
  };
}

export type { Dispatched, DispatchOptions };
