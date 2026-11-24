<!--
  BieberKit

  @file        packages/mail/api/contract.api.md
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
import { BkError } from "@bieberkit/core";
type Address = string | {
  readonly name?: string;
  readonly address: string;
};
interface Message {
  readonly to: Address | readonly Address[];
  readonly cc?: Address | readonly Address[];
  readonly bcc?: Address | readonly Address[];
  readonly from?: Address;
  readonly replyTo?: Address;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
}
interface Mailbox {
  readonly name?: string;
  readonly address: string;
}
interface PreparedMessage {
  readonly from: Mailbox;
  readonly to: readonly Mailbox[];
  readonly cc: readonly Mailbox[];
  readonly bcc: readonly Mailbox[];
  readonly replyTo?: Mailbox;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
}
interface MailReceipt {
  readonly id: string;
  readonly rejected: readonly string[];
}
interface MailTransport {
  readonly name: string;
  send(message: PreparedMessage): Promise<MailReceipt>;
  verify(): Promise<void>;
  close(): Promise<void>;
}
declare class MailError extends BkError {
  readonly permanent: boolean;
  constructor(message: string, options: ConstructorParameters<typeof BkError>[1] & {
    readonly permanent?: boolean;
  });
}
declare const MAX_RECIPIENTS: number;
declare function prepareMessage(message: Message, defaultFrom: Mailbox | undefined): PreparedMessage;
declare function parseSender(value: string | undefined): Mailbox | undefined;
export { MailTransport as a, PreparedMessage as c, MailReceipt as i, parseSender as l, MAX_RECIPIENTS as n, Mailbox as o, MailError as r, Message as s, Address as t, prepareMessage as u };
```
