/**
 * BieberKit
 *
 * @file        packages/core/src/roles/roles.test.ts
 * @description Tests for choosing the process role from argv (CORE-16, spec 7.1).
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
import { ConfigError } from '../errors/errors.ts';
import { parseRole, ROLES } from './roles.ts';

function codeOf(argv: readonly string[]): string | undefined {
  try {
    parseRole(argv);
  } catch (error) {
    return error instanceof ConfigError ? error.code : 'NOT_A_CONFIG_ERROR';
  }
  return undefined;
}

describe('CORE-16 parseRole', () => {
  it('CORE-16 the roles are web, worker, scheduler and migrate', () => {
    expect(ROLES).toEqual(['web', 'worker', 'scheduler', 'migrate']);
  });

  it.each(ROLES)('CORE-16 accepts %s as a positional argument', (role) => {
    expect(parseRole([role])).toBe(role);
  });

  it.each(ROLES)('CORE-16 accepts --role=%s', (role) => {
    expect(parseRole([`--role=${role}`])).toBe(role);
  });

  it('CORE-16 ignores other flags and later positionals', () => {
    expect(parseRole(['--verbose', 'worker', 'extra'])).toBe('worker');
  });

  it('CORE-16 the positional and the flag may both be given when they agree', () => {
    expect(parseRole(['web', '--role=web'])).toBe('web');
  });

  it('CORE-16 a positional and a flag that disagree are CFG_ROLE_INVALID', () => {
    expect(codeOf(['web', '--role=worker'])).toBe('CFG_ROLE_INVALID');
  });

  it('CORE-16 no role is CFG_ROLE_INVALID and lists the valid roles', () => {
    expect(codeOf([])).toBe('CFG_ROLE_INVALID');
    expect(() => parseRole([])).toThrowError(
      expect.objectContaining({ fix: expect.stringContaining('web, worker, scheduler, migrate') }),
    );
  });

  it.each([['api'], ['Web'], ['--role='], ['--role=cron']])('CORE-16 refuses %s', (value) => {
    expect(codeOf([value])).toBe('CFG_ROLE_INVALID');
  });

  it('CORE-16 the message names the value that was given', () => {
    expect(() => parseRole(['--role=cron'])).toThrowError(/cron/);
  });

  it('CORE-16 does not read process.argv', () => {
    expect(parseRole(['migrate'])).toBe('migrate');
  });
});
