/**
 * BieberKit
 *
 * @file        packages/data/src/schema/patterns.ts
 * @description The patterns that both validators share, written once because Ajv and Zod disagree on their own formats (SCH-03).
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

const ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';

/**
 * An ASCII email address: dot separated atoms, then a domain of at least two labels that neither start nor end with a dash.
 * Ajv's `email` format accepts `a@b.c` and refuses `a@b-.co`, and Zod does the opposite, so both use this pattern (ADR 0009 follow-up).
 */
export const EMAIL_PATTERN: string = `^${ATOM}(?:\\.${ATOM})*@${LABEL}(?:\\.${LABEL})+$`;

/** An instant in UTC: seconds from 00 to 59 (Ajv accepts a leap second and Zod does not), and always a `Z`. */
export const UTC_INSTANT_PATTERN: string = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:[0-5]\\d(\\.\\d{1,9})?Z$';

/** Digits allowed before the decimal point for money, so the amount in minor units stays below 10^15 (DATA-22). */
export const MONEY_DIGITS: number = 15;

/** The text of a decimal with `precision` digits of which `scale` come after the point. */
export function decimalPattern(precision: number, scale: number): string {
  const whole = precision - scale;
  const integer = whole === 0 ? '0' : `\\d{1,${whole}}`;
  return `^-?${integer}${scale === 0 ? '' : `(\\.\\d{1,${scale}})?`}$`;
}
