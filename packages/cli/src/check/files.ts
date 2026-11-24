/**
 * BieberKit
 *
 * @file        packages/cli/src/check/files.ts
 * @description Reads the files of a project that the rules look at: every source and migration file, without what is installed, built or generated elsewhere.
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

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceFile } from './rule.ts';

const SKIPPED = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.bieberkit',
  '.turbo',
  '.next',
  '.vite',
]);
const READ = /\.(?:[cm]?[jt]s|[jt]sx|css|sql|ya?ml)$/;
const MAX_BYTES = 1024 * 1024;

/** Every file of the project that a rule may read, with a path relative to the root and `/` in it, in a fixed order. */
export function readProject(root: string): SourceFile[] {
  const found: SourceFile[] = [];
  const walk = (folder: string, prefix: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) walk(join(folder, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.isFile() && READ.test(entry.name)) {
        const text = readFileSync(join(folder, entry.name), 'utf8');
        if (text.length <= MAX_BYTES) found.push({ path: `${prefix}${entry.name}`, text });
      }
    }
  };
  walk(root, '');
  return found;
}
