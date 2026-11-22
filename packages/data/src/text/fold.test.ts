/**
 * BieberKit
 *
 * @file        packages/data/src/text/fold.test.ts
 * @description Tests for NFC, case and accent folding, and code point length (DATA-21, SCH-05, SCH-03).
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
import { codePointLength, fold, nfc } from './fold.ts';

// The fixture set measured in ADR 0008. `NFD_LE` is "Lê" typed as `e` plus a combining circumflex.
const NFD_LE = 'Lê';
const LE_GROUP = ['Lê', 'Le', 'LE', 'lê', 'LÊ', NFD_LE];
const DUONG_GROUP = ['đường', 'Đường', 'ĐƯỜNG', 'duong', 'DUONG'];

describe('SCH-05 nfc', () => {
  it('SCH-05 composes decomposed text', () => {
    expect(nfc('ê')).toBe('ê');
    expect(nfc(NFD_LE)).toBe('Lê');
    expect(nfc('ế')).toBe('ế');
  });

  it('SCH-05 leaves text that is already NFC unchanged', () => {
    for (const text of ['', 'Lê', 'đường', 'ASCII only', '日本語', '😀', 'ế']) expect(nfc(text)).toBe(text);
  });

  it('SCH-05 is idempotent', () => {
    expect(nfc(nfc(NFD_LE))).toBe(nfc(NFD_LE));
  });

  it('SCH-05 does not trim or collapse white space', () => {
    expect(nfc('  a  b \n')).toBe('  a  b \n');
  });
});

describe('DATA-21 fold exact', () => {
  it('DATA-21 exact is NFC and keeps case and accents', () => {
    expect(fold('exact', NFD_LE)).toBe('Lê');
    expect(fold('exact', 'LÊ')).toBe('LÊ');
    expect(fold('exact', 'Đường')).toBe('Đường');
  });
});

describe('DATA-21 fold ci', () => {
  it('DATA-21 ci lower-cases and keeps accents', () => {
    expect(fold('ci', 'LÊ')).toBe('lê');
    expect(fold('ci', 'Đường')).toBe('đường');
    expect(fold('ci', 'ĐƯỜNG')).toBe('đường');
  });

  it('DATA-21 ci treats NFC and NFD as the same text', () => {
    expect(fold('ci', NFD_LE)).toBe(fold('ci', 'Lê'));
  });

  it('DATA-21 ci keeps Le and Lê apart, and đ and d apart', () => {
    expect(fold('ci', 'Le')).not.toBe(fold('ci', 'Lê'));
    expect(fold('ci', 'đường')).not.toBe(fold('ci', 'duong'));
  });

  it('DATA-21 ci matches the measured groups', () => {
    const lê = new Set(['Lê', 'lê', 'LÊ', NFD_LE].map((text) => fold('ci', text)));
    expect([...lê]).toEqual(['lê']);
    expect(new Set(['Le', 'LE'].map((text) => fold('ci', text))).size).toBe(1);
    expect(fold('ci', 'LE01')).toBe(fold('ci', 'le01'));
  });
});

describe('DATA-21 fold ci_ai', () => {
  it('DATA-21 ci_ai removes accents and maps đ to d, so every Lê spelling gives le', () => {
    for (const text of LE_GROUP) expect(fold('ci_ai', text)).toBe('le');
  });

  it('DATA-21 ci_ai gives duong for every đường spelling', () => {
    for (const text of DUONG_GROUP) expect(fold('ci_ai', text)).toBe('duong');
  });

  it('DATA-21 ci_ai handles the Vietnamese tone and horn marks', () => {
    expect(fold('ci_ai', 'Nguyễn Văn Ơn')).toBe('nguyen van on');
    expect(fold('ci_ai', 'Trường Sơn Đông')).toBe('truong son dong');
    expect(fold('ci_ai', 'Phở bò Hà Nội')).toBe('pho bo ha noi');
  });

  it('DATA-21 ci_ai treats NFC and NFD as the same text', () => {
    expect(fold('ci_ai', 'ế')).toBe(fold('ci_ai', 'ế'));
  });

  it('DATA-21 ci_ai keeps letters that are not accented forms of Latin letters', () => {
    expect(fold('ci_ai', '日本語')).toBe('日本語');
    expect(fold('ci_ai', 'ß')).toBe('ß');
  });

  it('DATA-21 ci_ai keeps digits, punctuation and inner spaces', () => {
    expect(fold('ci_ai', 'Mã KH-01 / Đà Nẵng')).toBe('ma kh-01 / da nang');
  });

  it('DATA-21 the folded result is itself NFC, so a second fold changes nothing', () => {
    for (const mode of ['exact', 'ci', 'ci_ai'] as const) {
      for (const text of [...LE_GROUP, ...DUONG_GROUP]) {
        const once = fold(mode, text);
        expect(fold(mode, once)).toBe(once);
        expect(once).toBe(once.normalize('NFC'));
      }
    }
  });

  it('DATA-21 the empty string folds to the empty string', () => {
    for (const mode of ['exact', 'ci', 'ci_ai'] as const) expect(fold(mode, '')).toBe('');
  });
});

describe('SCH-03 codePointLength', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['Lê', 2],
    ['😀', 1],
    ['😀😀', 2],
    ['日本語', 3],
    ['👨‍👩‍👧', 5],
    ['\ud800', 1],
  ] as const)('SCH-03 %j has %d code points', (text, expected) => {
    expect(codePointLength(text)).toBe(expected);
  });

  it('SCH-03 counts a decomposed ế as 3 until it is normalized, then 1', () => {
    const decomposed = 'ế';
    expect(codePointLength(decomposed)).toBe(3);
    expect(codePointLength(nfc(decomposed))).toBe(1);
  });

  it('SCH-03 20 decomposed ế are 60 code points, which is why NFC runs before length checks', () => {
    expect(codePointLength('ế'.repeat(20))).toBe(60);
    expect(codePointLength(nfc('ế'.repeat(20)))).toBe(20);
  });
});
