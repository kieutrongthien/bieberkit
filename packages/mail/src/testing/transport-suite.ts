/**
 * BieberKit
 *
 * @file        packages/mail/src/testing/transport-suite.ts
 * @description The suite of tests that every mail transport must pass, so that switching MAIL_DRIVER changes no application code (M-01).
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

import { afterAll, describe, expect, it } from 'vitest';
import type { MailTransport, PreparedMessage } from '../contract.ts';
import { MailError } from '../contract.ts';

export interface TransportSubject {
  /** A transport over a place that takes mail (a log, a list, a fake server). The suite closes it. */
  readonly make: () => Promise<MailTransport>;
  readonly cleanup?: () => Promise<void>;
  /** An address that the transport refuses for good, for the transports that can. The suite then checks that it is a permanent MailError. */
  readonly refusedAddress?: string;
}

const base: PreparedMessage = {
  from: { name: 'Shop', address: 'shop@example.com' },
  to: [{ name: 'An', address: 'an@example.com' }],
  cc: [],
  bcc: [],
  subject: 'Contract test',
  text: 'Plain text',
};

/** The cases every transport passes. A message that reaches a transport has already been checked by `prepareMessage`. */
export function mailTransportContractSuite(name: string, subject: TransportSubject): void {
  describe(`${name} transport contract`, () => {
    const opened: MailTransport[] = [];
    const open = async (): Promise<MailTransport> => {
      const transport = await subject.make();
      opened.push(transport);
      return transport;
    };
    afterAll(async () => {
      await Promise.all(opened.map((transport) => transport.close()));
      await subject.cleanup?.();
    });

    it('M-01 takes a message and answers a receipt with an id and the recipients that it refused', async () => {
      const transport = await open();
      const receipt = await transport.send(base);
      expect(receipt.id.length).toBeGreaterThan(0);
      expect(receipt.rejected).toEqual([]);
    });

    it('M-01 gives each message an id of its own', async () => {
      const transport = await open();
      const [a, b] = await Promise.all([transport.send(base), transport.send(base)]);
      expect(a.id).not.toBe(b.id);
    });

    it('M-01 takes cc, bcc, a reply-to and an html part with text', async () => {
      const transport = await open();
      const receipt = await transport.send({
        ...base,
        cc: [{ address: 'cc@example.com' }],
        bcc: [{ address: 'bcc@example.com' }],
        replyTo: { address: 'help@example.com' },
        html: '<p>Html part</p>',
      });
      expect(receipt.id.length).toBeGreaterThan(0);
    });

    it('M-01 takes an html body alone, and Vietnamese in the subject, the names and the text', async () => {
      const transport = await open();
      const { text: _text, ...withoutText } = base;
      await expect(
        transport.send({
          ...withoutText,
          from: { name: 'Cửa hàng Hoa', address: 'shop@example.com' },
          to: [{ name: 'Nguyễn Thị Lan', address: 'lan@example.com' }],
          subject: 'Chào mừng bạn đến với cửa hàng 🌸',
          html: '<p>Xin chào Lan, đơn hàng của bạn đã được xác nhận.</p>',
        }),
      ).resolves.toBeDefined();
    });

    it('M-01 takes a body of 1 MiB', async () => {
      const transport = await open();
      await expect(transport.send({ ...base, text: 'x'.repeat(1024 * 1024) })).resolves.toBeDefined();
    });

    it('M-01 takes many messages at the same time', async () => {
      const transport = await open();
      const receipts = await Promise.all(Array.from({ length: 20 }, () => transport.send(base)));
      expect(new Set(receipts.map((receipt) => receipt.id)).size).toBe(20);
    });

    it('M-01 verify answers when the transport can be used, and close can be called twice', async () => {
      const transport = await open();
      await expect(transport.verify()).resolves.toBeUndefined();
      await transport.close();
      await expect(transport.close()).resolves.toBeUndefined();
    });

    it('M-01 has a name', async () => {
      expect((await open()).name.length).toBeGreaterThan(0);
    });

    if (subject.refusedAddress !== undefined) {
      const refused = subject.refusedAddress;
      it('M-01 an address that it refuses for good is a MailError that is permanent, with a code', async () => {
        const transport = await open();
        let caught: unknown;
        try {
          await transport.send({ ...base, to: [{ address: refused }] });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(MailError);
        expect(caught).toMatchObject({ permanent: true });
        expect(caught instanceof MailError ? caught.code : '').toMatch(/^MAIL_/);
      });
    }
  });
}
