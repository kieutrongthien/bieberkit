/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/check.ts
 * @description bieberkit check: runs the rules of the framework on the project and answers with the violations and exit code 3 when there are errors (section 5.2, AI-02).
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

import { RULES } from '../check/rules.ts';
import { readProject } from '../check/files.ts';
import { ignored } from '../check/rule.ts';
import type { Violation } from '../check/rule.ts';
import type { Command } from '../command.ts';
import { usageError } from '../errors.ts';
import { loadApp } from '../app.ts';
import type { App } from '../app.ts';
import { loadConfig } from '../project.ts';

const order = (a: Violation, b: Violation): number =>
  a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

export const checkCommand: Command = {
  name: 'check',
  summary: 'Run the rules of the framework: headers, env access, boundaries, ORM, SQL, transactions, migrations.',
  positionals: [{ name: 'rule' }],
  async run(context) {
    const wanted = context.args.positionals[0];
    const rules = wanted === undefined ? RULES : RULES.filter((rule) => rule.name === wanted);
    if (rules.length === 0) {
      throw usageError(
        'BK_USAGE_UNKNOWN_RULE',
        `"${wanted}" is not a rule.`,
        `Use one of: ${RULES.map((rule) => rule.name).join(', ')}.`,
      );
    }
    const { root, config } = await loadConfig(context.cwd);
    const files = readProject(root);
    const byPath = new Map(files.map((file) => [file.path, file]));
    let loaded: Promise<App> | undefined;
    const app = (): Promise<App> => (loaded ??= loadApp(context.cwd));
    const violations = (await Promise.all(rules.map(async (rule) => rule.run({ files, config, root, app }))))
      .flat()
      .filter((found) => {
        const file = byPath.get(found.file);
        return file === undefined || !ignored(file, found);
      })
      .toSorted(order);
    const errors = violations.filter((found) => found.severity === 'error').length;
    const lines = violations.flatMap((found) => [
      `${found.file}:${found.line}  ${found.severity === 'error' ? 'error' : 'warning'}[${found.code}]  ${found.message}`,
      `    fix: ${found.fix}`,
    ]);
    const summary = `${errors} error${errors === 1 ? '' : 's'}, ${violations.length - errors} warning${violations.length - errors === 1 ? '' : 's'} in ${files.length} files (${rules.map((rule) => rule.name).join(', ')}).`;
    return {
      data: {
        rules: rules.map((rule) => rule.name),
        files: files.length,
        errors,
        warnings: violations.length - errors,
        violations,
      },
      text: [...lines, summary].join('\n'),
      exit: errors > 0 ? 3 : 0,
    };
  },
};
