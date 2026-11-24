/**
 * BieberKit
 *
 * @file        packages/create/src/kit/args.test.ts
 * @description Tests of the argument reader: the command, flags in both forms, negation, and every way to use a command wrongly (section 5.3).
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
import { parseArgs, splitCommand } from './args.ts';
import type { FlagDef } from './args.ts';
import { CliError } from './errors.ts';

const flags: FlagDef[] = [
  { name: 'write', type: 'boolean', description: 'w' },
  { name: 'db', type: 'string', description: 'd' },
];

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof CliError ? `${error.code}:${error.exit}` : String(error);
  }
  return undefined;
};

const known = (flag: string): FlagDef | undefined => flags.find((entry) => entry.name === flag);

describe('AI-03 reading the arguments', () => {
  it('AI-03 takes the command, its positionals and flags in any order', () => {
    const parsed = parseArgs(['make:job', 'send-mail', '--json', '--db', 'postgres'], flags, [
      { name: 'name', required: true },
    ]);
    expect(parsed).toEqual({ command: 'make:job', positionals: ['send-mail'], flags: { json: true, db: 'postgres' } });
    expect(parseArgs(['--json', 'plugins'], flags).command).toBe('plugins');
  });

  it('AI-03 takes a value after an equals sign or a space, and keeps an equals sign inside the value', () => {
    expect(parseArgs(['x', '--db=mysql'], flags).flags).toEqual({ db: 'mysql' });
    expect(parseArgs(['x', '--db=a=b'], flags).flags).toEqual({ db: 'a=b' });
  });

  it('AI-03 a boolean is on when named, and off with --no-name or =false', () => {
    expect(parseArgs(['x', '--write'], flags).flags).toEqual({ write: true });
    expect(parseArgs(['x', '--no-write'], flags).flags).toEqual({ write: false });
    expect(parseArgs(['x', '--write=false'], flags).flags).toEqual({ write: false });
  });

  it('AI-03 a short flag and the words after -- are what they say', () => {
    expect(parseArgs(['x', '-h'], flags).flags).toEqual({ help: true });
    expect(parseArgs(['x', '--', '--json'], flags, [{ name: 'a' }]).positionals).toEqual(['--json']);
  });

  it('AI-03 a command that is used wrongly is a usage error, exit code 2, with a code of its own', () => {
    expect(codeOf(() => parseArgs(['x', '--nope'], flags))).toBe('BK_USAGE_UNKNOWN_FLAG:2');
    expect(codeOf(() => parseArgs(['x', '--db'], flags))).toBe('BK_USAGE_FLAG_VALUE:2');
    expect(codeOf(() => parseArgs(['x', '--db', '--write'], flags))).toBe('BK_USAGE_FLAG_VALUE:2');
    expect(codeOf(() => parseArgs(['x', '--write=yes'], flags))).toBe('BK_USAGE_FLAG_VALUE:2');
    expect(codeOf(() => parseArgs(['x', 'extra'], flags))).toBe('BK_USAGE_UNEXPECTED_ARGUMENT:2');
    expect(codeOf(() => parseArgs(['x'], flags, [{ name: 'name', required: true }]))).toBe(
      'BK_USAGE_MISSING_ARGUMENT:2',
    );
  });

  it('AI-03 finds the command even when a flag with a value comes before it', () => {
    expect(splitCommand(['--db', 'postgres', 'create'], known)).toBe('create');
    expect(splitCommand(['--write', 'create'], known)).toBe('create');
    expect(splitCommand(['--db=postgres'], known)).toBeUndefined();
    expect(splitCommand(['--', 'create'], known)).toBe('create');
  });
});
