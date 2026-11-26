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
import type { Prompts } from '../kit/command.ts';
import type { ParsedArgs } from '../kit/args.ts';
import { checkProjectName } from './names.ts';
import type { ProjectName } from './names.ts';
import { SPDX_ID } from './licenses.ts';
import { DIALECT_NAMES } from './templates.ts';
import type { Template } from './templates.ts';

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

/**
 * Every prompt has a flag (section 5.1). A choice that was not given by flag is asked when a person is there, takes its default with
 * `--yes`, and is otherwise reported together with the others that are missing, so that an agent can repair its command in one go.
 */
export async function resolveChoices(args: ParsedArgs, deps: ChoiceDeps): Promise<Choices> {
  const yes = args.flags['yes'] === true;
  const missing: string[] = [];
  const project = checkProjectName(args.positionals[0] ?? '');

  const choose = async (
    flag: string,
    question: string,
    options: readonly string[],
    fallback: string,
  ): Promise<string> => {
    const given = text(args, flag);
    if (given !== undefined) return given;
    if (deps.prompts !== undefined)
      return deps.prompts.select(
        question,
        options.map((value) => ({ value, label: value })),
        fallback,
      );
    if (yes) return fallback;
    missing.push(`--${flag} <${options.join('|')}>`);
    return fallback;
  };

  const dialectName = await choose('db', 'Which database?', DIALECT_NAMES, 'sqlite');
  const templateName = await choose('template', 'Which template?', Object.keys(deps.templates), 'blank');
  const dialect = DIALECT_NAMES.find((name) => name === dialectName);
  if (dialect === undefined) {
    throw usageError(
      'BK_CREATE_DB_INVALID',
      `"${dialectName}" is not a database.`,
      `Use --db ${DIALECT_NAMES.join(', ')}.`,
    );
  }
  const template = deps.templates[templateName];
  if (template === undefined) {
    throw usageError(
      'BK_CREATE_TEMPLATE_UNKNOWN',
      `"${templateName}" is not a template.`,
      `Use --template ${Object.keys(deps.templates).join(', ')}.`,
    );
  }

  let author = text(args, 'author');
  if (author === undefined) {
    const git = deps.gitUser();
    if (git.name !== undefined && git.email !== undefined) author = `${git.name} <${git.email}>`;
    else if (deps.prompts !== undefined) author = await deps.prompts.text('Author (Name <email>)?');
    else missing.push('--author "Name <email>"');
  }
  if (author !== undefined && !AUTHOR.test(author)) {
    throw usageError(
      'BK_CREATE_AUTHOR_INVALID',
      `"${author}" is not "Name <email>".`,
      'Write the author as --author "Ada Lovelace <ada@example.com>".',
    );
  }

  const license = text(args, 'license') ?? 'UNLICENSED';
  if (!SPDX_ID.test(license)) {
    throw usageError(
      'BK_CREATE_LICENSE_INVALID',
      `"${license}" is not an SPDX identifier.`,
      'Use an SPDX identifier such as MIT or Apache-2.0, or UNLICENSED.',
    );
  }

  if (missing.length > 0) {
    throw new CliError(
      `${missing.length === 1 ? 'A choice is' : 'Choices are'} missing, and there is nobody to ask: ${missing.join(', ')}.`,
      {
        code: 'BK_CREATE_CHOICE_NEEDED',
        exit: 2,
        fix: 'Give the flags, or add --yes to take the defaults (sqlite, blank, no site).',
      },
    );
  }

  const plugins = (text(args, 'plugins') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  return {
    project,
    dialect,
    template,
    extraPlugins: plugins,
    admin: on(args, 'admin') ?? true,
    site: on(args, 'site') ?? template.site === true,
    author: author ?? '',
    license,
    install: on(args, 'install') ?? true,
    git: on(args, 'git') ?? true,
  };
}
