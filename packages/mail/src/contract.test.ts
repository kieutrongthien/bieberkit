/**
 * BieberKit
 *
 * @file        packages/mail/src/contract.test.ts
 * @description Tests of the check of a message: addresses, names, the subject, the size, the recipients and the sender (M-01).
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

import { describe, expect, it } from 'vitest';
import { MAX_RECIPIENTS, parseSender, prepareMessage } from './contract.ts';
import type { Message } from './contract.ts';

const FROM = { name: 'Shop', address: 'shop@example.com' };
const ok: Message = { to: 'an@example.com', subject: 'Hello', text: 'Body' };

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'other';
  }
  return undefined;
};

describe('M-01 prepareMessage', () => {
  it('M-01 makes one mailbox of each address, and fills the sender', () => {
    const prepared = prepareMessage(
      { ...ok, to: ['a@example.com', { name: 'Bình', address: 'b@example.com' }], cc: 'c@example.com' },
      FROM,
    );
    expect(prepared.from).toEqual(FROM);
    expect(prepared.to).toEqual([{ address: 'a@example.com' }, { name: 'Bình', address: 'b@example.com' }]);
    expect(prepared.cc).toEqual([{ address: 'c@example.com' }]);
    expect(prepared.bcc).toEqual([]);
    expect(prepared.replyTo).toBeUndefined();
  });

  it('M-01 the sender of the message wins over the default, and the reply-to is kept', () => {
    const prepared = prepareMessage(
      { ...ok, from: 'sales@example.com', replyTo: { name: 'Help', address: 'help@example.com' } },
      FROM,
    );
    expect(prepared.from).toEqual({ address: 'sales@example.com' });
    expect(prepared.replyTo).toEqual({ name: 'Help', address: 'help@example.com' });
  });

  it('M-01 no sender at all is MAIL_FROM_REQUIRED', () => {
    expect(codeOf(() => prepareMessage(ok, undefined))).toBe('MAIL_FROM_REQUIRED');
  });

  it('M-01 refuses an address that is not one plain mailbox', () => {
    for (const address of [
      '',
      'no-at-sign',
      '@example.com',
      'a@',
      'a b@example.com',
      'a@exa mple.com',
      'a@example',
      'a@example..com',
      '.a@example.com',
      'a.@example.com',
      'a..b@example.com',
      '<a@example.com>',
      'a@example.com, b@example.com',
      'a@example.com;b@example.com',
      '"a"@example.com',
      'a@example.com\r\nBcc: evil@example.com',
      'a@example.com\nBcc: evil@example.com',
      `${'a'.repeat(65)}@example.com`,
      `a@${'b'.repeat(64)}.com`,
      `a@${'b.'.repeat(130)}com`,
    ]) {
      expect(codeOf(() => prepareMessage({ ...ok, to: address }, FROM))).toBe('MAIL_MESSAGE_INVALID');
    }
    expect(prepareMessage({ ...ok, to: ' padded@example.com ' }, FROM).to).toEqual([{ address: 'padded@example.com' }]);
    expect(codeOf(() => prepareMessage({ ...ok, to: "o'brien+tag@sub.example.co.uk" }, FROM))).toBeUndefined();
  });

  it('M-01 refuses a name with a line break or a control character, or one that is too long', () => {
    for (const name of ['Evil\r\nBcc: x@example.com', 'a\nb', 'tab\there', 'nul\u0000', 'l\u2028s', 'n'.repeat(201)]) {
      expect(codeOf(() => prepareMessage({ ...ok, to: { name, address: 'a@example.com' } }, FROM))).toBe(
        'MAIL_MESSAGE_INVALID',
      );
    }
    expect(prepareMessage({ ...ok, to: { name: '  ', address: 'a@example.com' } }, FROM).to).toEqual([
      { address: 'a@example.com' },
    ]);
  });

  it('M-01 a subject cannot start a new header', () => {
    for (const subject of ['', '   ', 'Hi\r\nBcc: evil@example.com', 'Hi\nthere', 'x'.repeat(999), 'a\u0000b']) {
      expect(codeOf(() => prepareMessage({ ...ok, subject }, FROM))).toBe('MAIL_MESSAGE_INVALID');
    }
    expect(prepareMessage({ ...ok, subject: '  Xin chào 👋  ' }, FROM).subject).toBe('Xin chào 👋');
  });

  it('M-01 needs a recipient in `to`, and at most 50 recipients in all', () => {
    expect(codeOf(() => prepareMessage({ ...ok, to: [] }, FROM))).toBe('MAIL_MESSAGE_INVALID');
    expect(codeOf(() => prepareMessage({ ...ok, to: [], bcc: 'a@example.com' }, FROM))).toBe('MAIL_MESSAGE_INVALID');
    const many = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `u${String(i)}@example.com`);
    expect(codeOf(() => prepareMessage({ ...ok, to: many }, FROM))).toBeUndefined();
    expect(codeOf(() => prepareMessage({ ...ok, to: many, cc: 'one-more@example.com' }, FROM))).toBe(
      'MAIL_MESSAGE_INVALID',
    );
  });

  it('M-01 needs a body, and each part is at most 1 MiB', () => {
    expect(codeOf(() => prepareMessage({ to: 'a@example.com', subject: 's' }, FROM))).toBe('MAIL_MESSAGE_INVALID');
    expect(
      codeOf(() => prepareMessage({ to: 'an@example.com', subject: 'Hello', html: '<p>hi</p>' }, FROM)),
    ).toBeUndefined();
    expect(codeOf(() => prepareMessage({ ...ok, text: 'x'.repeat(1024 * 1024) }, FROM))).toBeUndefined();
    expect(codeOf(() => prepareMessage({ ...ok, text: 'x'.repeat(1024 * 1024 + 1) }, FROM))).toBe(
      'MAIL_MESSAGE_INVALID',
    );
    expect(
      codeOf(() => prepareMessage({ to: 'an@example.com', subject: 'Hello', html: 'é'.repeat(600_000) }, FROM)),
    ).toBe('MAIL_MESSAGE_INVALID');
  });

  it('M-01 an invalid message is a 400 that a retry cannot mend', () => {
    expect(() => prepareMessage({ ...ok, to: 'nope' }, FROM)).toThrowError(
      expect.objectContaining({ code: 'MAIL_MESSAGE_INVALID', status: 400, permanent: true }),
    );
  });
});

describe('M-01 parseSender', () => {
  it('M-01 reads an address or a name with an address, and nothing when there is none', () => {
    expect(parseSender('shop@example.com')).toEqual({ address: 'shop@example.com' });
    expect(parseSender('Cửa hàng <shop@example.com>')).toEqual({ name: 'Cửa hàng', address: 'shop@example.com' });
    expect(parseSender('"Shop, Inc" <shop@example.com>')).toEqual({ name: 'Shop, Inc', address: 'shop@example.com' });
    expect(parseSender('<shop@example.com>')).toEqual({ address: 'shop@example.com' });
    expect(parseSender(undefined)).toBeUndefined();
    expect(parseSender('  ')).toBeUndefined();
    expect(codeOf(() => parseSender('not an address'))).toBe('MAIL_MESSAGE_INVALID');
  });
});
