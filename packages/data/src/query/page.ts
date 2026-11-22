/**
 * BieberKit
 *
 * @file        packages/data/src/query/page.ts
 * @description Page size limit and the opaque keyset cursor for list queries (DATA-06, DATA-11).
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

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** One value of the sort position that a keyset cursor remembers. */
export type CursorValue = string | number | bigint | boolean | null;

const MAX_CURSOR_LENGTH = 1024;
const MAX_POSITION_LENGTH = 8;
const CURSOR_TEXT = /^[A-Za-z0-9_-]+$/;
const DIGITS = /^-?\d+$/;

const cap = (size: number): number => Math.min(size, MAX_PAGE_SIZE);

/**
 * The page size of a list request. A missing value gives `fallback`. A value above 100 is clamped to 100 (DATA-06).
 * Anything that is not a positive whole number is `DATA_PAGE_LIMIT`.
 */
export function pageSize(requested: unknown, fallback: number = DEFAULT_PAGE_SIZE): number {
  if (requested === undefined || requested === null || requested === '') return cap(fallback);
  const size =
    typeof requested === 'number'
      ? requested
      : typeof requested === 'string' && /^\d+$/.test(requested)
        ? Number(requested)
        : Number.NaN;
  if (!Number.isInteger(size) || size < 1) {
    throw dataError(
      'DATA_PAGE_LIMIT',
      400,
      'The page size must be a positive whole number.',
      `Send limit as a whole number from 1 to ${MAX_PAGE_SIZE}.`,
    );
  }
  return cap(size);
}

function badCursor(message: string, status: number): never {
  throw dataError('DATA_CURSOR_INVALID', status, message, 'Start again from the first page.');
}

function toJson(value: CursorValue): unknown {
  if (typeof value === 'bigint') return { b: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value))
    return badCursor('A cursor cannot hold a number that is not finite.', 500);
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  return badCursor('A cursor can hold text, numbers, booleans, null and bigint only.', 500);
}

/** The position after the last row of a page, as an opaque URL-safe text. It is a position, not a secret, and it is not signed. */
export function encodeCursor(position: readonly CursorValue[]): string {
  if (position.length < 1 || position.length > MAX_POSITION_LENGTH)
    badCursor(`A cursor holds 1 to ${MAX_POSITION_LENGTH} values.`, 500);
  const cursor = Buffer.from(JSON.stringify({ v: 1, p: position.map(toJson) })).toString('base64url');
  if (cursor.length > MAX_CURSOR_LENGTH) badCursor('The cursor would be too long.', 500);
  return cursor;
}

function fromJson(value: unknown): CursorValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    const tagged = 'b' in value ? value.b : undefined;
    if (keys.length === 1 && typeof tagged === 'string' && DIGITS.test(tagged)) return BigInt(tagged);
  }
  return badCursor('The cursor is not valid.', 400);
}

/** Reads a cursor that `encodeCursor` produced. Anything else is `DATA_CURSOR_INVALID`, and the message never repeats the input. */
export function decodeCursor(cursor: string): readonly CursorValue[] {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH || !CURSOR_TEXT.test(cursor))
    badCursor('The cursor is not valid.', 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return badCursor('The cursor is not valid.', 400);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return badCursor('The cursor is not valid.', 400);
  const keys = Object.keys(parsed);
  const position = 'p' in parsed ? parsed.p : undefined;
  if (keys.length !== 2 || !('v' in parsed) || parsed.v !== 1 || !Array.isArray(position))
    return badCursor('The cursor is not valid.', 400);
  if (position.length < 1 || position.length > MAX_POSITION_LENGTH) return badCursor('The cursor is not valid.', 400);
  const values = position.map(fromJson);
  // Only the exact text that `encodeCursor` writes is accepted, so odd spellings of the same position are refused.
  if (encodeCursor(values) !== cursor) return badCursor('The cursor is not valid.', 400);
  return values;
}
