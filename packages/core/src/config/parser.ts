/**
 * BieberKit
 *
 * @file        packages/core/src/config/parser.ts
 * @description The Parser contract for what core validates but does not own, and the conversion of parser failures into config problems (CFG-09).
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

import { ConfigValidationError } from '../errors/errors.ts';
import type { ConfigProblem } from '../errors/errors.ts';

/** Anything with a throwing `parse`. A Zod schema fits, and so does a hand-written object. Core has no validation library (PKG-04). */
export interface Parser<T> {
  parse(input: unknown): T;
}

interface Issue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

function isPathSegment(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/** Reads the `issues` that Zod and similar libraries put on their errors, without importing any of them. */
function issuesOf(error: unknown): Issue[] | undefined {
  if (typeof error !== 'object' || error === null || !('issues' in error) || !Array.isArray(error.issues))
    return undefined;
  const found: Issue[] = [];
  for (const raw of error.issues as unknown[]) {
    if (typeof raw !== 'object' || raw === null || !('message' in raw) || typeof raw.message !== 'string')
      return undefined;
    const path = 'path' in raw && Array.isArray(raw.path) ? (raw.path as unknown[]).filter(isPathSegment) : [];
    found.push({ path, message: raw.message });
  }
  return found.length > 0 ? found : undefined;
}

/** Joins a base path and segments: `plugins[0]` and `['depth', 0]` give `plugins[0].depth[0]`. */
export function joinPath(base: string, segments: readonly (string | number)[]): string {
  return segments.reduce<string>((path, segment) => {
    if (typeof segment === 'number') return `${path}[${segment}]`;
    return path === '' ? segment : `${path}.${segment}`;
  }, base);
}

const fix = (at: string): string => `Fix the value at ${at}.`;

/** Problems for a failure of `parse` at `path`: one per issue when the error has issues, else one with its message. */
export function problemsOfFailure(error: unknown, path: string): ConfigProblem[] {
  const issues = issuesOf(error);
  if (issues !== undefined) {
    return issues.map((issue) => {
      const key = joinPath(path, issue.path);
      return { key, code: 'CFG_CONFIG_INVALID', message: issue.message, fix: fix(key) };
    });
  }
  const message = error instanceof Error ? error.message : 'The value is not valid.';
  return [{ key: path, code: 'CFG_CONFIG_INVALID', message, fix: fix(path) }];
}

/** Runs a parser and turns its failure into a `ConfigValidationError` at `path`. */
export function runParser<T>(parser: Parser<T>, input: unknown, path: string): T {
  try {
    return parser.parse(input);
  } catch (error) {
    throw new ConfigValidationError(problemsOfFailure(error, path));
  }
}
