/**
 * BieberKit
 *
 * @file        tools/check-env-access.ts
 * @description Fails when code outside packages/core/src/config/ reads the process environment (CFG-02, P8).
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

// Usage: node tools/check-env-access.ts
// Walks packages/, plugins/, templates/ and examples/. Exit code 1 when a file other than the core config reads the environment.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { findEnvAccess, isScanned, SCANNED_ROOTS } from './lib/env-access.ts';

const ROOT = resolve(import.meta.dirname, '..');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

let scanned = 0;
let problems = 0;
for (const top of SCANNED_ROOTS) {
  const dir = join(ROOT, top);
  let files: string[];
  try {
    files = [...walk(dir)];
  } catch {
    continue;
  }
  for (const abs of files) {
    const rel = relative(ROOT, abs).split('\\').join('/');
    if (!isScanned(rel)) continue;
    scanned++;
    for (const v of findEnvAccess(rel, readFileSync(abs, 'utf8'))) {
      problems++;
      process.stdout.write(`${v.file}:${v.line}  CFG-02  ${v.text}\n    Fix: ${v.fix}\n`);
    }
  }
}
if (problems > 0) {
  process.stdout.write(
    `\n${problems} read(s) of the environment outside packages/core/src/config/. Standard: CFG-02, P8.\n`,
  );
  process.exit(1);
}
process.stdout.write(`check:env-access ok (${scanned} files)\n`);
