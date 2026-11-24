/**
 * BieberKit
 *
 * @file        packages/create/src/kit/errors.ts
 * @description The errors of the CLI: a stable code, one line of cause, the fix and a link, and the exit code each kind ends the process with (section 5.3, AI-02).
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

import { BkError } from '@bieberkit/core';

/** `0` success, `1` failure, `2` the command was used wrongly, `3` a check found violations (section 5.3). */
export type ExitCode = 0 | 1 | 2 | 3;

/**
 * Where the page of a code lives. The documentation site comes with the docs milestone, so this is the one place to change when its
 * address is known.
 */
export const DOCS_BASE = 'https://bieberkit.dev/docs/errors';

export const docsLink = (code: string): string => `${DOCS_BASE}/${code}`;

export interface CliErrorOptions {
  readonly code: string;
  readonly fix: string;
  readonly exit?: ExitCode;
  readonly cause?: unknown;
}

/** An error of the CLI. Its code starts with `BK_`. A usage error ends the process with 2, and any other with 1. */
export class CliError extends BkError {
  readonly exit: ExitCode;

  constructor(message: string, options: CliErrorOptions) {
    super(message, {
      code: options.code,
      fix: options.fix,
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    });
    this.exit = options.exit ?? 1;
  }
}

/** The command was used wrongly: an unknown flag, a missing argument. Exit code 2. */
export function usageError(code: string, message: string, fix: string): CliError {
  return new CliError(message, { code, fix, exit: 2 });
}

const withProblems = (error: unknown): Pick<Failure, 'problems'> => {
  const problems = problemsOf(error);
  return problems === undefined ? {} : { problems };
};

/** What the person or the agent sees of a failure. */
export interface Failure {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
  readonly docs: string;
  readonly exit: ExitCode;
  /** Each problem, when the failure is a list of them (the env and the config report all of theirs together). */
  readonly problems?: readonly Readonly<Record<string, unknown>>[];
}

function problemsOf(error: unknown): readonly Readonly<Record<string, unknown>>[] | undefined {
  const found: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'problems') : undefined;
  if (!Array.isArray(found)) return undefined;
  const list = found.flatMap((item: unknown) =>
    typeof item === 'object' && item !== null ? [Object.fromEntries(Object.entries(item))] : [],
  );
  return list.length === 0 ? undefined : list;
}

/**
 * The failure to show for anything that was thrown. An error of the framework keeps its own code (`CFG_ENV_MISSING`, `PLG_CYCLE`), and
 * a bug of ours or of a plugin is `BK_UNEXPECTED`, with the message and no stack, because a stack is not for an agent to repair.
 */
export function failureOf(error: unknown): Failure {
  if (error instanceof CliError) {
    return { code: error.code, message: error.message, fix: error.fix, docs: docsLink(error.code), exit: error.exit };
  }
  if (error instanceof BkError) {
    return {
      code: error.code,
      message: error.message,
      fix: error.fix === '' ? 'See the page of the code.' : error.fix,
      docs: docsLink(error.code),
      exit: 1,
      ...withProblems(error),
    };
  }
  return {
    code: 'BK_UNEXPECTED',
    message: error instanceof Error ? error.message : String(error),
    fix: 'Run the command again with --verbose, and report it if it repeats.',
    docs: docsLink('BK_UNEXPECTED'),
    exit: 1,
  };
}
