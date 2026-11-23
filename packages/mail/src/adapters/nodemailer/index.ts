/**
 * BieberKit
 *
 * @file        packages/mail/src/adapters/nodemailer/index.ts
 * @description Subpath @bieberkit/mail/nodemailer: the SMTP transport and the mailer that MAIL_DRIVER selects (M-01).
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

import type { ErrorReporter, Logger } from '@bieberkit/core';
import { mailError, parseSender } from '../../contract.ts';
import type { MailTransport } from '../../contract.ts';
import { createMailer } from '../../mailer.ts';
import type { Mailer } from '../../mailer.ts';
import { createLogTransport } from '../../transports.ts';
import { nodemailerTransport } from './transport.ts';

export { classify, nodemailerTransport } from './transport.ts';
export type { NodemailerTransportOptions } from './transport.ts';

/** The part of the validated config (`CoreEnv`) that decides the mail. */
export interface MailConfig {
  readonly APP_ENV: string;
  readonly MAIL_DRIVER: 'log' | 'smtp';
  readonly SMTP_URL: string | undefined;
  readonly MAIL_FROM: string | undefined;
}

export interface MailerFromConfigOptions {
  readonly logger: Logger;
  readonly errorReporter?: ErrorReporter;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The transport for `MAIL_DRIVER`. Switching it changes this and nothing in the application (M-01). */
export function transportFromConfig(config: MailConfig, logger: Logger): MailTransport {
  if (config.MAIL_DRIVER === 'log') return createLogTransport({ logger, verbose: config.APP_ENV !== 'production' });
  if (config.SMTP_URL === undefined) {
    throw mailError(
      'MAIL_CONFIG_INVALID',
      500,
      'MAIL_DRIVER=smtp needs SMTP_URL.',
      'Set SMTP_URL, for example smtps://user:password@host:465.',
    );
  }
  const url = new URL(config.SMTP_URL);
  const encrypted = url.protocol === 'smtps:' || url.searchParams.get('requireTLS') === 'true';
  if (config.APP_ENV === 'production' && !encrypted && !LOOPBACK.has(url.hostname)) {
    throw mailError(
      'MAIL_TLS_REQUIRED',
      500,
      'SMTP_URL would send the password and the mail in clear text.',
      'Use smtps://, or add ?requireTLS=true to the URL.',
    );
  }
  return nodemailerTransport({ url: config.SMTP_URL });
}

/** The mailer for the config: the `log` driver or SMTP, and the sender of `MAIL_FROM`. */
export function createMailerFromConfig(config: MailConfig, options: MailerFromConfigOptions): Mailer {
  const from = parseSender(config.MAIL_FROM);
  return createMailer({
    transport: transportFromConfig(config, options.logger),
    logger: options.logger,
    ...(from === undefined ? {} : { from }),
    ...(options.errorReporter === undefined ? {} : { errorReporter: options.errorReporter }),
  });
}
