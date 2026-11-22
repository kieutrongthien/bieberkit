/**
 * BieberKit
 *
 * @file        packages/data/src/migrations/destructive.ts
 * @description Detection of destructive statements in generated SQL and reading the up() statements of a migration file (DATA-08).
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

import { dataError } from '../errors.ts';

export type DestructiveKind = 'drop-column' | 'drop-table' | 'rename' | 'alter-type' | 'not-null-without-default';

export interface DestructiveFinding {
  readonly kind: DestructiveKind;
  /** The whole statement, so the person who reads the refusal sees what runs. */
  readonly statement: string;
}

type Quote = "'" | '"' | '`';

/** Cuts `text` at `separator`, never inside quotes. With `depth` set, never inside parentheses either. The separator stays with its piece. */
export function cutSql(text: string, separator: ';' | ',', depth: boolean): string[] {
  const pieces: string[] = [];
  let start = 0;
  let open = 0;
  let quote: Quote | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (depth && char === '(') {
      open += 1;
    } else if (depth && char === ')') {
      open -= 1;
    } else if (char === separator && open === 0) {
      pieces.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  pieces.push(text.slice(start));
  return pieces.map((piece) => piece.trim()).filter((piece) => piece !== '');
}

/** The text of a clause in lower case, with the content of string literals removed, so a default value is never read as SQL. */
function plain(clause: string): string {
  return clause.replaceAll(/'(?:[^']|'')*'/g, "''").toLowerCase();
}

const NOT_A_COLUMN = /\badd\s+(?:constraint|primary|unique|foreign|index|key|check|fulltext|spatial)\b/;
const IMPLICIT_DEFAULT = /\b(?:default|auto_increment|generated|serial|bigserial|identity)\b/;

function classify(clause: string): DestructiveKind | undefined {
  const text = plain(clause);
  if (/\bdrop\s+table\b/.test(text)) return 'drop-table';
  if (/\bdrop\s+column\b/.test(text)) return 'drop-column';
  if (/\brename\s+(?:column|to|table)\b/.test(text)) return 'rename';
  if (/\balter\s+column\s+\S+\s+(?:set\s+data\s+)?type\b/.test(text)) return 'alter-type';
  if (/(?<![`"\w])(?:modify|change)\s+(?:column\s+)?[`"\w]/.test(text)) return 'alter-type';
  if (/\badd\s+(?:column\s+)?[`"\w]/.test(text) && !NOT_A_COLUMN.test(text)) {
    if (/\bnot\s+null\b/.test(text) && !IMPLICIT_DEFAULT.test(text)) return 'not-null-without-default';
  }
  return undefined;
}

/**
 * The destructive statements among `statements`: a dropped column or table, a rename, a change of a column type, and a new
 * column that is `not null` without a default (DATA-08). A statement is read clause by clause, so one `alter table` that adds
 * and drops is found. Such a change belongs to the contract release, never to the release that adds the code that needs it.
 */
export function detectDestructive(statements: readonly string[]): DestructiveFinding[] {
  const findings: DestructiveFinding[] = [];
  for (const text of statements) {
    for (const statement of cutSql(text, ';', false)) {
      for (const clause of cutSql(statement, ',', true)) {
        const kind = classify(clause);
        if (kind !== undefined) findings.push({ kind, statement });
      }
    }
  }
  return findings;
}

/** Index after the string literal that starts at `from`, and its text, or `undefined` when `from` is not a quote. */
function readLiteral(source: string, from: number): { text: string; end: number } | undefined {
  const quote = source.charAt(from);
  if (quote !== "'" && quote !== '"' && quote !== '`') return undefined;
  let text = '';
  for (let i = from + 1; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (char === '\\') {
      const next = source.charAt(i + 1);
      text += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      i += 1;
    } else if (char === quote) {
      return { text, end: i + 1 };
    } else {
      text += char;
    }
  }
  return undefined;
}

/** Index of the brace that closes the one at `open`. Strings and comments are skipped, so a brace inside SQL does not count. */
function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (char === "'" || char === '"' || char === '`') {
      i = (readLiteral(source, i)?.end ?? i + 1) - 1;
    } else if (char === '/' && source.charAt(i + 1) === '/') {
      i = source.indexOf('\n', i) === -1 ? source.length : source.indexOf('\n', i);
    } else if (char === '/' && source.charAt(i + 1) === '*') {
      i = source.indexOf('*/', i) === -1 ? source.length : source.indexOf('*/', i) + 1;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

const UP_METHOD = /\bup\s*\([^)]*\)\s*(?::\s*[\w<>[\]| ]+)?\s*\{/;

/**
 * The SQL that a migration file runs when it goes up: the strings given to `addSql` inside `up()`, and never those of `down()`,
 * which drops what `up()` creates. A call whose argument is not a string literal is not read.
 */
export function upStatementsOfMigration(source: string): string[] {
  const method = UP_METHOD.exec(source);
  if (method === null) {
    throw dataError(
      'DATA_MIGRATION_UNREADABLE',
      500,
      'A migration file has no up() method.',
      'A migration is a class that extends Migration and has up() and down().',
    );
  }
  const open = method.index + method[0].length - 1;
  const body = source.slice(open, closingBrace(source, open) + 1);
  const statements: string[] = [];
  for (const call of body.matchAll(/\baddSql\s*\(\s*/g)) {
    const literal = readLiteral(body, call.index + call[0].length);
    if (literal !== undefined) statements.push(literal.text);
  }
  return statements;
}
