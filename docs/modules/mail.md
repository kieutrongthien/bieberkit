<!--
  BieberKit

  @file        docs/modules/mail.md
  @description Module spec of @bieberkit/mail: messages that are checked when they are sent, the mailer and its job on the queue, the log and SMTP transports, and the config.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# @bieberkit/mail

- Package: `@bieberkit/mail`
- Layer: contracts (it may import `@bieberkit/core` and `@bieberkit/queue`)
- Spec sections: 15.4 (M-01), CFG-07, SEC-04, SEC-09, OBS-06, PKG-03
- Status: **Prepared on 2026-11-23.** ADR 0018 (Proposed) lists the library (P9). Templates (M-02, React Email) come with the admin and the site, and use this package to send.

## Purpose

Sends mail without making a request wait for a mail server, and without letting a message start a header that the caller did not write. A message is checked when it is sent, then it is a job on the queue (M-01): a slow or down server is retried with a backoff, and a message that the server refuses for good is logged and reported and is not tried again.

## Public API

```ts
createMailer({ transport, from?, logger, errorReporter?, attempts?, backoffMs? }): Mailer

interface Mailer {
  job: JobDef<PreparedMessage>        // 'mail.send'; register it in createQueue({ jobs })
  over(queue): Mail
  close()
}
interface Mail {
  send(message, { jobId?, delayMs?, queue? }): Promise<{ id, duplicate }>   // checks, then queues
  sendNow(message): Promise<MailReceipt>                                    // no queue; waits for the server
  verify(): Promise<void>
}
prepareMessage(message, defaultFrom); parseSender('Name <a@b.com>')
createLogTransport({ logger, verbose? }); createMemoryTransport()
// @bieberkit/mail/nodemailer
nodemailerTransport({ url, connectionTimeoutMs?, socketTimeoutMs? }): MailTransport
createMailerFromConfig(config, { logger, errorReporter? }): Mailer        // MAIL_DRIVER, SMTP_URL, MAIL_FROM, APP_ENV
// @bieberkit/mail/testing
startFakeSmtp({ auth? }): FakeSmtp                                        // a server for tests, with no dependency
```

## Rules

1. **A message is checked when it is sent, at the call of the caller.** `send` is `async`, so a message that is not valid is a rejection with `MAIL_MESSAGE_INVALID` (400) and nothing is queued. A project checks its templates by sending to the memory transport.
2. **What is valid.** One plain mailbox for each address (`name@example.com`, no spaces, quotes, angle brackets, commas or semicolons; the local part at most 64 characters and the whole at most 254), a name of at most 200 characters, a subject of 1 to 998 characters on one line, a `to` that is not empty, at most 50 recipients in `to`, `cc` and `bcc`, a `text` or an `html` of at most 1 MiB each, and a sender (`from` of the message or `MAIL_FROM`, otherwise `MAIL_FROM_REQUIRED`). A line break or another control character in an address, a name or the subject is refused, so no field can start a header such as `Bcc:` (header injection).
3. **No attachments.** A message links to a file (a signed URL of the storage) and does not carry it: a job stores its input, and a mail server limits its size.
4. **Through the queue (M-01).** `send` stores the prepared message as the input of the job `mail.send` (queue `default`, a `queue` option puts it on `critical` for a password reset). `jobId` makes a message go out once however many times it is asked (Q-01): `reset:<userId>:<tokenId>`. The job restores the tenant and the user of the code that sent the mail (Q-10), so the log lines and the audit of a delivery carry them.
5. **Retries.** 5 attempts, with a wait of 30 seconds doubled each time and at most an hour. A failure that is not a `MailError`, or is not `permanent`, is retried. After the last attempt the job is dead and the queue reports it (OBS-06).
6. **A refusal for good is not retried.** When the transport throws a `MailError` with `permanent` (a 5xx reply that is not about the login, or an invalid envelope), the job logs `mail refused for good`, reports the error with `source: job`, and ends as done: the same message would only get the same answer. A refused login (`EAUTH`, replies 530, 534, 535, 538) and every 4xx reply are not permanent, because a fix of the setting or a wait mends them.
7. **Some recipients refused.** When the server takes the message for some recipients and refuses others, the delivery works and the refused ones are a warning. A retry would send the message again to those who have it.
8. **Transports.** `log` writes the message to the log: in production the number of recipients, the subject and the size, never an address or a body (SEC-09: an address is personal data and a body may hold a token); outside production the addresses and the text, so that a link can be read. `smtp` is nodemailer, with a connection timeout of 10 seconds, a socket timeout of 30 seconds and no access to files or URLs. The error of the SMTP transport has a code (`MAIL_UNREACHABLE`, `MAIL_AUTH_FAILED`, `MAIL_RECIPIENT_REFUSED`, `MAIL_REFUSED`, `MAIL_TEMPORARY_FAILURE`) and never the text of the server, which can repeat an address.
9. **Config.** `MAIL_DRIVER=smtp` needs `SMTP_URL` (`MAIL_CONFIG_INVALID`). In production a `smtp://` URL to a host that is not the loopback address needs `?requireTLS=true`, or has to be `smtps://`, otherwise `MAIL_TLS_REQUIRED` at boot: the password and the mail would go in clear text. `MAIL_FROM` is `a@b.com` or `Name <a@b.com>`, and one that is not valid fails at boot.
10. **`verify`** opens a connection and logs in, for `bieberkit doctor`.
11. **Out of scope.** Templates and the languages of M-02, an inbox for bounces and complaints, DKIM (the server signs), and a list of suppressed addresses.

## Tests

- `contract.test.ts`: every rule of 2, with the injection cases.
- `mailer.test.ts` on the sync queue and the memory transport: a message is sent by a job with the sender filled, `jobId`, the restored context, a retry that works, a dead job, a refusal for good, a partial refusal, `verify`, `close`.
- `transports.test.ts`: the log never prints an address or a body in production.
- `adapters/nodemailer/nodemailer.test.ts`, against `startFakeSmtp` (a small SMTP server of the tests, with AUTH PLAIN and LOGIN): delivery and headers, bcc, Vietnamese subjects, a login with a password that needs encoding, a wrong or missing login, a refused address, a partial refusal, a `451`, a server that is down or silent, `verify`, `classify`, the config and the TLS rule, and the mail from the config through the queue.
