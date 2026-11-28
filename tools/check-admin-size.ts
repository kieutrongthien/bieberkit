/**
 * BieberKit
 *
 * @file        tools/check-admin-size.ts
 * @description Fails when the initial JavaScript of the built admin is over the budget of the spec (UI-07, section 18.1). Run it after the build.
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

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ADMIN_BUDGET_BYTES, measureAdmin } from './lib/admin-size.ts';

// The admin is built by a project, so the folder is the `apps/admin/dist` of one.
const directory = resolve(process.argv[2] ?? join('apps', 'admin', 'dist'));
if (!existsSync(join(directory, 'index.html'))) {
  console.error(
    `check:admin-size: ${directory} has no index.html. Give the apps/admin/dist of a built project. pnpm test:e2e builds one and checks it.`,
  );
  process.exit(1);
}
const { files, total } = measureAdmin(directory);
for (const file of files) console.log(`  ${String(file.gzip).padStart(8)} B  ${file.path}`);
const kb = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`;
if (total > ADMIN_BUDGET_BYTES) {
  console.error(
    `check:admin-size: the initial JavaScript is ${kb(total)} compressed, over the budget of ${kb(ADMIN_BUDGET_BYTES)}.`,
  );
  process.exit(1);
}
console.log(`check:admin-size ok (${kb(total)} of ${kb(ADMIN_BUDGET_BYTES)})`);
