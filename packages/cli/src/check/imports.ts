/**
 * BieberKit
 *
 * @file        packages/cli/src/check/imports.ts
 * @description Reads the imports of a file: the specifier and the line of each import, export from and dynamic import (section 5.2).
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

import { lineAt, matchesInCode } from './code.ts';

export interface ImportRef {
  readonly specifier: string;
  readonly line: number;
}

const FORMS: readonly RegExp[] = [
  /\bimport\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?(['"])([^'"\n]+)\1/g,
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  /\brequire\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,
];

/** Every module that the file imports, in the order of the text. */
export function importsOf(source: string): ImportRef[] {
  return FORMS.flatMap((pattern) =>
    matchesInCode(source, pattern).map((match) => ({ specifier: match[2] ?? '', line: lineAt(source, match.index) })),
  ).toSorted((a, b) => a.line - b.line);
}
