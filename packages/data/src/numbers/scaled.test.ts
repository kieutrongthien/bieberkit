/**
 * BieberKit
 *
 * @file        packages/data/src/numbers/scaled.test.ts
 * @description Tests for money and decimals as scaled integers, without floating point (DATA-22, MOD-11).
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
import { assertSafeScaled, fromMinor, fromScaled, minorUnitOf, SAFE_MAX, toMinor, toScaled } from './scaled.ts';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'NOT_A_BKERROR';
  }
  return undefined;
}

describe('MOD-11 minorUnitOf', () => {
  it.each([
    ['VND', 0],
    ['JPY', 0],
    ['USD', 2],
    ['EUR', 2],
    ['CNY', 2],
    ['KWD', 3],
    ['BHD', 3],
  ] as const)('MOD-11 %s has %d decimals', (currency, digits) => {
    expect(minorUnitOf(currency)).toBe(digits);
  });

  it.each([[''], ['usd'], ['US'], ['USDD'], ['ABC'], ['XXX'], ['12A'], [' USD']])(
    'MOD-11 %j is DATA_CURRENCY_INVALID',
    (currency) => {
      expect(codeOf(() => minorUnitOf(currency))).toBe('DATA_CURRENCY_INVALID');
    },
  );
});

describe('DATA-22 toScaled', () => {
  it.each([
    ['12', 2, 1200n],
    ['12.3', 2, 1230n],
    ['12.30', 2, 1230n],
    ['12.34', 2, 1234n],
    ['0.01', 2, 1n],
    ['0', 2, 0n],
    ['-0', 2, 0n],
    ['+5.5', 1, 55n],
    ['-12.34', 2, -1234n],
    ['100', 0, 100n],
    ['0.1234', 4, 1234n],
  ] as const)('DATA-22 %j at scale %d gives %s', (text, scale, expected) => {
    expect(toScaled(text, scale)).toBe(expected);
  });

  it('DATA-22 a value with more digits than the safe range allows is DATA_MONEY_RANGE, not a rounded number', () => {
    expect(codeOf(() => toScaled('12345678901234.5678', 4))).toBe('DATA_MONEY_RANGE');
  });

  it('DATA-22 never goes through a float, so 0.1 + 0.2 style values are exact', () => {
    expect(toScaled('0.1', 2) + toScaled('0.2', 2)).toBe(toScaled('0.3', 2));
    expect(toScaled('1.005', 2)).toBe(101n);
    expect(toScaled('4.35', 2)).toBe(435n);
  });

  it.each([
    ['12.345', 2, 1235n],
    ['12.344', 2, 1234n],
    ['12.349', 2, 1235n],
    ['-12.345', 2, -1235n],
    ['-12.344', 2, -1234n],
    ['0.005', 2, 1n],
    ['0.004', 2, 0n],
    ['-0.005', 2, -1n],
    ['2.5', 0, 3n],
    ['-2.5', 0, -3n],
    ['2.4999', 0, 2n],
    ['99.995', 2, 10000n],
  ] as const)('MOD-11 rounds %j to scale %d half away from zero: %s', (text, scale, expected) => {
    expect(toScaled(text, scale)).toBe(expected);
  });

  it.each([
    [''],
    [' '],
    ['abc'],
    ['1,5'],
    ['1e3'],
    ['.5'],
    ['5.'],
    ['1.2.3'],
    [' 1'],
    ['1 '],
    ['--1'],
    ['+-1'],
    ['0x10'],
    ['١٢'],
    ['NaN'],
    ['Infinity'],
  ])('DATA-22 refuses %j with DATA_MONEY_INVALID', (text) => {
    expect(codeOf(() => toScaled(text, 2))).toBe('DATA_MONEY_INVALID');
  });

  it('DATA-22 refuses a scale that is not a whole number from 0 to 18', () => {
    for (const scale of [-1, 1.5, 19, Number.NaN])
      expect(codeOf(() => toScaled('1', scale))).toBe('DATA_SCALE_INVALID');
  });
});

describe('DATA-22 safe integer range', () => {
  it('DATA-22 SAFE_MAX is the largest integer a JavaScript number holds exactly', () => {
    expect(SAFE_MAX).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it('DATA-22 accepts the limit and refuses one more, in both directions', () => {
    expect(toScaled('9007199254740991', 0)).toBe(SAFE_MAX);
    expect(toScaled('-9007199254740991', 0)).toBe(-SAFE_MAX);
    expect(codeOf(() => toScaled('9007199254740992', 0))).toBe('DATA_MONEY_RANGE');
    expect(codeOf(() => toScaled('-9007199254740992', 0))).toBe('DATA_MONEY_RANGE');
  });

  it('DATA-22 the limit applies after scaling', () => {
    expect(toScaled('90071992547409.91', 2)).toBe(SAFE_MAX);
    expect(codeOf(() => toScaled('90071992547409.92', 2))).toBe('DATA_MONEY_RANGE');
  });

  it('DATA-22 a huge value is refused without a precision loss', () => {
    expect(codeOf(() => toScaled('9223372036854775807', 0))).toBe('DATA_MONEY_RANGE');
    expect(codeOf(() => toScaled('9'.repeat(400), 0))).toBe('DATA_MONEY_RANGE');
  });

  it('DATA-22 rounding up past the limit is refused', () => {
    expect(codeOf(() => toScaled('9007199254740990.5', 0))).toBeUndefined();
    expect(codeOf(() => toScaled('9007199254740991.5', 0))).toBe('DATA_MONEY_RANGE');
  });

  it('DATA-22 assertSafeScaled names the field in the message', () => {
    expect(() => assertSafeScaled(SAFE_MAX + 1n, 'total')).toThrowError(
      expect.objectContaining({ code: 'DATA_MONEY_RANGE', status: 400, message: expect.stringContaining('total') }),
    );
    expect(() => assertSafeScaled(SAFE_MAX, 'total')).not.toThrow();
    expect(() => assertSafeScaled(-SAFE_MAX - 1n, 'total')).toThrowError(
      expect.objectContaining({ code: 'DATA_MONEY_RANGE' }),
    );
  });

  it('DATA-22 the error says what the limit is', () => {
    expect(() => assertSafeScaled(SAFE_MAX + 1n, 'total')).toThrowError(
      expect.objectContaining({ fix: expect.stringContaining('9,007,199,254,740,991') }),
    );
  });
});

describe('DATA-22 fromScaled', () => {
  it.each([
    [1234n, 2, '12.34'],
    [1230n, 2, '12.30'],
    [5n, 2, '0.05'],
    [0n, 2, '0.00'],
    [-5n, 2, '-0.05'],
    [-1234n, 2, '-12.34'],
    [100n, 0, '100'],
    [1n, 4, '0.0001'],
    [SAFE_MAX, 2, '90071992547409.91'],
  ] as const)('DATA-22 %s at scale %d is %j', (value, scale, expected) => {
    expect(fromScaled(value, scale)).toBe(expected);
  });

  it('DATA-22 round-trips every value through text', () => {
    for (const text of ['0.00', '0.01', '12.30', '-99.99', '90071992547409.91', '-90071992547409.91']) {
      expect(fromScaled(toScaled(text, 2), 2)).toBe(text);
    }
  });

  it('DATA-22 refuses a value outside the safe range, so a corrupt row is not shown as a wrong number', () => {
    expect(codeOf(() => fromScaled(SAFE_MAX + 1n, 2))).toBe('DATA_MONEY_RANGE');
  });
});

describe('MOD-11 toMinor and fromMinor', () => {
  it('MOD-11 use the minor unit of the currency', () => {
    expect(toMinor('12.5', 'USD')).toBe(1250n);
    expect(toMinor('12500', 'VND')).toBe(12500n);
    expect(toMinor('1.234', 'KWD')).toBe(1234n);
    expect(fromMinor(1250n, 'USD')).toBe('12.50');
    expect(fromMinor(12500n, 'VND')).toBe('12500');
    expect(fromMinor(1234n, 'KWD')).toBe('1.234');
  });

  it('MOD-11 round once, to the minor unit of the currency', () => {
    expect(toMinor('1000.5', 'VND')).toBe(1001n);
    expect(toMinor('10.005', 'USD')).toBe(1001n);
    expect(toMinor('10.0005', 'KWD')).toBe(10001n);
  });

  it('MOD-11 an unknown currency is DATA_CURRENCY_INVALID', () => {
    expect(codeOf(() => toMinor('1', 'ABC'))).toBe('DATA_CURRENCY_INVALID');
    expect(codeOf(() => fromMinor(1n, 'usd'))).toBe('DATA_CURRENCY_INVALID');
  });
});
