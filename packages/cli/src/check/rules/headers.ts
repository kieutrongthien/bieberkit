/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/headers.ts
 * @description Rule headers: every source file of the project starts with the header of section 23.7, with its own path, a description, and the author and license of the project (HDR-01, HDR-02).
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

import type { Rule, SourceFile, Violation } from '../rule.ts';
import { isGenerated, violation } from '../rule.ts';

const BLOCK = /\.(?:[cm]?[jt]s|[jt]sx|css)$/;

/** The text of the first comment of a file, after a shebang, and the line where its fields start. */
function leadingComment(text: string): string | undefined {
  const body = text.startsWith('#!') ? text.slice(text.indexOf('\n') + 1) : text;
  if (!body.startsWith('/**')) return undefined;
  const close = body.indexOf('*/');
  return close === -1 ? undefined : body.slice(0, close);
}

const field = (header: string, tag: string): string | undefined =>
  new RegExp(`^[ \\t]*\\*[ \\t]*@${tag}(?:[ \\t]+(.*?))?[ \\t]*$`, 'm').exec(header)?.[1];

const code = (name: string): string => `BK_HEADER_${name}`;

function check(file: SourceFile, author: string, license: string): Violation[] {
  const header = leadingComment(file.text);
  const make = (name: string, message: string, fix: string): Violation[] => [
    violation('headers', code(name), file.path, 1, message, fix),
  ];
  if (header === undefined || !/@file\b/.test(header)) {
    return make(
      'MISSING',
      `${file.path} does not start with the file header.`,
      'Add the header of section 23.7 as the first comment of the file.',
    );
  }
  const found: Violation[] = [];
  if (field(header, 'file') !== file.path)
    found.push(
      ...make(
        'FILE',
        `@file says ${field(header, 'file')}, and the path is ${file.path}.`,
        `Set @file to ${file.path}.`,
      ),
    );
  if ((field(header, 'description') ?? '') === '')
    found.push(
      ...make('DESCRIPTION', `${file.path} has no @description.`, 'Write one sentence about what the file does.'),
    );
  if (field(header, 'author') !== author)
    found.push(
      ...make(
        'AUTHOR',
        `@author is not the author of the project (${author}).`,
        `Set @author to ${author}, or change the author in bieberkit.config.ts.`,
      ),
    );
  if (field(header, 'license') !== license)
    found.push(
      ...make(
        'LICENSE',
        `@license is not the license of the project (${license}).`,
        `Set @license to ${license}, or change the license in bieberkit.config.ts.`,
      ),
    );
  return found;
}

export const headersRule: Rule = {
  name: 'headers',
  summary: 'Every source file starts with the header of section 23.7.',
  run: ({ files, config }) =>
    files
      .filter((file) => BLOCK.test(file.path) && !isGenerated(file) && !/(?:^|\/)[^/]+\.d\.ts$/.test(file.path))
      .flatMap((file) => check(file, config.author, config.license)),
};
