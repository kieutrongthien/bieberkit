<!--
  BieberKit

  @file        packages/mail/api/nodemailer.api.md
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
import { ErrorReporter, Logger } from "@bieberkit/core";
import { a as MailTransport } from "./contract-BFl6GzOT.js";
import { r as Mailer } from "./mailer-DUUP24mj.js";
interface NodemailerTransportOptions {
  readonly url: string;
  readonly connectionTimeoutMs?: number;
  readonly socketTimeoutMs?: number;
}
export declare function classify(error: unknown): {
  permanent: boolean;
  code: string;
};
export declare function nodemailerTransport(options: NodemailerTransportOptions): MailTransport;
export interface MailConfig {
  readonly APP_ENV: string;
  readonly MAIL_DRIVER: "log" | "smtp";
  readonly SMTP_URL: string | undefined;
  readonly MAIL_FROM: string | undefined;
}
export interface MailerFromConfigOptions {
  readonly logger: Logger;
  readonly errorReporter?: ErrorReporter;
}
export declare function transportFromConfig(config: MailConfig, logger: Logger): MailTransport;
export declare function createMailerFromConfig(config: MailConfig, options: MailerFromConfigOptions): Mailer;
export type { NodemailerTransportOptions };
```
