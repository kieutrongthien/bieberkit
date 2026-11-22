/**
 * BieberKit
 *
 * @file        packages/data/src/text/fold.ts
 * @description Unicode NFC, case and accent folding for ci and ci_ai fields, and code point length (DATA-21, SCH-05, SCH-03).
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

/** How a text field is compared (DATA-21). */
export type Compare = 'exact' | 'ci' | 'ci_ai';

/** Unicode NFC, applied to every string input at the validation boundary (SCH-05). Nothing else changes. */
export function nfc(text: string): string {
  return text.normalize('NFC');
}

/**
 * The value stored in the shadow column of a compared field. `exact` is NFC only, `ci` adds lower case,
 * and `ci_ai` also removes combining marks and maps `đ` to `d`. Native collations are not used, because they
 * disagree across dialects (ADR 0008), so every dialect compares this text with plain equality.
 */
export function fold(mode: Compare, text: string): string {
  if (mode === 'exact') return nfc(text);
  if (mode === 'ci') return nfc(text.toLowerCase());
  return nfc(
    text
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toLowerCase()
      .replaceAll('đ', 'd'),
  );
}

/** Length in Unicode code points, the unit that both validators and the database limits use (SCH-03). */
export function codePointLength(text: string): number {
  let length = 0;
  for (const _ of text) length++;
  return length;
}
