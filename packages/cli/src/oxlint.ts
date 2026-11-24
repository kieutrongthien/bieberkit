/**
 * BieberKit
 *
 * @file        packages/cli/src/oxlint.ts
 * @description The Oxlint plugin of the framework: the rules of bieberkit check run on one file, so that an editor and a lint pass say what the check says (section 3, section 5.2).
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

import { relative } from 'node:path';
import type { ProjectConfigInput } from '@bieberkit/core';
import { boundariesRule } from './check/rules/boundaries.ts';
import { envAccessRule } from './check/rules/env-access.ts';
import { headersRule } from './check/rules/headers.ts';
import { ormRule } from './check/rules/orm.ts';
import { sqlRule } from './check/rules/sql.ts';
import { transactionsRule } from './check/rules/transactions.ts';
import type { Rule, Violation } from './check/rule.ts';

/** What `.bieberkit/oxlintrc.json` gives each rule: the root of the project and what the headers need to know. */
interface Settings {
  readonly root?: string;
  readonly author?: string;
  readonly license?: string;
}

export interface OxlintContext {
  readonly filename?: string;
  readonly physicalFilename?: string;
  readonly options?: readonly unknown[];
  readonly sourceCode: { readonly text: string };
  report(descriptor: {
    message: string;
    loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  }): void;
}

function settingsOf(options: readonly unknown[] | undefined): Settings {
  const first: unknown = options?.[0];
  return typeof first === 'object' && first !== null ? first : {};
}

/** Runs a rule of `bieberkit check` on the file that is being linted. The rules that need the application are not here. */
function runOn(rule: Rule, context: OxlintContext): Violation[] {
  const settings = settingsOf(context.options);
  const root = settings.root ?? process.cwd();
  const file = context.physicalFilename ?? context.filename ?? '';
  const path = relative(root, file).split('\\').join('/');
  if (path.startsWith('..') || path === '') return [];
  const config: ProjectConfigInput = {
    name: '',
    author: settings.author ?? '',
    license: settings.license ?? 'UNLICENSED',
    database: { dialect: 'sqlite' },
    tenancy: { mode: 'single' },
    locales: { default: 'en', supported: ['en'] },
    plugins: [],
  };
  const found = rule.run({
    files: [{ path, text: context.sourceCode.text }],
    config,
    root,
    app: () => Promise.reject(new Error('No application in a lint pass.')),
  });
  // The rules about one file answer at once. A rule that needs the application is not offered by this plugin.
  return Array.isArray(found) ? found : [];
}

export interface OxlintRule {
  readonly meta: {
    readonly type: 'problem';
    readonly docs: { readonly description: string };
    /** A rule takes options only when it says so. These are the root of the project, the author and the license. */
    readonly schema: readonly object[];
  };
  create(context: OxlintContext): Record<string, () => void>;
}

export interface OxlintPlugin {
  readonly meta: { readonly name: string };
  readonly rules: Readonly<Record<string, OxlintRule>>;
}

function ruleOf(rule: Rule): OxlintRule {
  return {
    meta: {
      type: 'problem',
      docs: { description: rule.summary },
      schema: [{ type: 'object', additionalProperties: true }],
    },
    create(context) {
      return {
        Program() {
          for (const found of runOn(rule, context)) {
            const line = Math.max(1, found.line);
            context.report({
              message: `${found.code}: ${found.message} ${found.fix}`,
              loc: { start: { line, column: 0 }, end: { line, column: 1 } },
            });
          }
        },
      };
    },
  };
}

/**
 * The plugin, in the shape that Oxlint loads (`jsPlugins`). It runs the same functions as `bieberkit check`, so the editor and the check
 * cannot disagree. A plugin file has to be a default export, which is the one place of the framework where that is so.
 */
const plugin: OxlintPlugin = {
  meta: { name: 'bieberkit' },
  rules: {
    headers: ruleOf(headersRule),
    'env-access': ruleOf(envAccessRule),
    boundaries: ruleOf(boundariesRule),
    orm: ruleOf(ormRule),
    sql: ruleOf(sqlRule),
    transactions: ruleOf(transactionsRule),
  },
};

export default plugin;
