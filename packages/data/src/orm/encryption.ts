/**
 * BieberKit
 *
 * @file        packages/data/src/orm/encryption.ts
 * @description The keys of encrypted fields that this process uses: set when the database starts, read when a value is written or read (SEC-08).
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

import { createKeyRing } from '../crypto/field-crypto.ts';
import type { EncryptionKeys, KeyRing } from '../crypto/field-crypto.ts';
import { dataError } from '../errors.ts';

export type { EncryptionKeys };

let ring: KeyRing | undefined;

/**
 * Sets the keys for encrypted fields (`undefined` takes them away). `createDatabase` calls it with `options.encryption`. A process has
 * one ring, because the type of a field is made before the database is, and so the last call wins. A bad key throws at once.
 */
export function useEncryptionKeys(keys: EncryptionKeys | undefined): void {
  ring = keys === undefined ? undefined : createKeyRing(keys);
}

/** The ring that is in use. It is an error to read or write an encrypted field with none. */
export function currentKeyRing(): KeyRing {
  if (ring === undefined) {
    throw dataError(
      'DATA_ENCRYPTION_KEY_MISSING',
      500,
      'A field is encrypted, and no key was given.',
      'Pass encryption: { current: APP_KEY } to createDatabase, and the previous key as previous after a rotation.',
    );
  }
  return ring;
}

/** Whether a ring is set. */
export const hasEncryptionKeys = (): boolean => ring !== undefined;
