/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/range.ts
 * @description A small version range matcher with no dependency, because core may not have any (PLG-08, PKG-04).
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

import { PluginError } from './errors.ts';
import type { PluginProblem } from './errors.ts';

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RANGE = /^(\^|~|>=)?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
const ACCEPTED = 'Use an exact version (1.2.3), ^1.2.3, ~1.2.3, >=1.2.3 or *.';

type Triple = readonly [number, number, number];

function triple(version: string): Triple | undefined {
  const match = VERSION.exec(version);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: Triple, b: Triple): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The problem with a version, or `undefined` when it is `major.minor.patch`. */
export function versionProblem(version: string): PluginProblem | undefined {
  if (triple(version) !== undefined) return undefined;
  return {
    code: 'PLG_BAD_VERSION',
    message: `"${version}" is not a version.`,
    fix: 'Use three numbers, for example 1.2.3. Pre-release tags are not supported.',
  };
}

/** The problem with a range, or `undefined` when the matcher supports it. */
export function rangeProblem(range: string): PluginProblem | undefined {
  if (range === '*' || RANGE.test(range)) return undefined;
  return { code: 'PLG_BAD_RANGE', message: `"${range}" is not a supported version range.`, fix: ACCEPTED };
}

/** Throws `PluginError` with `PLG_BAD_RANGE` for a range the matcher does not support. */
export function assertRange(range: string): void {
  const problem = rangeProblem(range);
  if (problem !== undefined) throw new PluginError([problem]);
}

/** Whether `version` is inside `range`. Supports exact, `^`, `~`, `>=` and `*` (PLG-08). Anything else throws `PluginError`. */
export function satisfies(version: string, range: string): boolean {
  const bad = rangeProblem(range) ?? versionProblem(version);
  if (bad !== undefined) throw new PluginError([bad]);
  const v = triple(version);
  if (v === undefined || range === '*') return true;
  const match = RANGE.exec(range);
  const operator = match?.[1];
  const r = triple(match?.[2] ?? '');
  if (r === undefined) return false;
  if (operator === undefined) return compare(v, r) === 0;
  if (operator === '>=') return compare(v, r) >= 0;
  if (compare(v, r) < 0) return false;
  if (operator === '~') return v[0] === r[0] && v[1] === r[1];
  // Caret: the leftmost part that is not zero stays fixed.
  if (r[0] > 0) return v[0] === r[0];
  if (r[1] > 0) return v[0] === 0 && v[1] === r[1];
  return v[0] === 0 && v[1] === 0 && v[2] === r[2];
}
