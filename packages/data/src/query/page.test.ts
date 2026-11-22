/**
 * BieberKit
 *
 * @file        packages/data/src/query/page.test.ts
 * @description Tests for the page size limit and the opaque keyset cursor (DATA-06, DATA-11).
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
import { DataError } from '../errors.ts';
import { decodeCursor, DEFAULT_PAGE_SIZE, encodeCursor, MAX_PAGE_SIZE, pageSize } from './page.ts';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'NOT_A_BKERROR';
  }
  return undefined;
}

function failureOf(run: () => unknown): { message: string; fix: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof DataError) return { message: error.message, fix: error.fix };
    throw error;
  }
  throw new Error('Expected a DataError.');
}

describe('DATA-06 pageSize', () => {
  it('DATA-06 the maximum is 100 and the default is 25', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(DEFAULT_PAGE_SIZE).toBe(25);
  });

  it('DATA-06 a missing value gives the default, or the fallback that was passed', () => {
    for (const missing of [undefined, null, '']) expect(pageSize(missing)).toBe(25);
    expect(pageSize(undefined, 10)).toBe(10);
  });

  it.each([
    [1, 1],
    [50, 50],
    [100, 100],
    ['1', 1],
    ['100', 100],
    ['042', 42],
  ] as const)('DATA-06 %j is accepted as %d', (value, expected) => {
    expect(pageSize(value)).toBe(expected);
  });

  it.each([[101], [500], ['101'], ['99999999999999999999'], [Number.MAX_SAFE_INTEGER]])(
    'DATA-06 %j is clamped to 100',
    (value) => {
      expect(pageSize(value)).toBe(100);
    },
  );

  it.each([
    [0],
    [-1],
    [1.5],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    ['0'],
    ['-5'],
    ['1.5'],
    ['abc'],
    [' 5'],
    ['5 '],
    ['1e2'],
    [true],
    [{}],
    [[5]],
    [10n],
  ])('DATA-06 %s is DATA_PAGE_LIMIT', (value) => {
    expect(() => pageSize(value)).toThrowError(expect.objectContaining({ code: 'DATA_PAGE_LIMIT', status: 400 }));
  });

  it('DATA-06 a fallback above the maximum is clamped too, so a bad default cannot lift the limit', () => {
    expect(pageSize(undefined, 500)).toBe(100);
  });

  it('DATA-06 the error says what is allowed', () => {
    expect(() => pageSize('x')).toThrowError(expect.objectContaining({ fix: expect.stringContaining('1 to 100') }));
  });
});

describe('DATA-11 cursor round trip', () => {
  it.each([
    [['a']],
    [['2026-11-22T10:00:00.000Z', '0190f6b2-7c4e-7000-8000-000000000000']],
    [[42, 'x']],
    [[-1.5, 0, 1e21]],
    [[null, 'x']],
    [[true, false]],
    [[9223372036854775807n, 'tail']],
    [[-5n]],
    [['Lê Đường 😀', 'với "dấu" \\ và \n xuống dòng']],
    [['']],
  ] as const)('DATA-11 %s survives encode and decode', (position) => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('DATA-11 keeps a bigint a bigint and a number a number', () => {
    const [big, num] = decodeCursor(encodeCursor([12n, 12]));
    expect(typeof big).toBe('bigint');
    expect(typeof num).toBe('number');
  });

  it('DATA-11 is URL safe: only letters, digits, dash and underscore, no padding', () => {
    for (const position of [['a'], ['??>>'], ['ÿþ'], ['x'.repeat(200)]]) {
      expect(encodeCursor(position)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('DATA-11 is opaque: the same position always gives the same cursor, different positions differ', () => {
    expect(encodeCursor(['a', 1])).toBe(encodeCursor(['a', 1]));
    expect(encodeCursor(['a', 1])).not.toBe(encodeCursor(['a', 2]));
  });

  it('DATA-11 refuses to encode a value it cannot decode back', () => {
    for (const bad of [
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [undefined],
      [{}],
      [[1]],
      [Symbol('x')],
      [() => 1],
      [],
    ]) {
      // @ts-expect-error the type refuses these too, and the run time check backs it up
      expect(codeOf(() => encodeCursor(bad))).toBe('DATA_CURSOR_INVALID');
    }
  });

  it('DATA-11 refuses a position with more than 8 values', () => {
    expect(codeOf(() => encodeCursor(Array.from({ length: 9 }, (_, i) => i)))).toBe('DATA_CURSOR_INVALID');
    expect(codeOf(() => encodeCursor(Array.from({ length: 8 }, (_, i) => i)))).toBeUndefined();
  });

  it('DATA-11 refuses a cursor that would be longer than 1,024 characters', () => {
    expect(codeOf(() => encodeCursor(['x'.repeat(2000)]))).toBe('DATA_CURSOR_INVALID');
  });
});

const text = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('DATA-11 decodeCursor refuses what this server did not produce', () => {
  it.each([
    ['empty', ''],
    ['not base64url', 'not a cursor!'],
    ['padding', `${encodeCursor(['a'])}=`],
    ['standard base64 characters', '+/+/'],
    ['not JSON', Buffer.from('hello').toString('base64url')],
    ['JSON but not an object', text([1])],
    ['no version', text({ p: [1] })],
    ['a newer version', text({ v: 2, p: [1] })],
    ['no position', text({ v: 1 })],
    ['position not a list', text({ v: 1, p: 'x' })],
    ['empty position', text({ v: 1, p: [] })],
    ['a nested value', text({ v: 1, p: [{ a: 1 }] })],
    ['a nested list', text({ v: 1, p: [[1]] })],
    ['a bigint tag that is not digits', text({ v: 1, p: [{ b: '12x' }] })],
    ['a bigint tag with extra keys', text({ v: 1, p: [{ b: '12', c: 1 }] })],
    ['too many values', text({ v: 1, p: [1, 2, 3, 4, 5, 6, 7, 8, 9] })],
    ['extra keys', text({ v: 1, p: [1], x: 1 })],
    ['too long', 'A'.repeat(1025)],
  ] as const)('DATA-11 %s is DATA_CURSOR_INVALID', (_name, cursor) => {
    expect(() => decodeCursor(cursor)).toThrowError(
      expect.objectContaining({ code: 'DATA_CURSOR_INVALID', status: 400 }),
    );
  });

  it('DATA-11 a truncated cursor is refused', () => {
    const cursor = encodeCursor(['2026-11-22T10:00:00.000Z', '0190f6b2-7c4e-7000-8000-000000000000']);
    for (const cut of [1, 5, cursor.length - 1]) {
      expect(codeOf(() => decodeCursor(cursor.slice(0, cut)))).toBe('DATA_CURSOR_INVALID');
    }
  });

  it('DATA-11 the error tells the client to start from the first page and never echoes the cursor', () => {
    const error = failureOf(() => decodeCursor('secret-looking-garbage!'));
    expect(error.message).not.toContain('secret-looking-garbage');
    expect(error.fix).toContain('first page');
  });
});
