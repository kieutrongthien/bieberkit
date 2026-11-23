/**
 * BieberKit
 *
 * @file        packages/data/src/orm/encrypted-type.ts
 * @description The MikroORM type of an encrypted field: ciphertext in the column, clear text for the code (SEC-08).
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

import { Type } from '@mikro-orm/core';
import { isEncrypted } from '../crypto/field-crypto.ts';
import { currentKeyRing } from './encryption.ts';

/**
 * One type for each encrypted field, made with its context (`entity.field`), which is authenticated with every value. The column is
 * text. A stored text that is not in the format is a value from before the field was encrypted: it is read as it is, and
 * `reencryptAll` encrypts it. MikroORM calls the methods of a type without its `this`, so the context is in the closure of a class
 * that is made for the field.
 */
export function encryptedType(context: string): Type<string | null, string | null> {
  class EncryptedType extends Type<string | null, string | null> {
    override getColumnType(): string {
      return 'text';
    }

    override convertToDatabaseValue(value: string | null | undefined): string | null {
      if (value === null || value === undefined) return null;
      return currentKeyRing().encrypt(value, context);
    }

    override convertToJSValue(value: string | null | undefined): string | null {
      if (value === null || value === undefined) return null;
      return isEncrypted(value) ? currentKeyRing().decrypt(value, context) : value;
    }

    /** The ciphertext is different each time, so a change is found by the clear text, not by what would be written. */
    override ensureComparable(): boolean {
      return false;
    }

    override compareAsType(): string {
      return 'string';
    }
  }
  return new EncryptedType();
}
