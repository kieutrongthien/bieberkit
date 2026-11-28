/**
 * BieberKit
 *
 * @file        tools/check-layout.ts
 * @description Fails when a file of a first-party plugin or of the admin shell is not in the folder of its kind (MOD-19, spec 7.4).
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

// Usage: node tools/check-layout.ts

import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { moduleFileProblem, shellFileProblem } from '../packages/cli/src/check/rules/layout-of.ts';

const ROOT = resolve(import.meta.dirname, '..');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const sources = [
  ...readdirSync(join(ROOT, 'plugins'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'plugins', entry.name, 'src')))
    .map((entry) => ({ folder: `plugins/${entry.name}/src`, problemOf: moduleFileProblem })),
  { folder: 'packages/admin-antd/src', problemOf: shellFileProblem },
];

let scanned = 0;
let problems = 0;
for (const { folder, problemOf } of sources) {
  for (const path of walk(join(ROOT, folder))) {
    scanned++;
    const problem = problemOf(relative(join(ROOT, folder), path).split('\\').join('/'));
    if (problem === undefined) continue;
    problems++;
    process.stdout.write(`${relative(ROOT, path)}  MOD-19\n    Fix: ${problem}\n`);
  }
}
if (problems > 0) {
  process.stdout.write(`\n${problems} file(s) out of place. See docs/modules/file-layout.md.\n`);
  process.exit(1);
}
process.stdout.write(`check:layout ok (${scanned} files)\n`);
