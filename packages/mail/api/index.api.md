<!--
  BieberKit

  @file        packages/mail/api/index.api.md
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
import { Logger } from "@bieberkit/core";
import { a as MailTransport, c as PreparedMessage, i as MailReceipt, l as parseSender, n as MAX_RECIPIENTS, o as Mailbox, r as MailError, s as Message, t as Address, u as prepareMessage } from "./contract-BFl6GzOT.js";
import { a as createMailer, i as MailerOptions, n as Mail, r as Mailer, t as MAIL_JOB } from "./mailer-DUUP24mj.js";
interface LogTransportOptions {
  readonly logger: Logger;
  readonly verbose?: boolean;
}
export declare function createLogTransport(options: LogTransportOptions): MailTransport;
interface MemoryTransport extends MailTransport {
  readonly sent: readonly PreparedMessage[];
  failWith(...errors: MailError[]): void;
}
export declare function createMemoryTransport(): MemoryTransport;
export { type Address, type LogTransportOptions, MAIL_JOB, MAX_RECIPIENTS, type Mail, MailError, type MailReceipt, type MailTransport, type Mailbox, type Mailer, type MailerOptions, type MemoryTransport, type Message, type PreparedMessage, createMailer, parseSender, prepareMessage };
```
