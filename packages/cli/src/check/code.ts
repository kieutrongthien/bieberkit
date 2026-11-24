/**
 * BieberKit
 *
 * @file        packages/cli/src/check/code.ts
 * @description Reads source text without a parser: hides comments and the text of strings so that a pattern only matches code, and finds the end of a call (section 5.2).
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

/**
 * The same text with comments and the text of strings and templates replaced by spaces, so that every offset and every line stays
 * where it was. The code inside `${ }` of a template is kept. A pattern that runs on the result can only match code.
 */
export function maskCode(source: string, options: { readonly keepStrings?: boolean } = {}): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  // A stack of the templates that are open: the depth of the braces inside `${ }` of each.
  const templates: number[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    const inTemplateText = templates.length > 0 && templates[templates.length - 1] === -1;
    if (inTemplateText) {
      // Inside the text of a template: skip to its end or to the next `${`.
      const start = i;
      while (i < source.length && source[i] !== '`' && !(source[i] === '$' && source[i + 1] === '{'))
        i += source[i] === '\\' ? 2 : 1;
      if (options.keepStrings !== true) blank(start, Math.min(i, source.length));
      if (source[i] === '`') templates.pop();
      else if (i < source.length) {
        templates[templates.length - 1] = 0;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1;
      if (options.keepStrings !== true) blank(i + 1, j);
      i = j + 1;
    } else if (c === '`') {
      templates.push(-1);
      i += 1;
    } else if (c === '{' && templates.length > 0) {
      templates[templates.length - 1] = (templates[templates.length - 1] ?? 0) + 1;
      i += 1;
    } else if (c === '}' && templates.length > 0) {
      const depth = templates[templates.length - 1] ?? 0;
      // The brace that closes `${ }` goes back to the text of the template, and one that closes a block inside it does not.
      templates[templates.length - 1] = depth === 0 ? -1 : depth - 1;
      i += 1;
    } else i += 1;
  }
  return out.join('');
}

/**
 * The matches of `pattern` that start in code. The pattern runs on the text with its strings kept, because the text of a string may be
 * what it looks for (the specifier of an import), and a match counts only when its first character is code and not the inside of a
 * string or a comment: `'import x from "y"'` is a string that says import, not an import.
 */
export function matchesInCode(source: string, pattern: RegExp): RegExpExecArray[] {
  const kept = maskCode(source, { keepStrings: true });
  const code = maskCode(source);
  return [...kept.matchAll(pattern)].filter(
    (match) => code[match.index] === kept[match.index] && kept[match.index] !== ' ',
  );
}

/** The 1-based line of an offset. */
export function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) if (source[i] === '\n') line += 1;
  return line;
}

/** The offset of the `)` that closes the `(` at `open`, in masked text, or `-1`. */
export function closingParen(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '(') depth += 1;
    else if (masked[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
