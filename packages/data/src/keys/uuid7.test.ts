/**
 * BieberKit
 *
 * @file        packages/data/src/keys/uuid7.test.ts
 * @description Tests for the UUIDv7 generator and the string and byte forms (DATA-03, DATA-14).
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
import { createUuid7, isUuid, uuid7, uuid7FromBytes, uuid7ToBytes } from './uuid7.ts';

const SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOW = 1_700_000_000_123;

/** A fixed byte source, so a test can predict every bit. */
function fixedRandom(value: number): (bytes: Uint8Array) => void {
  return (bytes) => bytes.fill(value);
}

function timestampOf(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}

describe('DATA-03 uuid7 format', () => {
  it('DATA-03 has version 7, variant 10 and 36 lower case characters', () => {
    for (let i = 0; i < 200; i++) expect(uuid7()).toMatch(SHAPE);
  });

  it('DATA-03 the first 48 bits are the Unix time in milliseconds', () => {
    const next = createUuid7({ now: () => NOW });
    expect(timestampOf(next())).toBe(NOW);
  });

  it('DATA-03 the default generator uses the real clock', () => {
    const before = Date.now();
    const stamp = timestampOf(uuid7());
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('DATA-03 takes the random part from the injected source and masks the version and variant bits', () => {
    const next = createUuid7({ now: () => NOW, random: fixedRandom(0xff) });
    const id = next();
    expect(id).toMatch(SHAPE);
    expect(id.endsWith('bfff-ffffffffffff')).toBe(true);
  });
});

describe('DATA-03 uuid7 ordering', () => {
  it('DATA-03 ids are strictly increasing when the clock does not move', () => {
    const next = createUuid7({ now: () => NOW });
    const ids = Array.from({ length: 10_000 }, () => next());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.toSorted());
  });

  it('DATA-03 more than 4096 ids in one millisecond carry into the next millisecond, never backwards', () => {
    const next = createUuid7({ now: () => NOW });
    const stamps = Array.from({ length: 10_000 }, () => timestampOf(next()));
    expect(stamps[0]).toBe(NOW);
    expect(stamps.at(-1)).toBeGreaterThan(NOW);
    expect(stamps).toEqual(stamps.toSorted((a, b) => a - b));
  });

  it('DATA-03 a clock that goes backwards keeps the last timestamp and still increases', () => {
    let clock = NOW;
    const next = createUuid7({ now: () => clock });
    const first = next();
    clock = NOW - 5_000;
    const second = next();
    expect(timestampOf(second)).toBe(NOW);
    expect(second > first).toBe(true);
  });

  it('DATA-03 a clock that moves forward starts a fresh millisecond', () => {
    let clock = NOW;
    const next = createUuid7({ now: () => clock });
    next();
    clock = NOW + 10;
    expect(timestampOf(next())).toBe(NOW + 10);
  });

  it('DATA-03 100,000 ids from the default generator are unique and sort in creation order', () => {
    const ids = Array.from({ length: 100_000 }, () => uuid7());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.toSorted());
  });

  it('DATA-03 two generators do not share state', () => {
    const a = createUuid7({ now: () => NOW });
    const b = createUuid7({ now: () => NOW });
    for (let i = 0; i < 50; i++) a();
    expect(timestampOf(b())).toBe(NOW);
  });
});

describe('DATA-14 string and byte forms', () => {
  it('DATA-14 round-trips between the 36 character form and 16 bytes', () => {
    const id = uuid7();
    const bytes = uuid7ToBytes(id);
    expect(bytes).toHaveLength(16);
    expect(uuid7FromBytes(bytes)).toBe(id);
  });

  it('DATA-14 puts the version and variant in the right bytes', () => {
    const bytes = uuid7ToBytes(uuid7());
    expect((bytes[6] ?? 0) >> 4).toBe(7);
    expect((bytes[8] ?? 0) >> 6).toBe(0b10);
  });

  it('DATA-14 reads upper case and writes lower case', () => {
    const id = uuid7();
    expect(uuid7FromBytes(uuid7ToBytes(id.toUpperCase()))).toBe(id);
  });

  it.each([
    [''],
    ['not-a-uuid'],
    ['0190f6b2-7c4e-7000-8000-00000000000'],
    ['0190f6b2-7c4e-7000-8000-0000000000000'],
    ['0190f6b27c4e70008000000000000000'],
  ])('DATA-14 uuid7ToBytes refuses %j with DATA_UUID_INVALID', (text) => {
    expect(() => uuid7ToBytes(text)).toThrowError(expect.objectContaining({ code: 'DATA_UUID_INVALID', status: 400 }));
  });

  it('DATA-14 uuid7FromBytes refuses a length other than 16', () => {
    expect(() => uuid7FromBytes(new Uint8Array(15))).toThrowError(
      expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
    );
    expect(() => uuid7FromBytes(new Uint8Array(17))).toThrowError(
      expect.objectContaining({ code: 'DATA_UUID_INVALID' }),
    );
  });

  it('DATA-14 the error explains the fix', () => {
    expect(() => uuid7ToBytes('x')).toThrowError(expect.objectContaining({ fix: expect.stringContaining('UUID') }));
  });
});

describe('DATA-14 isUuid', () => {
  it.each([
    ['0190f6b2-7c4e-7000-8000-000000000000', true],
    ['0190F6B2-7C4E-7000-8000-000000000000', true],
    ['550e8400-e29b-41d4-a716-446655440000', true],
    ['00000000-0000-0000-0000-000000000000', true],
    ['0190f6b2-7c4e-7000-8000-00000000000g', false],
    ['0190f6b2-7c4e-7000-8000', false],
    ['', false],
    [' 0190f6b2-7c4e-7000-8000-000000000000', false],
    [42, false],
    [null, false],
    [undefined, false],
    [{}, false],
  ] as const)('DATA-14 isUuid(%j) is %s', (value, expected) => {
    expect(isUuid(value)).toBe(expected);
  });
});
