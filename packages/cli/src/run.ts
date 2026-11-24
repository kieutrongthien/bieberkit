/**
 * BieberKit
 *
 * @file        packages/cli/src/run.ts
 * @description Runs the CLI: finds the command, reads its arguments, runs it, and answers in the shape of --json or for a person, with the exit code of section 5.3.
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

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { EnvSource } from '@bieberkit/core';
import { GLOBAL_FLAGS, parseArgs, splitCommand } from './args.ts';
import type { FlagDef } from './args.ts';
import type { Command } from './command.ts';
import { checkCommand } from './commands/check.ts';
import { envCheckCommand } from './commands/env-check.ts';
import { envExampleCommand } from './commands/env-example.ts';
import { clientGenerateCommand, generateCommand } from './commands/generate.ts';
import { makeEntityCommand, makeJobCommand, makeModuleCommand } from './commands/make.ts';
import { openapiCommand } from './commands/openapi.ts';
import { pluginsCommand } from './commands/plugins.ts';
import { routesCommand } from './commands/routes.ts';
import { failureOf, usageError } from './errors.ts';
import type { ExitCode, Failure } from './errors.ts';

/** Where a run reads and writes. A test gives its own, and `bin.ts` gives the real ones. */
export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly cwd: string;
  /** The variables that the command reads. Without it the command reads the real environment (P8: only core does). */
  readonly env?: EnvSource;
}

export const COMMANDS: readonly Command[] = [
  checkCommand,
  generateCommand,
  clientGenerateCommand,
  openapiCommand,
  routesCommand,
  makeModuleCommand,
  makeEntityCommand,
  makeJobCommand,
  pluginsCommand,
  envCheckCommand,
  envExampleCommand,
];

function version(): string {
  const found: unknown = createRequire(import.meta.url)('../package.json');
  const value = typeof found === 'object' && found !== null ? Reflect.get(found, 'version') : undefined;
  return typeof value === 'string' ? value : '0.0.0';
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
function suggestion(word: string): string | undefined {
  const best = COMMANDS.map((command) => ({ name: command.name, distance: distance(word, command.name) })).toSorted(
    (a, b) => a.distance - b.distance,
  )[0];
  return best !== undefined && best.distance <= 2 ? best.name : undefined;
}

const flagLine = (flag: FlagDef): string =>
  `  --${flag.name}${flag.short === undefined ? '' : `, -${flag.short}`}${flag.type === 'string' ? ' <value>' : ''}  ${flag.description}`;

function helpOf(command: Command | undefined): string {
  if (command === undefined) {
    const width = Math.max(...COMMANDS.map((entry) => entry.name.length));
    return [
      `bieberkit ${version()}`,
      '',
      'Usage: bieberkit <command> [flags]',
      '',
      'Commands:',
      ...COMMANDS.map((entry) => `  ${entry.name.padEnd(width)}  ${entry.summary}`),
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
    `Usage: bieberkit ${[command.name, ...positionals].join(' ')} [flags]`,
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
 * Runs `bieberkit <command>` and answers the exit code. A person gets text, and `--json` gets one document on stdout: `{ ok, command,
 * data }` or `{ ok: false, command, error }`. Progress and logs go to stderr, so stdout can always be read by a machine (section 5.3).
 */
export async function runCli(argv: readonly string[], io: Io): Promise<ExitCode> {
  const json = argv.includes('--json');
  const name = splitCommand(argv, (flag) => GLOBAL_FLAGS.find((entry) => entry.name === flag || entry.short === flag));
  const command = COMMANDS.find((entry) => entry.name === name);
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
      const near = suggestion(name);
      throw usageError(
        'BK_USAGE_UNKNOWN_COMMAND',
        `"${name}" is not a command.`,
        near === undefined
          ? 'Run bieberkit --help to see the commands.'
          : `Did you mean ${near}? Run bieberkit --help to see the commands.`,
      );
    }
    const args = parseArgs(argv, command?.flags ?? [], command?.positionals ?? []);
    if (args.flags['version'] === true) {
      answer({ ok: true, command: 'version', data: { version: version() } }, version(), 'stdout');
      return 0;
    }
    if (command === undefined || args.flags['help'] === true) {
      const help = helpOf(command);
      answer({ ok: true, command: command?.name ?? 'help', data: { help } }, help, 'stdout');
      return 0;
    }
    const cwd = typeof args.flags['cwd'] === 'string' ? resolve(io.cwd, args.flags['cwd']) : io.cwd;
    const outcome = await command.run({
      cwd,
      ...(io.env === undefined ? {} : { env: io.env }),
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
}
