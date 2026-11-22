/**
 * BieberKit
 *
 * @file        packages/data/src/orm/sequence.test.ts
 * @description Tests of the number patterns and the periods of sequences, which need no database (MOD-12).
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
import { formatSequence, periodOf } from './sequence.ts';

const NOW = new Date('2026-11-23T10:00:00Z');

describe('formatSequence', () => {
  it('MOD-12 fills the year, the month and the padded number', () => {
    expect(formatSequence('PO-{yyyy}-{seq:5}', 42, NOW)).toBe('PO-2026-00042');
    expect(formatSequence('{yy}{mm}/{seq:3}', 7, NOW)).toBe('2611/007');
    expect(formatSequence('CUS-{seq:5}', 1, NOW)).toBe('CUS-00001');
  });

  it('MOD-12 does not cut a number that is longer than its width', () => {
    expect(formatSequence('N{seq:2}', 12345, NOW)).toBe('N12345');
  });

  it('MOD-12 reads the date in UTC', () => {
    expect(formatSequence('{yyyy}-{mm}-{seq:1}', 1, new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-1');
    expect(formatSequence('{yyyy}-{mm}-{seq:1}', 1, new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-1');
  });

  it('MOD-12 refuses a pattern without exactly one number token', () => {
    expect(() => formatSequence('PO-{yyyy}', 1, NOW)).toThrow(/seq/);
  });
});

describe('periodOf', () => {
  it('MOD-12 is the year, the month or a dash', () => {
    expect(periodOf('year', NOW)).toBe('2026');
    expect(periodOf('month', NOW)).toBe('2026-11');
    expect(periodOf('never', NOW)).toBe('-');
    expect(periodOf(undefined, NOW)).toBe('-');
  });

  it('MOD-12 changes at midnight UTC of the first day', () => {
    expect(periodOf('year', new Date('2026-12-31T23:59:59Z'))).toBe('2026');
    expect(periodOf('year', new Date('2027-01-01T00:00:00Z'))).toBe('2027');
    expect(periodOf('month', new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });
});
