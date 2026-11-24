/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/make.ts
 * @description bieberkit make:module, make:entity and make:job: new files from the official recipes, registered in their module (section 5.2).
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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES_DIR } from '../app.ts';
import type { Command } from '../command.ts';
import { CliError } from '../errors.ts';
import { checkNames, entityFile, jobFile, moduleFile, register, writeNew } from '../make.ts';
import { loadConfig } from '../project.ts';

const made = (files: readonly string[]): { data: unknown; text: string } => ({
  data: { files },
  text: files.map((file) => `Wrote ${file}`).join('\n'),
});

function needModule(root: string, module: string): void {
  if (!existsSync(join(root, MODULES_DIR, module, 'module.ts'))) {
    throw new CliError(`The module ${module} does not exist.`, {
      code: 'BK_MAKE_MODULE_MISSING',
      fix: `Run: bieberkit make:module ${module}`,
    });
  }
}

const year = (): number => new Date().getFullYear();

export const makeModuleCommand: Command = {
  name: 'make:module',
  summary: 'Make a module: apps/server/src/modules/<name>/module.ts.',
  positionals: [{ name: 'name', required: true }],
  async run(context) {
    const { root, config } = await loadConfig(context.cwd);
    const { module } = checkNames('module', context.args.positionals[0] ?? '');
    const file = moduleFile(config, module, year());
    writeNew(root, [file]);
    return made([file.path]);
  },
};

export const makeEntityCommand: Command = {
  name: 'make:entity',
  summary: 'Make an entity in a module and register it: bieberkit make:entity crm.Deal.',
  positionals: [{ name: 'module.Name', required: true }],
  flags: [{ name: 'tenant', type: 'boolean', description: 'The rows belong to a tenant (DATA-18).' }],
  async run(context) {
    const { root, config } = await loadConfig(context.cwd);
    const { module, name } = checkNames('entity', context.args.positionals[0] ?? '');
    needModule(root, module);
    const file = entityFile(config, module, name, context.args.flags['tenant'] === true, year());
    writeNew(root, [file]);
    const edited = register(root, module, 'entities', name, `./entities/${file.path.split('/').at(-1) ?? ''}`);
    return made([file.path, edited]);
  },
};

export const makeJobCommand: Command = {
  name: 'make:job',
  summary: 'Make a job in a module and register it: bieberkit make:job crm.send-welcome.',
  positionals: [{ name: 'module.name', required: true }],
  async run(context) {
    const { root, config } = await loadConfig(context.cwd);
    const { module, name } = checkNames('job', context.args.positionals[0] ?? '');
    needModule(root, module);
    const file = jobFile(config, module, name, year());
    writeNew(root, [file]);
    const constant = name.replaceAll(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());
    const edited = register(root, module, 'jobs', constant, `./jobs/${name}.ts`);
    return made([file.path, edited]);
  },
};
