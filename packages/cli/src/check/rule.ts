/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rule.ts
 * @description The shape of a rule of bieberkit check: the files that it reads, the violations that it answers, and the directive that lets one line through (section 5.2, AI-02).
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

import type { ProjectConfigInput } from '@bieberkit/core';
import type { App } from '../app.ts';
import { docsLink } from '../errors.ts';

export interface SourceFile {
  /** Relative to the project root, with `/`. */
  readonly path: string;
  readonly text: string;
}

export interface Violation {
  readonly rule: string;
  /** Stable, starts with `BK_`. */
  readonly code: string;
  /** An `error` fails the check (exit code 3). A `warning` is shown and does not. */
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly fix: string;
  readonly docs: string;
}

export interface RuleInput {
  readonly files: readonly SourceFile[];
  readonly config: ProjectConfigInput;
  /** The root of the project on disk, for a rule that reads `node_modules`. */
  readonly root: string;
  /** The application, loaded when a rule asks (it imports the code of the project). */
  readonly app: () => Promise<App>;
}

export interface Rule {
  /** The name that `bieberkit check <rule>` takes. */
  readonly name: string;
  readonly summary: string;
  run(input: RuleInput): Violation[] | Promise<Violation[]>;
}

export const violation = (
  rule: string,
  code: string,
  file: string,
  line: number,
  message: string,
  fix: string,
  severity: Violation['severity'] = 'error',
): Violation => ({ rule, code, severity, file, line, message, fix, docs: docsLink(code) });

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** A source file that a rule about code reads: code, not a test, and not generated. */
export const isCode = (file: SourceFile): boolean =>
  CODE_FILE.test(file.path) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file.path) && !isGenerated(file);

/** A generated file says so in its header (GEN-01), and a person does not edit it. */
export const isGenerated = (file: SourceFile): boolean => file.text.slice(0, 2000).includes('@generated');

/**
 * `// bieberkit-ignore BK_CODE: the reason` on the line of a violation or the line before lets it through. The reason is required,
 * so a person who reads the file later knows why.
 */
export function ignored(file: SourceFile, v: Pick<Violation, 'code' | 'line'>): boolean {
  const lines = file.text.split('\n');
  return [v.line - 1, v.line - 2].some((index) => {
    const text = lines[index] ?? '';
    const match = /bieberkit-ignore\s+(BK_[A-Z_]+)\s*:\s*(\S.*)$/.exec(text);
    return match?.[1] === v.code;
  });
}
