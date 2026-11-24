/**
 * BieberKit
 *
 * @file        tools/lib/env-access.ts
 * @description Finds reads of the process environment outside packages/core/src/config/ (CFG-02, P8).
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

/** The only place that may read the process environment. */
export const ALLOWED_PREFIX = 'packages/core/src/config/';

/**
 * The rules that `bieberkit check` runs on a project and their tests are made of the patterns and the sample code that they look for,
 * and the generators write the text of files (the Vitest preset reads the environment of CI). A line scan of them finds the environment
 * in a string. They read nothing.
 */
export const PATTERN_FILES: readonly string[] = ['packages/cli/src/check/', 'packages/cli/src/generate/'];

/** Top-level folders that hold framework or project code. `tools/` is covered by the lint rule `node/no-process-env`. */
export const SCANNED_ROOTS: readonly string[] = ['packages', 'plugins', 'templates', 'examples'];

export interface EnvAccessViolation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly fix: string;
}

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const SKIPPED_DIRS = /(?:^|\/)(?:node_modules|dist|coverage|\.bieberkit)\//;

// Each pattern catches one way to reach process.env that the lint rule misses or could be bypassed with.
const PATTERNS: readonly RegExp[] = [
  /\bprocess\s*(?:\.\s*env\b|\[\s*['"]env['"]\s*\])/,
  /\bimport\s*(?:type\s*)?\{[^}]*\benv\b[^}]*\}\s*from\s*['"](?:node:)?process['"]/,
  /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\.)?process\b/,
  /\bprocess\s*\.\s*loadEnvFile\b/,
];

const FIX =
  'Take validated config from loadEnv() in @bieberkit/core. Only packages/core/src/config/ reads the environment (P8).';

/** True for a source file the rule applies to. `path` is relative to the repository root, with `/`. */
export function isScanned(path: string): boolean {
  const root = path.split('/')[0] ?? '';
  return SCANNED_ROOTS.includes(root) && CODE_FILE.test(path) && !SKIPPED_DIRS.test(path);
}

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

/** Returns one violation per line that reads the environment. `file` is relative to the repository root, with `/`. */
export function findEnvAccess(file: string, source: string): EnvAccessViolation[] {
  if (file.startsWith(ALLOWED_PREFIX) || PATTERN_FILES.some((prefix) => file.startsWith(prefix))) return [];
  const found: EnvAccessViolation[] = [];
  const lines = source.split('\n');
  for (const [index, text] of lines.entries()) {
    if (isComment(text)) continue;
    if (PATTERNS.some((pattern) => pattern.test(text))) {
      found.push({ file, line: index + 1, text: text.trim(), fix: FIX });
    }
  }
  return found;
}
