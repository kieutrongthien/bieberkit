/**
 * BieberKit
 *
 * @file        packages/data/src/crypto/field-crypto.ts
 * @description The encryption of a field at rest: AES-256-GCM with a key for each field, made from the key of the application, in a format that names the key (SEC-08).
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

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { dataError } from '../errors.ts';

/** The keys of the application, in base64 as `APP_KEY` and `APP_KEY_PREVIOUS` have them. */
export interface EncryptionKeys {
  /** 32 or more random bytes. It encrypts everything that is written. */
  readonly current: string;
  /** The keys that were current before. They only decrypt, so a rotation loses nothing. */
  readonly previous?: readonly string[];
}

export interface KeyRing {
  /** The id of the current key: 8 hex characters of the SHA-256 of its bytes. */
  readonly currentId: string;
  /** `context` is the entity and the field, such as `crm.Customer.note`. It is authenticated with the text. */
  encrypt(plain: string, context: string): string;
  decrypt(value: string, context: string): string;
  /** Whether the value was made with the current key. */
  isCurrent(value: string): boolean;
}

const VERSION = 'bk1';
const ENCRYPTED = /^bk1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Whether a stored text is the value of an encrypted field, and not text that was written before the field was encrypted. */
export function isEncrypted(value: string): boolean {
  return ENCRYPTED.test(value);
}

function keyInvalid(why: string): never {
  throw dataError(
    'DATA_ENCRYPTION_KEY_INVALID',
    500,
    `An encryption key is not valid: ${why}.`,
    'Give a key of 32 or more random bytes in base64, such as the output of `openssl rand -base64 32`.',
  );
}

function bytesOf(key: string): Buffer {
  if (!BASE64.test(key)) return keyInvalid('it is not base64');
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length < 32) return keyInvalid(`it has ${bytes.length} bytes`);
  return bytes;
}

function decryptionFailed(why: string): never {
  throw dataError(
    'DATA_DECRYPTION_FAILED',
    500,
    `A stored value could not be decrypted: ${why}.`,
    'Check that APP_KEY (and APP_KEY_PREVIOUS after a rotation) are the keys that made the data.',
  );
}

function make(key: string): { id: string; bytes: Buffer } {
  const bytes = bytesOf(key);
  return { id: createHash('sha256').update(bytes).digest('hex').slice(0, 8), bytes };
}

/** Makes the ring of keys. The id of a key is the same on every start, so a value says which key made it. */
export function createKeyRing(keys: EncryptionKeys): KeyRing {
  const current = make(keys.current);
  const ring = new Map<string, Buffer>([[current.id, current.bytes]]);
  for (const key of keys.previous ?? []) {
    const old = make(key);
    if (!ring.has(old.id)) ring.set(old.id, old.bytes);
  }
  // One key for each field, so a value moved to another field does not open, and a leak of one field's key opens no other.
  const derived = new Map<string, Buffer>();
  const fieldKey = (id: string, context: string): Buffer => {
    const name = `${id}\u0000${context}`;
    let found = derived.get(name);
    if (found === undefined) {
      const material = ring.get(id);
      if (material === undefined) return decryptionFailed(`the key ${id} is not in the ring`);
      found = Buffer.from(hkdfSync('sha256', material, 'bieberkit', `bk:field:${context}:v1`, 32));
      derived.set(name, found);
    }
    return found;
  };

  return {
    currentId: current.id,
    encrypt(plain, context) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv('aes-256-gcm', fieldKey(current.id, context), nonce);
      cipher.setAAD(Buffer.from(context));
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      return `${VERSION}.${current.id}.${nonce.toString('base64url')}.${body.toString('base64url')}`;
    },
    decrypt(value, context) {
      if (!isEncrypted(value)) return decryptionFailed('it is not in the format of an encrypted field');
      const [, id = '', nonceText = '', bodyText = ''] = value.split('.');
      const nonce = Buffer.from(nonceText, 'base64url');
      const body = Buffer.from(bodyText, 'base64url');
      if (nonce.length !== NONCE_BYTES || body.length < TAG_BYTES)
        return decryptionFailed('it is not in the format of an encrypted field');
      try {
        const decipher = createDecipheriv('aes-256-gcm', fieldKey(id, context), nonce);
        decipher.setAAD(Buffer.from(context));
        decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
        return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString(
          'utf8',
        );
      } catch (error) {
        // A key that is not in the ring already said so. Anything else is a value that was changed, or is of another field.
        if (error instanceof Error && error.name === 'DataError') throw error;
        return decryptionFailed('it was changed, or it belongs to another field, or another key made it');
      }
    },
    isCurrent: (value) => value.startsWith(`${VERSION}.${current.id}.`),
  };
}
