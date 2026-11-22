/**
 * BieberKit
 *
 * @file        packages/data/src/schema/normalize.test.ts
 * @description Tests for the NFC step that runs before both validators (SCH-05).
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
import { normalizeInput } from './normalize.ts';

const NFD = 'ế';
const NFC = 'ế';

describe('SCH-05 normalizeInput', () => {
  it('turns a string into NFC', () => {
    expect(normalizeInput(NFD)).toBe(NFC);
  });

  it('turns every string of an object, an array and a nested value into NFC', () => {
    const input = { name: NFD, tags: [NFD, 'plain'], nested: { deep: { value: NFD } } };
    expect(normalizeInput(input)).toEqual({ name: NFC, tags: [NFC, 'plain'], nested: { deep: { value: NFC } } });
  });

  it('does not change the input, and returns a new value', () => {
    const input = { name: NFD, list: [NFD] };
    const output = normalizeInput(input);
    expect(input).toEqual({ name: NFD, list: [NFD] });
    expect(output).not.toBe(input);
  });

  it('leaves keys alone, because keys are names of the API and not user text', () => {
    expect(Object.keys(Object(normalizeInput({ [NFD]: 1 })))).toEqual([NFD]);
  });

  it.each([[null], [undefined], [42], [true], [10n], [Number.NaN]])('passes %s through', (value) => {
    expect(normalizeInput(value)).toBe(value);
  });

  it('passes through a Date and other class instances unchanged', () => {
    const date = new Date('2026-11-22T10:00:00Z');
    expect(normalizeInput({ at: date })).toEqual({ at: date });
    expect(Reflect.get(Object(normalizeInput({ at: date })), 'at')).toBe(date);
  });

  it('text that is already NFC is returned equal', () => {
    expect(normalizeInput({ a: 'Lê Đường 😀' })).toEqual({ a: 'Lê Đường 😀' });
  });

  it('refuses a cycle with DATA_INPUT_INVALID, instead of looping', () => {
    const loop: Record<string, unknown> = {};
    loop['self'] = loop;
    expect(() => normalizeInput(loop)).toThrowError(
      expect.objectContaining({ code: 'DATA_INPUT_INVALID', status: 400 }),
    );
  });

  it('refuses a value nested deeper than 64 levels', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 70; i++) deep = { next: deep };
    expect(() => normalizeInput(deep)).toThrow(DataError);
  });

  it('accepts a value nested 64 levels deep', () => {
    let deep: unknown = NFD;
    for (let i = 0; i < 63; i++) deep = { next: deep };
    expect(() => normalizeInput(deep)).not.toThrow();
  });
});
