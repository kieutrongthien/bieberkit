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
import {
  checkNames,
  checkPluginName,
  entityFile,
  jobFile,
  moduleFile,
  pluginFiles,
  register,
  writeNew,
} from '../make.ts';
import { findProjectRoot, loadConfig } from '../project.ts';
import { usageError } from '../errors.ts';
import { ADMIN_APP } from '../admin-app.ts';
import { versionsOf } from '../make-versions.ts';
import { realSpawn, supervise } from '../processes.ts';
import type { Spawn } from '../processes.ts';
import { wirePlugin } from '../wire-plugin.ts';

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

export interface MakePluginDeps {
  readonly spawn?: Spawn;
}

export function pluginMaker(deps: MakePluginDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  return {
    name: 'make:plugin',
    summary:
      'Make a plugin package with one entity and one page of the admin, and put it into the project: bieberkit make:plugin bieberkit-plugin-notes.',
    positionals: [{ name: 'name', required: true }],
    flags: [
      {
        name: 'dir',
        type: 'string',
        description: 'The folder of the package, from the project root. Defaults to plugins/<name>.',
      },
      {
        name: 'first-party',
        type: 'boolean',
        description: 'The plugin is one of the framework: @bieberkit/plugin-<name>.',
      },
      {
        name: 'author',
        type: 'string',
        description: 'The author of the files, "Name <email>". Defaults to the one of the project.',
      },
      {
        name: 'license',
        type: 'string',
        description: 'The license of the package. Defaults to the one of the project.',
      },
      { name: 'install', type: 'boolean', description: 'Run pnpm install (default). --no-install skips it.' },
    ],
    async run(context) {
      const flags = context.args.flags;
      const name = context.args.positionals[0] ?? '';
      const short = checkPluginName(name, flags['first-party'] === true);
      const project = await loadConfig(context.cwd).catch(() => undefined);
      const author = typeof flags['author'] === 'string' ? flags['author'] : project?.config.author;
      const license =
        typeof flags['license'] === 'string' ? flags['license'] : (project?.config.license ?? 'Apache-2.0');
      if (author === undefined) {
        throw usageError(
          'BK_MAKE_AUTHOR_MISSING',
          'There is no project here to take the author from.',
          'Pass --author "Name <email>", or run it inside a project.',
        );
      }
      const root = project?.root ?? findProjectRoot(context.cwd) ?? context.cwd;
      const dir = (typeof flags['dir'] === 'string' ? flags['dir'] : `plugins/${short}`).replace(/\/+$/, '');
      // An application has its server in apps/server, which the plugin is wired into. With no project the package is made on its own,
      // with its screens, and a project without apps/admin gets none.
      const application = project !== undefined && existsSync(join(root, 'apps/server/package.json'));
      const admin = project === undefined || existsSync(join(root, ADMIN_APP, 'package.json'));
      const files = pluginFiles({ name, short, dir, author, license, year: year(), admin, versions: versionsOf(root) });
      writeNew(root, files);
      const todo = application ? wirePlugin(root, { name, dir }) : [];
      let installed = false;
      if (application && todo.length === 0 && flags['install'] !== false) {
        context.log('pnpm install');
        installed = (await supervise(spawn('pnpm', ['install'], { cwd: root }))) === 0;
        if (!installed) todo.push('Run pnpm install in the project, and read its message: the one here failed.');
      }
      const next = application
        ? [
            ...(installed || todo.length > 0 ? [] : ['Run pnpm install.']),
            'Then: pnpm bieberkit migrate:make, pnpm bieberkit migrate, and pnpm dev.',
          ]
        : [`Next: add ${name} to the dependencies of a project, then bieberkit build in ${dir} to check the manifest.`];
      return {
        data: { plugin: name, dir, files: files.map((file) => file.path), todo },
        text: [
          ...files.map((file) => `Wrote ${file.path}`),
          ...(todo.length === 0 ? [] : ['Left for you to do:', ...todo.map((left) => `  - ${left}`)]),
          ...next,
        ].join('\n'),
      };
    },
  };
}

export const makePluginCommand: Command = pluginMaker();
