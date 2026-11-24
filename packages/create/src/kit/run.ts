/**
 * BieberKit
 *
 * @file        packages/create/src/kit/run.ts
 * @description Runs a set of commands: finds the command, reads its arguments, runs it, and answers in the shape of --json or for a person, with the exit code of section 5.3.
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

import { resolve } from 'node:path';
import type { EnvSource } from '@bieberkit/core';
import { GLOBAL_FLAGS, parseArgs, splitCommand } from './args.ts';
import type { FlagDef } from './args.ts';
import type { Ask, Command } from './command.ts';
import { failureOf, usageError } from './errors.ts';
import type { ExitCode, Failure } from './errors.ts';

/** Where a run reads and writes. A test gives its own, and `bin.ts` gives the real ones. */
export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly cwd: string;
  /** The variables that the command reads. Without it the command reads the real environment (P8: only core does). */
  readonly env?: EnvSource;
  /** Set when a person is at the terminal. A command asks through it, and without it never prompts. */
  readonly ask?: Ask;
}

export interface RunnerOptions {
  /** The name of the program, as it is typed: `bieberkit` or `create-bieberkit`. */
  readonly name: string;
  readonly version: string;
  readonly commands: readonly Command[];
  /** A program that does one thing runs this command whatever it is given first: `create-bieberkit <name>`. */
  readonly single?: string;
}

/** The number of edits that turn `a` into `b`. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_unused, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1)
      next[j] = Math.min(
        (row[j] ?? 0) + 1,
        (next[j - 1] ?? 0) + 1,
        (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length] ?? 0;
}

/** The closest command to a word that is not one, when it is near enough to be a typo. */
function suggestion(commands: readonly Command[], word: string): string | undefined {
  const best = commands
    .map((command) => ({ name: command.name, distance: distance(word, command.name) }))
    .toSorted((a, b) => a.distance - b.distance)[0];
  return best !== undefined && best.distance <= 2 ? best.name : undefined;
}

const flagLine = (flag: FlagDef): string =>
  `  --${flag.name}${flag.short === undefined ? '' : `, -${flag.short}`}${flag.type === 'string' ? ' <value>' : ''}  ${flag.description}`;

function helpOf(options: RunnerOptions, command: Command | undefined): string {
  const usage = (name: string): string => (options.single === undefined ? `${options.name} ${name}` : options.name);
  if (command === undefined) {
    const width = Math.max(...options.commands.map((entry) => entry.name.length));
    return [
      `${options.name} ${options.version}`,
      '',
      `Usage: ${options.name} <command> [flags]`,
      '',
      'Commands:',
      ...options.commands.map((entry) => `  ${entry.name.padEnd(width)}  ${entry.summary}`),
      '',
      'Flags of every command:',
      ...GLOBAL_FLAGS.map(flagLine),
      '',
      'Exit codes: 0 success, 1 failure, 2 the command was used wrongly, 3 a check found violations.',
    ].join('\n');
  }
  const positionals = (command.positionals ?? []).map((entry) =>
    entry.required === true ? `<${entry.name}>` : `[${entry.name}]`,
  );
  return [
    `Usage: ${[usage(command.name), ...positionals].join(' ')} [flags]`,
    '',
    command.summary,
    '',
    'Flags:',
    ...[...(command.flags ?? []), ...GLOBAL_FLAGS].map(flagLine),
  ].join('\n');
}

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function failureText(failure: Failure): string {
  const problems = (failure.problems ?? []).map(
    (problem) => `  - ${textOf(problem['key']) || textOf(problem['code'])}: ${textOf(problem['message'])}`,
  );
  return [
    `error[${failure.code}]: ${failure.message.split('\n')[0] ?? ''}`,
    ...problems,
    `  fix: ${failure.fix.split('\n').join('\n       ')}`,
    `  docs: ${failure.docs}`,
  ].join('\n');
}

/**
 * A function that runs `<name> <command>` and answers the exit code. A person gets text, and `--json` gets one document on stdout:
 * `{ ok, command, data }` or `{ ok: false, command, error }`. Progress and logs go to stderr, so stdout can always be read by a
 * machine (section 5.3).
 */
export function createRunner(options: RunnerOptions): (argv: readonly string[], io: Io) => Promise<ExitCode> {
  return async (given, io) => {
    // A program with a single command, as create-bieberkit is, takes its arguments without the name of the command.
    const argv =
      options.single === undefined || given.includes('--help') || given.includes('-h') || given.includes('--version')
        ? given
        : [options.single, ...given];
    const json = argv.includes('--json');
    const name = splitCommand(argv, (flag) =>
      GLOBAL_FLAGS.find((entry) => entry.name === flag || entry.short === flag),
    );
    const command = options.commands.find(
      (entry) => entry.name === (options.single !== undefined && name === undefined ? options.single : name),
    );
    const answer = (document: Record<string, unknown>, text: string, stream: 'stdout' | 'stderr'): void => {
      if (json) io.stdout(`${JSON.stringify(document)}\n`);
      else io[stream](`${text}\n`);
    };
    const fail = (error: unknown): ExitCode => {
      const failure = failureOf(error);
      answer({ ok: false, command: name ?? null, error: failure }, failureText(failure), 'stderr');
      return failure.exit;
    };
    try {
      if (name !== undefined && command === undefined) {
        const near = suggestion(options.commands, name);
        throw usageError(
          'BK_USAGE_UNKNOWN_COMMAND',
          `"${name}" is not a command.`,
          near === undefined
            ? `Run ${options.name} --help to see the commands.`
            : `Did you mean ${near}? Run ${options.name} --help to see the commands.`,
        );
      }
      const args = parseArgs(argv, command?.flags ?? [], command?.positionals ?? []);
      if (args.flags['version'] === true) {
        answer({ ok: true, command: 'version', data: { version: options.version } }, options.version, 'stdout');
        return 0;
      }
      if (command === undefined || args.flags['help'] === true) {
        const help = helpOf(options, command);
        answer({ ok: true, command: command?.name ?? 'help', data: { help } }, help, 'stdout');
        return 0;
      }
      const cwd = typeof args.flags['cwd'] === 'string' ? resolve(io.cwd, args.flags['cwd']) : io.cwd;
      const outcome = await command.run({
        cwd,
        ...(io.env === undefined ? {} : { env: io.env }),
        ...(io.ask === undefined || args.flags['yes'] === true || json ? {} : { ask: io.ask }),
        args,
        json,
        log: (line) => io.stderr(`${line}\n`),
      });
      const exit = outcome.exit ?? 0;
      answer({ ok: exit === 0, command: command.name, data: outcome.data }, outcome.text, 'stdout');
      return exit;
    } catch (error) {
      return fail(error);
    }
  };
}
