/**
 * BieberKit
 *
 * @file        packages/data/src/orm/uuid7-type.ts
 * @description The MikroORM column type for UUID keys: native uuid, binary(16) or blob by platform, always a string in JavaScript (DATA-14).
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
import type { EntityProperty, Platform } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { isUuid, uuid7FromBytes, uuid7ToBytes } from '../keys/uuid7.ts';

type Storage = 'uuid' | 'binary(16)' | 'blob';

function storageOf(platform: Platform): Storage {
  // The platform classes live in three driver packages, and this module must not import all of them.
  const name = platform.constructor.name;
  if (name.includes('PostgreSql')) return 'uuid';
  if (name.includes('MySql') || name.includes('MariaDb')) return 'binary(16)';
  return 'blob';
}

function notUuid(value: unknown): never {
  throw dataError(
    'DATA_UUID_INVALID',
    400,
    `The value ${typeof value === 'string' ? `"${value}"` : `of type ${typeof value}`} is not a UUID.`,
    'Send a UUID in the 36 character form, for example 0190f6b2-7c4e-7000-8000-000000000000.',
  );
}

/** Text or bytes to the canonical lower case text. Throws `DATA_UUID_INVALID` for anything that is not a UUID. */
function canonical(value: unknown): string {
  if (typeof value === 'string') {
    if (!isUuid(value)) notUuid(value);
    return value.toLowerCase();
  }
  if (value instanceof Uint8Array) {
    if (value.length !== 16) notUuid(`${value.length} bytes`);
    return uuid7FromBytes(value);
  }
  return notUuid(value);
}

/**
 * UUID keys (DATA-03, DATA-14). Native `uuid` on PostgreSQL, `binary(16)` on MySQL and MariaDB, `blob` on SQLite,
 * and always a lower case string in JavaScript. It refuses a value that is not a UUID before the database sees it:
 * MySQL would otherwise store an empty binary value and fail later on a duplicate key (ADR 0012).
 */
export class Uuid7Type extends Type<string | null, string | Uint8Array | null> {
  override getColumnType(_prop: EntityProperty, platform: Platform): string {
    return storageOf(platform);
  }

  override convertToDatabaseValue(
    value: string | Uint8Array | null | undefined,
    platform: Platform,
  ): string | Uint8Array | null {
    if (value === null || value === undefined) return null;
    const text = canonical(value);
    return storageOf(platform) === 'uuid' ? text : Buffer.from(uuid7ToBytes(text));
  }

  override convertToJSValue(value: string | Uint8Array | null | undefined, _platform?: Platform): string | null {
    if (value === null || value === undefined) return null;
    return canonical(value);
  }

  override compareAsType(): string {
    return 'string';
  }

  override ensureComparable(): boolean {
    return false;
  }
}
