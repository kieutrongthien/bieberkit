/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/range.test.ts
 * @description Tests for the dependency-free version range matcher (PLG-08, ADR 0011).
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
import { PluginError } from './errors.ts';
import { satisfies } from './range.ts';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof PluginError ? error.code : 'NOT_A_PLUGIN_ERROR';
  }
  return undefined;
}

function errorOf(run: () => unknown): PluginError {
  try {
    run();
  } catch (error) {
    if (error instanceof PluginError) return error;
    throw error;
  }
  throw new Error('Expected a PluginError.');
}

describe('PLG-08 satisfies', () => {
  it.each([
    // exact
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    // caret: the leftmost non-zero part is fixed
    ['1.0.0', '^1.0.0', true],
    ['1.9.9', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.9.9', '^1.0.0', false],
    ['1.10.0', '^1.9.0', true],
    ['1.2.3', '^1.2.4', false],
    ['0.2.3', '^0.2.3', true],
    ['0.2.9', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['0.2.2', '^0.2.3', false],
    ['0.0.3', '^0.0.3', true],
    ['0.0.4', '^0.0.3', false],
    ['0.0.2', '^0.0.3', false],
    // tilde: the minor is fixed
    ['1.2.3', '~1.2.3', true],
    ['1.2.99', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['1.2.2', '~1.2.3', false],
    ['2.2.3', '~1.2.3', false],
    // at least
    ['1.2.3', '>=1.2.3', true],
    ['99.0.0', '>=1.2.3', true],
    ['1.2.2', '>=1.2.3', false],
    ['1.10.0', '>=1.9.0', true],
    // any
    ['0.0.1', '*', true],
    ['12.34.56', '*', true],
  ] as const)('PLG-08 %s against %s is %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it('PLG-08 compares numbers, not text', () => {
    expect(satisfies('1.10.0', '>=1.9.0')).toBe(true);
    expect(satisfies('10.0.0', '^9.0.0')).toBe(false);
  });
});

describe('PLG-08 rejected forms', () => {
  it.each([
    ['^1.2'],
    ['>1.0.0'],
    ['<2.0.0'],
    ['1.x'],
    ['1.0.0 || 2.0.0'],
    ['1.0.0-beta.1'],
    ['^1.0.0-rc.1'],
    [' ^1.0.0'],
    ['^1.0.0 '],
    ['>= 1.0.0'],
    ['1.0'],
    ['1'],
    [''],
    ['latest'],
    ['^'],
    ['v1.0.0'],
  ])('PLG-08 refuses the range %j with PLG_BAD_RANGE', (range) => {
    expect(codeOf(() => satisfies('1.0.0', range))).toBe('PLG_BAD_RANGE');
  });

  it.each([['1.0'], ['1'], ['1.0.0-beta.1'], ['v1.0.0'], [''], ['1.0.0.0'], ['a.b.c']])(
    'PLG-08 refuses the version %j with PLG_BAD_VERSION',
    (version) => {
      expect(codeOf(() => satisfies(version, '^1.0.0'))).toBe('PLG_BAD_VERSION');
    },
  );

  it('PLG-08 the message names the range and shows what is accepted', () => {
    const error = errorOf(() => satisfies('1.0.0', '^1.2'));
    expect(error.message).toContain('^1.2');
    expect(error.fix).toContain('^');
  });
});
