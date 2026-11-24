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
import { createCommand } from 'create-bieberkit';
import { createRunner } from 'create-bieberkit/kit';
import type { Command } from 'create-bieberkit/kit';
import { checkCommand } from './commands/check.ts';
import { envCheckCommand } from './commands/env-check.ts';
import { envExampleCommand } from './commands/env-example.ts';
import { clientGenerateCommand, generateCommand } from './commands/generate.ts';
import { makeEntityCommand, makeJobCommand, makeModuleCommand } from './commands/make.ts';
import { openapiCommand } from './commands/openapi.ts';
import { pluginsCommand } from './commands/plugins.ts';
import { routesCommand } from './commands/routes.ts';
import { dbSeedCommand, devCommand, doctorCommand, startCommand, testCommand } from './commands/runtime.ts';

export type { Io } from 'create-bieberkit/kit';

export const COMMANDS: readonly Command[] = [
  createCommand(),
  devCommand(),
  startCommand(),
  dbSeedCommand,
  doctorCommand,
  testCommand(),
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

/** Runs `bieberkit <command>` and answers the exit code (section 5.3). */
export const runCli: ReturnType<typeof createRunner> = createRunner({
  name: 'bieberkit',
  version: version(),
  commands: COMMANDS,
});
