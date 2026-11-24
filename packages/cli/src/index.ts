/**
 * BieberKit
 *
 * @file        packages/cli/src/index.ts
 * @description Public API of bieberkit: the CLI as a function, so a test or another tool runs a command without a process (section 5).
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

/** npm name of this package. */
export const packageName = 'bieberkit';

export { runCli, COMMANDS } from './run.ts';
export type { Io } from './run.ts';
export type { Command, CommandContext, Outcome } from './command.ts';
export { CliError, docsLink, DOCS_BASE, failureOf, usageError } from './errors.ts';
export type { CliErrorOptions, ExitCode, Failure } from './errors.ts';
export { CONFIG_FILE, envOwnersOf, findProjectRoot, loadProject } from './project.ts';
export type { LoadedPlugin, Project } from './project.ts';
export { parseArgs, GLOBAL_FLAGS } from './args.ts';
export type { FlagDef, ParsedArgs, Positional } from './args.ts';
