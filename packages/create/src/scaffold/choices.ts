/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/choices.ts
 * @description Turns the flags of create-bieberkit into the choices of a project: a flag wins, then the person is asked, then --yes gives the default, and otherwise the command says which flag is missing (section 5.1, section 6).
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

import { execFileSync } from 'node:child_process';
import type { Dialect } from '@bieberkit/core';
import { CliError, usageError } from '../kit/errors.ts';
import { cancelled } from '../kit/cancelled.ts';
import type { PromptOption, Prompts } from '../kit/command.ts';
import type { ParsedArgs } from '../kit/args.ts';
import { checkProjectName } from './names.ts';
import { targetProblem } from './plan.ts';
import type { ProjectName } from './names.ts';
import { SPDX_ID } from './licenses.ts';
import { DIALECT_NAMES } from './templates.ts';
import type { PluginIndex, Template } from './templates.ts';

export interface Choices {
  readonly project: ProjectName;
  readonly dialect: Dialect;
  readonly template: Template;
  readonly extraPlugins: readonly string[];
  readonly admin: boolean;
  readonly site: boolean;
  readonly author: string;
  readonly license: string;
  readonly install: boolean;
  readonly git: boolean;
}

export interface ChoiceDeps {
  readonly templates: Readonly<Record<string, Template>>;
  readonly prompts: Prompts | undefined;
  /** Where the project folder is made, so that the name prompt can refuse a folder that is not empty. */
  readonly cwd: string;
  /** The plugins that can be offered on top of the template (spec 6 step 4). */
  readonly index: PluginIndex;
  /** `user.name` and `user.email` of git, when it knows them. */
  readonly gitUser: () => { readonly name?: string; readonly email?: string };
}

const gitValue = (key: string): string | undefined => {
  try {
    const value = execFileSync('git', ['config', '--get', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value === '' ? undefined : value;
  } catch {
    return undefined;
  }
};

/** The author that git knows, as `Name <email>`. */
export function gitAuthor(): { name?: string; email?: string } {
  const name = gitValue('user.name');
  const email = gitValue('user.email');
  return { ...(name === undefined ? {} : { name }), ...(email === undefined ? {} : { email }) };
}

const AUTHOR = /^[^<>]+ <[^<>@\s]+@[^<>@\s]+>$/;

const text = (args: ParsedArgs, flag: string): string | undefined => {
  const value = args.flags[flag];
  return typeof value === 'string' ? value : undefined;
};
const on = (args: ParsedArgs, flag: string): boolean | undefined => {
  const value = args.flags[flag];
  return typeof value === 'boolean' ? value : undefined;
};

const DIALECTS: readonly PromptOption<Dialect>[] = [
  { value: 'postgres', label: 'PostgreSQL', hint: 'recommended for production' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite', hint: 'development and a single server' },
];

const LICENSES: readonly PromptOption<string>[] = [
  { value: 'UNLICENSED', label: 'UNLICENSED', hint: 'private, grants nothing' },
  { value: 'MIT', label: 'MIT' },
  { value: 'Apache-2.0', label: 'Apache-2.0' },
  { value: 'other', label: 'Another SPDX identifier' },
];

const problemOf = (check: () => unknown): string | undefined => {
  try {
    check();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/** What the person reads before anything is written. */
export function summaryOf(choices: Choices): string {
  const rows: [string, string][] = [
    ['Name', choices.project.name],
    ['Database', DIALECTS.find((option) => option.value === choices.dialect)?.label ?? choices.dialect],
    ['Template', `${choices.template.name} (${choices.template.plugins.length} plugins)`],
    ['Plugins', choices.extraPlugins.length === 0 ? 'none on top' : choices.extraPlugins.join(', ')],
    ['Admin', choices.admin ? 'yes' : 'no'],
    ['License', choices.license],
    ['Author', choices.author],
    ['Install', choices.install ? 'yes' : 'no'],
    ['Git', choices.git ? 'yes' : 'no'],
  ];
  return rows.map(([key, value]) => `${key.padEnd(9)}${value}`).join('\n');
}

/**
 * Every prompt has a flag (section 5.1). A choice that was not given by flag is asked when a person is there, takes its default with
 * `--yes`, and is otherwise reported together with the others that are missing, so that an agent can repair its command in one go.
 * A person is asked in the order of section 6, sees the summary, and confirms it before anything is written.
 */
export async function resolveChoices(args: ParsedArgs, deps: ChoiceDeps): Promise<Choices> {
  const yes = args.flags['yes'] === true;
  const { prompts } = deps;
  const missing: string[] = [];

  let nameGiven = args.positionals[0];
  if (nameGiven === undefined && prompts !== undefined) {
    nameGiven = await prompts.text('Project name?', {
      placeholder: 'my-app',
      validate: (value) =>
        problemOf(() => checkProjectName(value)) ?? targetProblem(deps.cwd, checkProjectName(value).folder),
    });
  }
  if (nameGiven === undefined && !yes) missing.push('<name>');
  // With --yes and no name there is no default to take, and the name check says what a name looks like.
  const project = nameGiven === undefined ? (yes ? checkProjectName('') : undefined) : checkProjectName(nameGiven);

  const dialectName =
    text(args, 'db') ??
    (prompts !== undefined ? await prompts.select('Which database?', DIALECTS, 'sqlite') : undefined) ??
    (yes ? 'sqlite' : (missing.push(`--db <${DIALECT_NAMES.join('|')}>`), 'sqlite'));
  const dialect = DIALECT_NAMES.find((name) => name === dialectName);
  if (dialect === undefined) {
    throw usageError(
      'BK_CREATE_DB_INVALID',
      `"${dialectName}" is not a database.`,
      `Use --db ${DIALECT_NAMES.join(', ')}.`,
    );
  }

  const templateNames = Object.keys(deps.templates);
  const templateName =
    text(args, 'template') ??
    (prompts !== undefined
      ? templateNames.length === 1
        ? templateNames[0]
        : await prompts.select(
            'Which template?',
            templateNames.map((name) => ({ value: name, label: name, hint: deps.templates[name]?.description ?? '' })),
            templateNames.includes('blank') ? 'blank' : (templateNames[0] ?? ''),
          )
      : undefined) ??
    (yes ? 'blank' : (missing.push(`--template <${templateNames.join('|')}>`), 'blank'));
  const template = deps.templates[templateName];
  if (template === undefined) {
    throw usageError(
      'BK_CREATE_TEMPLATE_UNKNOWN',
      `"${templateName}" is not a template.`,
      `Use --template ${templateNames.join(', ')}.`,
    );
  }

  const offered = Object.entries(deps.index)
    .filter(([name, entry]) => !template.plugins.includes(name) && entry.manifest.dialects.includes(dialect))
    .map(([name]) => ({ value: name, label: name }));
  const flagged = text(args, 'plugins');
  const extraPlugins =
    flagged !== undefined
      ? flagged
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name !== '')
      : prompts !== undefined && offered.length > 0
        ? await prompts.multiselect('Extra plugins?', offered, [])
        : [];

  const admin =
    on(args, 'admin') ?? (prompts === undefined ? true : await prompts.confirm('Include the admin app?', true));
  // The site app is not part of this version (see planProject), so it is taken from its flag or the template, and not asked.
  const site = on(args, 'site') ?? template.site === true;

  let license = text(args, 'license');
  if (license === undefined && prompts !== undefined) {
    license = await prompts.select('License?', LICENSES, 'UNLICENSED');
    if (license === 'other') {
      license = await prompts.text('SPDX identifier?', {
        placeholder: 'BSD-3-Clause',
        validate: (value) => (SPDX_ID.test(value) ? undefined : 'Use an SPDX identifier, such as BSD-3-Clause.'),
      });
    }
  }
  license ??= 'UNLICENSED';
  if (!SPDX_ID.test(license)) {
    throw usageError(
      'BK_CREATE_LICENSE_INVALID',
      `"${license}" is not an SPDX identifier.`,
      'Use an SPDX identifier such as MIT or Apache-2.0, or UNLICENSED.',
    );
  }

  let author = text(args, 'author');
  if (author === undefined) {
    const git = deps.gitUser();
    if (git.name !== undefined && git.email !== undefined) author = `${git.name} <${git.email}>`;
    else if (prompts !== undefined)
      author = await prompts.text('Author (Name <email>)?', {
        placeholder: 'Ada Lovelace <ada@example.com>',
        validate: (value) => (AUTHOR.test(value) ? undefined : 'Write it as Name <email>.'),
      });
    else missing.push('--author "Name <email>"');
  }
  if (author !== undefined && !AUTHOR.test(author)) {
    throw usageError(
      'BK_CREATE_AUTHOR_INVALID',
      `"${author}" is not "Name <email>".`,
      'Write the author as --author "Ada Lovelace <ada@example.com>".',
    );
  }

  const install =
    on(args, 'install') ?? (prompts === undefined ? true : await prompts.confirm('Run pnpm install?', true));
  const git =
    on(args, 'git') ?? (prompts === undefined ? true : await prompts.confirm('Create a git repository?', true));

  if (missing.length > 0 || project === undefined) {
    throw new CliError(
      `${missing.length === 1 ? 'A choice is' : 'Choices are'} missing, and there is nobody to ask: ${missing.join(', ')}.`,
      {
        code: 'BK_CREATE_CHOICE_NEEDED',
        exit: 2,
        fix: 'Give the name and the flags, or add --yes to take the defaults (sqlite, blank, no site).',
      },
    );
  }

  const choices: Choices = {
    project,
    dialect,
    template,
    extraPlugins,
    admin,
    site,
    author: author ?? '',
    license,
    install,
    git,
  };
  if (prompts !== undefined) {
    prompts.note(summaryOf(choices), 'Summary');
    if (!(await prompts.confirm('Create the project?', true))) throw cancelled();
  }
  return choices;
}
