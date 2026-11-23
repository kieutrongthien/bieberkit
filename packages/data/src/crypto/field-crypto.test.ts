/**
 * BieberKit
 *
 * @file        packages/data/src/crypto/field-crypto.test.ts
 * @description Tests of the encryption of a field: the format of a value, the key of each field, tampering, and the rotation of the key (SEC-08).
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

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { createKeyRing, isEncrypted } from './field-crypto.ts';

const key = (): string => randomBytes(32).toString('base64');
const failure = (run: () => unknown): DataError => {
  try {
    run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
};

describe('SEC-08 the value of an encrypted field', () => {
  it('SEC-08 is the version, the id of the key, a nonce and the ciphertext, as text that is safe in a column', () => {
    const ring = createKeyRing({ current: key() });
    const value = ring.encrypt('secret note', 'crm.Customer.note');
    expect(value).toMatch(/^bk1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(value).not.toContain('secret');
    expect(isEncrypted(value)).toBe(true);
    expect(isEncrypted('plain text')).toBe(false);
  });

  it('SEC-08 opens to the text that was given, whatever it holds: empty, long, unicode, quotes and line breaks', () => {
    const ring = createKeyRing({ current: key() });
    for (const text of ['', 'a', 'Nguyễn Văn Ạ 🙂', 'quote " and \' and \\', 'line\nbreak\r\n', 'x'.repeat(100_000)]) {
      expect(ring.decrypt(ring.encrypt(text, 'e.f'), 'e.f')).toBe(text);
    }
  });

  it('SEC-08 is different every time for the same text, because the nonce is new', () => {
    const ring = createKeyRing({ current: key() });
    expect(ring.encrypt('same', 'e.f')).not.toBe(ring.encrypt('same', 'e.f'));
  });

  it('SEC-08 does not open for another field, because the entity and the field are authenticated with the text', () => {
    const ring = createKeyRing({ current: key() });
    const value = ring.encrypt('secret', 'crm.Customer.note');
    expect(failure(() => ring.decrypt(value, 'crm.Customer.email')).code).toBe('DATA_DECRYPTION_FAILED');
    expect(failure(() => ring.decrypt(value, 'crm.Other.note')).code).toBe('DATA_DECRYPTION_FAILED');
  });

  it('SEC-08 does not open when one character of it was changed, and says nothing of the value', () => {
    const ring = createKeyRing({ current: key() });
    const value = ring.encrypt('secret', 'e.f');
    const parts = value.split('.');
    const body = parts[3] ?? '';
    const tampered = [...parts.slice(0, 3), `${body.slice(0, -2)}${body.endsWith('AA') ? 'BB' : 'AA'}`].join('.');
    const error = failure(() => ring.decrypt(tampered, 'e.f'));
    expect(error.code).toBe('DATA_DECRYPTION_FAILED');
    expect(error.message).not.toContain(body);
    expect(error.message).not.toContain('secret');
  });

  it('SEC-08 does not open when it is not in the format', () => {
    const ring = createKeyRing({ current: key() });
    for (const bad of ['bk1.', 'bk1.zz.aa.bb', 'bk2.00000000.aa.bb', 'bk1.00000000.aa']) {
      expect([bad, failure(() => ring.decrypt(bad, 'e.f')).code]).toEqual([bad, 'DATA_DECRYPTION_FAILED']);
    }
  });

  it('SEC-08 two fields have two keys: the text of one cannot be moved to the other by anyone who has no key', () => {
    const ring = createKeyRing({ current: key() });
    const a = ring.encrypt('x', 'e.a');
    expect(a).not.toBe(ring.encrypt('x', 'e.b'));
  });
});

describe('SEC-08 the keys', () => {
  it('SEC-08 refuses a key of fewer than 32 bytes, and text that is not base64', () => {
    expect(failure(() => createKeyRing({ current: Buffer.alloc(16, 1).toString('base64') })).code).toBe(
      'DATA_ENCRYPTION_KEY_INVALID',
    );
    expect(failure(() => createKeyRing({ current: '***not base64***' })).code).toBe('DATA_ENCRYPTION_KEY_INVALID');
    expect(failure(() => createKeyRing({ current: key(), previous: ['short'] })).code).toBe(
      'DATA_ENCRYPTION_KEY_INVALID',
    );
  });

  it('SEC-08 names the key by a few characters of its hash, the same for the same key', () => {
    const material = key();
    const a = createKeyRing({ current: material });
    const b = createKeyRing({ current: material });
    expect(a.currentId).toMatch(/^[0-9a-f]{8}$/);
    expect(a.currentId).toBe(b.currentId);
    expect(createKeyRing({ current: key() }).currentId).not.toBe(a.currentId);
    expect(a.encrypt('x', 'e.f').split('.')[1]).toBe(a.currentId);
  });

  it('SEC-08 after a rotation the previous key opens what it made, and the new one makes what comes next', () => {
    const old = key();
    const fresh = key();
    const before = createKeyRing({ current: old }).encrypt('secret', 'e.f');
    const ring = createKeyRing({ current: fresh, previous: [old] });
    expect(ring.decrypt(before, 'e.f')).toBe('secret');
    expect(ring.isCurrent(before)).toBe(false);
    const after = ring.encrypt('secret', 'e.f');
    expect(ring.isCurrent(after)).toBe(true);
    expect(createKeyRing({ current: fresh }).decrypt(after, 'e.f')).toBe('secret');
  });

  it('SEC-08 does not open what a key that is no longer in the ring made, and names the id of the key', () => {
    const before = createKeyRing({ current: key() }).encrypt('secret', 'e.f');
    const error = failure(() => createKeyRing({ current: key() }).decrypt(before, 'e.f'));
    expect(error.code).toBe('DATA_DECRYPTION_FAILED');
    expect(error.message).toContain(before.split('.')[1] ?? 'missing');
  });

  it('SEC-08 a key of more than 32 bytes works, and a previous key that is the current one is no trouble', () => {
    const long = randomBytes(64).toString('base64');
    const ring = createKeyRing({ current: long, previous: [long] });
    expect(ring.decrypt(ring.encrypt('x', 'e.f'), 'e.f')).toBe('x');
  });
});
