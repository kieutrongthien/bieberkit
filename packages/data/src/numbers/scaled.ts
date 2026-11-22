/**
 * BieberKit
 *
 * @file        packages/data/src/numbers/scaled.ts
 * @description Money and decimals as scaled bigint integers, parsed and formatted without floating point (DATA-22, MOD-11).
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

/** The largest magnitude a value may have: what a JavaScript number holds exactly, and what SQLite returns exactly (DATA-22). */
export const SAFE_MAX: bigint = BigInt(Number.MAX_SAFE_INTEGER);

const AMOUNT = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_SCALE = 18;

let knownCurrencies: ReadonlySet<string> | undefined;

/** Throws `DATA_MONEY_RANGE` when `value` is outside plus or minus 9,007,199,254,740,991. `label` names the field. */
export function assertSafeScaled(value: bigint, label: string): void {
  if (value > SAFE_MAX || value < -SAFE_MAX) {
    throw dataError(
      'DATA_MONEY_RANGE',
      400,
      `${label} is outside the allowed range.`,
      'Use an amount between -9,007,199,254,740,991 and 9,007,199,254,740,991 in the smallest unit.',
    );
  }
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
    throw dataError(
      'DATA_SCALE_INVALID',
      500,
      `Scale ${scale} is not a whole number from 0 to ${MAX_SCALE}.`,
      'Declare the field with a scale from 0 to 18.',
    );
  }
}

/** Decimal places of the currency's minor unit, from the runtime's ICU data: VND 0, USD 2, KWD 3. */
export function minorUnitOf(currency: string): number {
  knownCurrencies ??= new Set(Intl.supportedValuesOf('currency'));
  if (!CURRENCY.test(currency) || !knownCurrencies.has(currency)) {
    throw dataError(
      'DATA_CURRENCY_INVALID',
      400,
      `"${currency}" is not a currency code.`,
      'Use a three letter ISO 4217 code in upper case, for example VND.',
    );
  }
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Text to a scaled integer: `12.345` at scale 2 is `1235n`. The text is read digit by digit, so no float is involved,
 * and rounding happens once, half away from zero. A result outside the safe range is `DATA_MONEY_RANGE`.
 */
export function toScaled(value: string, scale: number): bigint {
  assertScale(scale);
  const match = AMOUNT.exec(value);
  if (match === null) {
    throw dataError(
      'DATA_MONEY_INVALID',
      400,
      `"${value}" is not an amount.`,
      'Write the amount as digits with an optional decimal point, for example 12.50.',
    );
  }
  const [, sign = '', whole = '0', fraction = ''] = match;
  const kept = fraction.slice(0, scale).padEnd(scale, '0');
  let magnitude = BigInt(`${whole}${kept}`);
  if ((fraction.charCodeAt(scale) || 48) >= 53) magnitude += 1n;
  const scaled = sign === '-' ? -magnitude : magnitude;
  assertSafeScaled(scaled, 'The amount');
  return scaled;
}

/** A scaled integer back to text with every decimal place: `1230n` at scale 2 is `12.30`. */
export function fromScaled(scaled: bigint, scale: number): string {
  assertScale(scale);
  assertSafeScaled(scaled, 'The stored amount');
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale === 0 ? '' : `.${fraction}`}`;
}

/** An amount in major units to minor units of `currency` (MOD-11). */
export function toMinor(amount: string, currency: string): bigint {
  return toScaled(amount, minorUnitOf(currency));
}

/** Minor units of `currency` to an amount in major units. */
export function fromMinor(minor: bigint, currency: string): string {
  return fromScaled(minor, minorUnitOf(currency));
}
