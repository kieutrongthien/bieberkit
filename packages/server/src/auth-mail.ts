/**
 * BieberKit
 *
 * @file        packages/server/src/auth-mail.ts
 * @description Plain-text password reset, verification, invitation and MFA-reset callbacks using the queued mail contract (BPL-02, M-01, USR-10, USR-11).
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

import type { AuthMailOptions } from '@bieberkit/auth';
import { MAIL_JOB, prepareMessage } from '@bieberkit/mail';
import type { Mail, Mailbox, Message } from '@bieberkit/mail';
import { currentEntityManager, emitEvent } from '@bieberkit/data/orm';

/** Human-facing messages for the authentication callbacks; delivery goes through the queue. */
export function authMessages(mail: Mail, from?: Mailbox): Required<AuthMailOptions> {
  const send = async (message: Message): Promise<void> => {
    const em = currentEntityManager();
    if (em?.isInTransaction() === true) {
      emitEvent(em, { name: MAIL_JOB, payload: prepareMessage(message, from) });
      return;
    }
    await mail.send(message);
  };
  return {
    sendResetPassword: async ({ to, url }) => {
      await send({ to, subject: 'Reset your password', text: 'Reset your password using this link:\n\n' + url });
    },
    sendVerification: async ({ to, url }) => {
      await send({
        to,
        subject: 'Verify your email address',
        text: 'Verify your email address using this link:\n\n' + url,
      });
    },
    sendInvite: async ({ to, url }) => {
      await send({
        to,
        subject: 'You are invited',
        text: 'An account was made for you. Choose your password using this link, within 7 days:\n\n' + url,
      });
    },
    sendNewDevice: async ({ to, device, ip, at }) => {
      await send({
        to,
        subject: 'New sign in to your account',
        text:
          `Your account was signed in from a device that we have not seen before.\n\nDevice: ${device}\nAddress: ${ip === '' ? 'unknown' : ip}\nTime: ${at.toISOString()}\n\n` +
          'If this was you, nothing more is needed. If not, change your password and sign out the other sessions.',
      });
    },
    sendMfaReset: async ({ to }) => {
      await send({
        to,
        subject: 'Your second factor was removed',
        text:
          'An administrator removed the second factor of your account and signed you out everywhere. ' +
          'Set it up again at your next sign in. If you did not ask for this, tell your administrator.',
      });
    },
  };
}
