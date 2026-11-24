/**
 * BieberKit
 *
 * @file        packages/cli/src/args.ts
 * @description Reads the arguments of a command: its name, its positional arguments and its flags, with the errors of a command that is used wrongly (section 5.3).
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

import { usageError } from './errors.ts';

export interface FlagDef {
  readonly name: string;
  readonly type: 'boolean' | 'string';
  readonly description: string;
  readonly short?: string;
}

export interface Positional {
  readonly name: string;
  readonly required?: boolean;
}

/** The flags that every command takes. */
export const GLOBAL_FLAGS: readonly FlagDef[] = [
  { name: 'json', type: 'boolean', description: 'Print one JSON document on stdout, and the logs on stderr.' },
  { name: 'cwd', type: 'string', description: 'Run as if started in this directory.' },
  { name: 'help', type: 'boolean', short: 'h', description: 'Show the help of the command.' },
  { name: 'version', type: 'boolean', short: 'v', description: 'Print the version.' },
];

export interface ParsedArgs {
  /** The command, or `undefined` when only flags were given. */
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

/** Splits the words that belong to the shell from the command: the command name is the first word that is not a flag. */
export function splitCommand(
  argv: readonly string[],
  known: (flag: string) => FlagDef | undefined,
): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? '';
    if (word === '--') return argv[i + 1];
    if (!word.startsWith('-')) return word;
    const flag = known(word.replace(/^--?/, '').split('=')[0] ?? '');
    // A flag that takes a value, written as `--cwd dir`, owns the next word.
    if (flag?.type === 'string' && !word.includes('=')) i += 1;
  }
  return undefined;
}

/**
 * Reads `argv` against the flags that the command takes besides the global ones. `--name=value` and `--name value` give a value, and
 * `--no-name` turns a boolean off. Anything that the command does not take is a usage error that says what to do.
 */
export function parseArgs(
  argv: readonly string[],
  flags: readonly FlagDef[],
  positionals: readonly Positional[] = [],
): ParsedArgs {
  const defs = new Map<string, FlagDef>();
  for (const flag of [...GLOBAL_FLAGS, ...flags]) defs.set(flag.name, flag);
  const shorts = new Map<string, FlagDef>();
  for (const flag of defs.values()) if (flag.short !== undefined) shorts.set(flag.short, flag);

  const given: Record<string, string | boolean> = {};
  const words: string[] = [];
  let command: string | undefined;
  let rest = false;
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? '';
    if (rest || !word.startsWith('-') || word === '-') {
      if (command === undefined) command = word;
      else words.push(word);
      continue;
    }
    if (word === '--') {
      rest = true;
      continue;
    }
    const [head = '', inline] = word.split(/=(.*)/s, 2);
    const long = head.startsWith('--');
    const bare = head.replace(/^--?/, '');
    const negated = long && bare.startsWith('no-') && defs.get(bare.slice(3))?.type === 'boolean';
    const flag = negated ? defs.get(bare.slice(3)) : long ? defs.get(bare) : shorts.get(bare);
    if (flag === undefined) {
      throw usageError(
        'BK_USAGE_UNKNOWN_FLAG',
        `${head} is not a flag of this command.`,
        'Run the command with --help to see its flags.',
      );
    }
    if (flag.type === 'boolean') {
      if (inline !== undefined && inline !== 'true' && inline !== 'false') {
        throw usageError(
          'BK_USAGE_FLAG_VALUE',
          `${head} takes no value.`,
          `Write ${head} alone, or --no-${flag.name}.`,
        );
      }
      given[flag.name] = negated ? false : inline !== 'false';
      continue;
    }
    const value = inline ?? argv[i + 1];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) {
      throw usageError('BK_USAGE_FLAG_VALUE', `${head} needs a value.`, `Write ${head}=<value> or ${head} <value>.`);
    }
    if (inline === undefined) i += 1;
    given[flag.name] = value;
  }

  const required = positionals.filter((entry) => entry.required === true);
  if (words.length < required.length) {
    throw usageError(
      'BK_USAGE_MISSING_ARGUMENT',
      `Missing ${required[words.length]?.name ?? 'an argument'}.`,
      `Give ${required.map((entry) => `<${entry.name}>`).join(' ')} after the command.`,
    );
  }
  if (words.length > positionals.length) {
    throw usageError(
      'BK_USAGE_UNEXPECTED_ARGUMENT',
      `Unexpected argument "${words[positionals.length]}".`,
      'Run the command with --help to see what it takes.',
    );
  }
  return { command, positionals: words, flags: given };
}
