<!--
  BieberKit

  @file        packages/mail/api/mailer.api.md
  @description API report of @bieberkit/mail: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
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

# API report: @bieberkit/mail

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { DispatchOptions, Dispatched, JobDef, Queue } from "@bieberkit/queue";
import { ErrorReporter, Logger } from "@bieberkit/core";
import { a as MailTransport, c as PreparedMessage, i as MailReceipt, o as Mailbox, s as Message } from "./contract-BFl6GzOT.js";
interface MailerOptions {
  readonly transport: MailTransport;
  readonly from?: Mailbox;
  readonly logger: Logger;
  readonly errorReporter?: ErrorReporter;
  readonly attempts?: number;
  readonly backoffMs?: (attempt: number) => number;
}
interface Mail {
  send(message: Message, options?: DispatchOptions): Promise<Dispatched>;
  sendNow(message: Message): Promise<MailReceipt>;
  prepare(message: Message): PreparedMessage;
  verify(): Promise<void>;
}
interface Mailer {
  readonly job: JobDef<PreparedMessage>;
  over(queue: Queue): Mail;
  close(): Promise<void>;
}
declare const MAIL_JOB = "mail.send";
declare function createMailer(options: MailerOptions): Mailer;
export { createMailer as a, MailerOptions as i, Mail as n, Mailer as r, MAIL_JOB as t };
```
