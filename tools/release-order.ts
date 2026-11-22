/**
 * BieberKit
 *
 * @file        tools/release-order.ts
 * @description Prints the publish order of the workspace packages, one line each: name, version and tarball file.
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

// Usage: node tools/release-order.ts > PUBLISH_ORDER
// The release build job writes this file next to the tarballs. The publish job reads it, because that job
// has no checkout (SEC-21) and cannot run this tool. Fields are separated by a tab.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Pkg, publishOrder } from './lib/release-order.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES = join(ROOT, 'packages');

const packages: Pkg[] = [];
for (const dir of readdirSync(PACKAGES).toSorted()) {
  const parsed: unknown = JSON.parse(readFileSync(join(PACKAGES, dir, 'package.json'), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('name' in parsed) || !('version' in parsed)) {
    throw new Error(`packages/${dir}/package.json needs a name and a version.`);
  }
  packages.push({ name: String(parsed.name), version: String(parsed.version) });
}
for (const e of publishOrder(packages)) process.stdout.write(`${e.name}\t${e.version}\t${e.file}\n`);
