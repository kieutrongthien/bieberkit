/**
 * BieberKit
 *
 * @file        packages/data/src/keys/uuid7.ts
 * @description UUIDv7 generator and the string and byte forms of UUIDs (DATA-03, DATA-14).
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

import { dataError } from '../errors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Uuid7Options {
  /** Milliseconds since the Unix epoch. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Fills the bytes with random values. Defaults to `crypto.getRandomValues`. Tests pass a fixed source. */
  readonly random?: (bytes: Uint8Array) => void;
}

/** Whether `value` is a UUID of any version, in any case. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function invalid(value: string): never {
  throw dataError(
    'DATA_UUID_INVALID',
    400,
    `"${value}" is not a UUID.`,
    'Send a UUID in the 36 character form, for example 0190f6b2-7c4e-7000-8000-000000000000.',
  );
}

/** 16 bytes of a UUID of any version. Throws `DATA_UUID_INVALID` for anything else. */
export function uuid7ToBytes(id: string): Uint8Array {
  if (!isUuid(id)) invalid(id);
  const hex = id.replaceAll('-', '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** The lower case 36 character form of 16 bytes. */
export function uuid7FromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) invalid(`${bytes.length} bytes`);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A generator with its own state. Ids are strictly increasing inside it (RFC 9562, section 6.2, method 1):
 * the 12 bits after the version count within one millisecond, a clock that goes backwards keeps the last timestamp,
 * and a counter that overflows moves to the next millisecond.
 */
export function createUuid7(options: Uuid7Options = {}): () => string {
  const now = options.now ?? Date.now;
  const random = options.random ?? ((bytes: Uint8Array) => void crypto.getRandomValues(bytes));
  const bytes = new Uint8Array(16);
  let lastMs = -1;
  let counter = 0;

  return () => {
    random(bytes);
    const clock = Math.floor(now());
    if (clock > lastMs) {
      lastMs = clock;
      // Start below 2048, so a full millisecond has room to count up.
      counter = (((bytes[6] ?? 0) & 0x07) << 8) | (bytes[7] ?? 0);
    } else {
      counter++;
      if (counter > 0xfff) {
        lastMs++;
        counter = (((bytes[6] ?? 0) & 0x07) << 8) | (bytes[7] ?? 0);
      }
    }
    const view = new DataView(bytes.buffer);
    view.setUint16(0, Math.floor(lastMs / 2 ** 32));
    view.setUint32(2, lastMs % 2 ** 32);
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
    return uuid7FromBytes(bytes);
  };
}

/** The default generator of the process. */
export const uuid7: () => string = createUuid7();
