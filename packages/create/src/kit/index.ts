/**
 * BieberKit
 *
 * @file        packages/create/src/kit/index.ts
 * @description The kit that every command line of the framework is built on: arguments, failures with stable codes, the shape of a command, and the runner with --json and the exit codes (section 5.3).
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

export { GLOBAL_FLAGS, parseArgs, splitCommand } from './args.ts';
export type { FlagDef, ParsedArgs, Positional } from './args.ts';
export type { Ask, Command, CommandContext, Outcome } from './command.ts';
export { CliError, DOCS_BASE, docsLink, failureOf, usageError } from './errors.ts';
export type { CliErrorOptions, ExitCode, Failure } from './errors.ts';
export { createRunner } from './run.ts';
export type { Io, RunnerOptions } from './run.ts';
