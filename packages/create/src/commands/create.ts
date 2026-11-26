/**
 * BieberKit
 *
 * @file        packages/create/src/commands/create.ts
 * @description create-bieberkit and bieberkit create: makes a project from the choices of the flags and the prompts (section 5.1, section 6).
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

import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Command } from '../kit/command.ts';
import { gitAuthor, resolveChoices } from '../scaffold/choices.ts';
import type { ChoiceDeps } from '../scaffold/choices.ts';
import { planProject } from '../scaffold/plan.ts';
import { realExec, scaffold } from '../scaffold/run.ts';
import type { Exec } from '../scaffold/run.ts';
import { BUILTIN_PLUGIN_INDEX, BUILTIN_TEMPLATES } from '../scaffold/templates.ts';
import type { PluginIndex, Template } from '../scaffold/templates.ts';

export interface CreateDeps {
  readonly templates?: Readonly<Record<string, Template>>;
  readonly index?: PluginIndex;
  readonly exec?: Exec;
  readonly gitUser?: ChoiceDeps['gitUser'];
  readonly random?: () => string;
  readonly now?: () => Date;
  readonly framework?: string;
}

function ownVersion(): string {
  const found: unknown = createRequire(import.meta.url)('create-bieberkit/package.json');
  const value = typeof found === 'object' && found !== null ? Reflect.get(found, 'version') : undefined;
  return typeof value === 'string' ? value : '0.0.0';
}

/** The command that makes a project. A test gives it its own templates, plugin index, `exec` and clock. */
export function createCommand(deps: CreateDeps = {}): Command {
  return {
    name: 'create',
    summary: 'Make a project: create-bieberkit <name> [flags].',
    positionals: [{ name: 'name', required: true }],
    flags: [
      { name: 'db', type: 'string', description: 'postgres, mysql or sqlite.' },
      { name: 'template', type: 'string', description: 'blank (cms, crm and saas come with their plugins).' },
      { name: 'plugins', type: 'string', description: 'Plugins on top of the template, separated by commas.' },
      { name: 'admin', type: 'boolean', description: 'Include the admin app (default).' },
      { name: 'site', type: 'boolean', description: 'Include the public site app.' },
      { name: 'author', type: 'string', description: '"Name <email>", for the headers. Defaults to git config.' },
      { name: 'license', type: 'string', description: 'An SPDX identifier, or UNLICENSED (default).' },
      { name: 'install', type: 'boolean', description: 'Run pnpm install (default).' },
      { name: 'git', type: 'boolean', description: 'Make a git repository and the first commit (default).' },
      { name: 'yes', type: 'boolean', description: 'Take the defaults, and never ask.' },
    ],
    async run(context) {
      const choices = await resolveChoices(context.args, {
        templates: deps.templates ?? BUILTIN_TEMPLATES,
        prompts: context.prompts,
        gitUser: deps.gitUser ?? gitAuthor,
      });
      const planned = planProject(choices, context.cwd, {
        index: deps.index ?? BUILTIN_PLUGIN_INDEX,
        framework: deps.framework ?? ownVersion(),
        year: (deps.now ?? (() => new Date()))().getFullYear(),
        random: deps.random ?? (() => randomBytes(32).toString('base64')),
      });
      context.log(`Making ${choices.project.name} in ${planned.target}`);
      const result = await scaffold(choices, planned, deps.exec ?? realExec);
      const failed = result.problems.length > 0;
      const next = [`cd ${choices.project.folder}`, ...(result.installed ? [] : ['pnpm install']), 'pnpm dev'];
      return {
        data: {
          root: result.root,
          name: choices.project.name,
          dialect: choices.dialect,
          template: choices.template.name,
          plugins: planned.plan.plugins.map((plugin) => plugin.name),
          files: result.files,
          installed: result.installed,
          git: result.git,
          problems: result.problems,
          notes: planned.notes,
          next,
        },
        text: [
          `Made ${choices.project.name}: ${result.files} files, ${choices.dialect}, template ${choices.template.name}.`,
          ...planned.notes,
          ...result.problems.map((problem) => `problem: ${problem}`),
          'Next:',
          ...next.map((line) => `  ${line}`),
          'The API will be at http://localhost:3000.',
        ].join('\n'),
        exit: failed ? 1 : 0,
      };
    },
  };
}
