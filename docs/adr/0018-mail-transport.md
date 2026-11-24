<!--
  BieberKit

  @file        docs/adr/0018-mail-transport.md
  @description ADR 0018: SMTP goes through nodemailer behind a small transport port, and the message is checked before it is queued.
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

# 0018. Mail: nodemailer behind a transport port, a message checked before it is queued

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and this one follows the requirements and the evidence above.
- Date: 2026-11-23
- Deciders: Bieber Kieu
- Requirements: M-01, CFG-07, SEC-04, SEC-09, PKG-03, P9

## Context

Mail must go through the queue (M-01), work with a `log` driver and with SMTP (`MAIL_DRIVER`), and never let a field start a header. SMTP is a protocol that a project does not write by hand: STARTTLS, AUTH, the encoding of non-ASCII subjects and bodies, the MIME of a text and html pair. nodemailer does all of it.

## Options

| Option                                  | For                                                       | Against                                                         |
| --------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| A. nodemailer behind a `MailTransport`  | The standard library for SMTP, no dependencies of its own | One runtime dependency; its types are a separate package        |
| B. Our own SMTP client                  | No dependency                                             | STARTTLS, AUTH and MIME to write and to secure: not our product |
| C. A vendor API (SES, Resend, Postmark) | No SMTP at all                                            | Locks the framework to a vendor; `smtp` still has to exist      |

## Decision

Option A. `@bieberkit/mail` defines `MailTransport` (`send`, `verify`, `close`), and `@bieberkit/mail/nodemailer` is the only code that imports nodemailer (PKG-03). A vendor API is one more transport on the same port, and needs no change to the mailer. The check of a message (addresses, subject, size, no control character) is ours and runs before the message is queued, because nodemailer escapes a header but a caller must still get an error for a subject with a line break.

Runtime dependencies added (P9):

| Package      | Version | Used by                      | License | Maintainers (npm) | Reason                                                            |
| ------------ | ------- | ---------------------------- | ------- | ----------------- | ----------------------------------------------------------------- |
| `nodemailer` | 10.6.0  | mail (`/nodemailer` subpath) | MIT-0   | andris            | The SMTP client: STARTTLS, AUTH, MIME and the encoding of headers |

`@types/nodemailer` 8.0.2 (MIT, DefinitelyTyped) is a development dependency and does not ship. `nodemailer` has no dependencies and no install script. 10.6.1 was published on 2026-11-20, and `minimumReleaseAge` (7 days) keeps the project on 10.6.0 until 2026-11-27. MIT-0 is compatible with Apache-2.0. `zod` is already in ADR 0015.

## Consequences

- Easier: `MAIL_DRIVER` changes a transport and nothing else. A test needs no mail server: the memory transport, or `startFakeSmtp` for the SMTP path.
- Harder: a message has no attachments, so a mail with a file links to the storage. A project that must attach files needs a later decision on the size of a job.
- Ruled out: sending in the request, and a message that is checked in the worker, where nobody can act on the error.

## Spec changes

- 15.4: add M-03 (a message is checked when it is sent, a refusal for good is not retried) and M-04 (the `log` driver prints no address and no body in production, and a plain SMTP URL is refused in production). Done in this series.
