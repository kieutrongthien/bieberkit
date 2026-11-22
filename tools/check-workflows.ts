/**
 * BieberKit
 *
 * @file        tools/check-workflows.ts
 * @description Checks the workflows in .github/workflows against the release rules SEC-15, SEC-16 and SEC-21.
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

// Usage: node tools/check-workflows.ts [file ...]
// With no arguments it checks every workflow in .github/workflows. Exit code 1 when a rule is broken.
// actionlint and zizmor run in CI as pinned containers. This checker covers what they do not.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { checkWorkflow } from './lib/workflows.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, '.github', 'workflows');

function listFiles(): string[] {
  const given = process.argv.slice(2);
  if (given.length > 0) return given.map((f) => resolve(f));
  try {
    return readdirSync(DIR)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .toSorted()
      .map((f) => join(DIR, f));
  } catch {
    return [];
  }
}

const files = listFiles();
let problems = 0;
for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/');
  for (const v of checkWorkflow(rel, readFileSync(abs, 'utf8'))) {
    problems++;
    process.stdout.write(`${v.file}  ${v.rule}  job "${v.job}": ${v.detail}\n    Fix: ${v.fix}\n`);
  }
}
if (problems > 0) {
  process.stdout.write(`\n${problems} workflow problem(s). Standard: ADR 0014, SEC-15, SEC-16, SEC-21.\n`);
  process.exit(1);
}
process.stdout.write(`check:workflows ok (${files.length} files)\n`);
