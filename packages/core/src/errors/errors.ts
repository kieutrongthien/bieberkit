/**
 * BieberKit
 *
 * @file        packages/core/src/errors/errors.ts
 * @description BkError and its subclasses: stable code, status, safe message and fix for every thrown error (MOD-17).
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

/** The part of an error that is safe to send to a client. */
export interface ErrorBody {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly fix: string;
}

export interface BkErrorOptions {
  /** Stable, upper snake case, prefixed by the owner, for example `CFG_ENV_MISSING`. */
  readonly code: string;
  /** HTTP status the error maps to. Defaults to 500. */
  readonly status?: number;
  /** Text that may reach a client. Defaults to the message. */
  readonly safeMessage?: string;
  /** What the reader should do about it. */
  readonly fix?: string;
  /** The error that caused this one. It stays in logs and never in `toJSON`. */
  readonly cause?: unknown;
}

/** Base class of every error BieberKit throws (MOD-17). */
export class BkError extends Error {
  readonly code: string;
  readonly status: number;
  readonly safeMessage: string;
  readonly fix: string;

  constructor(message: string, options: BkErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status ?? 500;
    this.safeMessage = options.safeMessage ?? message;
    this.fix = options.fix ?? '';
  }

  toJSON(): ErrorBody {
    return { code: this.code, status: this.status, message: this.safeMessage, fix: this.fix };
  }
}

/** A problem with configuration: environment, config file or role. Codes start with `CFG_`. */
export class ConfigError extends BkError {}

/** A problem with the service container. Codes start with `CORE_SERVICE_`. */
export class ContainerError extends BkError {}

/** One invalid or missing environment key. */
export interface EnvProblem {
  readonly key: string;
  readonly code: 'CFG_ENV_MISSING' | 'CFG_ENV_INVALID';
  readonly message: string;
  readonly fix: string;
}

/** Every problem found while reading the environment, reported together. */
export class EnvValidationError extends ConfigError {
  readonly problems: readonly EnvProblem[];

  constructor(problems: readonly EnvProblem[]) {
    const first = problems[0];
    super(problems.map((problem) => problem.message).join('\n'), {
      code: first?.code ?? 'CFG_ENV_INVALID',
      safeMessage: 'The server is not configured correctly.',
      fix: problems.map((problem) => problem.fix).join('\n'),
    });
    this.problems = problems;
  }
}

/** Returns a BkError unchanged and wraps anything else as `BK_UNKNOWN` (status 500). */
export function toBkError(value: unknown): BkError {
  if (value instanceof BkError) return value;
  return new BkError(value instanceof Error ? value.message : 'A non-error value was thrown.', {
    code: 'BK_UNKNOWN',
    safeMessage: 'An unexpected error occurred.',
    fix: 'Report the request id. The cause is in the logs.',
    cause: value,
  });
}
