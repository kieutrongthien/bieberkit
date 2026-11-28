/**
 * BieberKit
 *
 * @file        tools/check-shared-admin.ts
 * @description Fails when a shared package of the admin names a first-party plugin or one of its routes (UI-34).
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

// Usage: node tools/check-shared-admin.ts

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { findPluginKnowledge, isShared } from './lib/shared-admin.ts';

const ROOT = resolve(import.meta.dirname, '..');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let scanned = 0;
let problems = 0;
for (const name of ['admin-core', 'admin-antd']) {
  for (const path of walk(join(ROOT, 'packages', name, 'src'))) {
    const file = relative(ROOT, path).split('\\').join('/');
    if (!isShared(file)) continue;
    scanned++;
    for (const violation of findPluginKnowledge(file, readFileSync(path, 'utf8'))) {
      problems++;
      process.stdout.write(
        `${violation.file}:${violation.line}  UI-34  ${violation.found}\n    Fix: ${violation.fix}\n`,
      );
    }
  }
}
if (problems > 0) {
  process.stdout.write(
    `\n${problems} line(s) of a shared package of the admin know a first-party plugin. Standard: UI-34.\n`,
  );
  process.exit(1);
}
process.stdout.write(`check:shared-admin ok (${scanned} files)\n`);
