/**
 * BieberKit
 *
 * @file        tools/admin-size.test.ts
 * @description Tests of the measure of the initial JavaScript of the admin (UI-07, section 18.1).
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_BUDGET_BYTES, initialScripts, measureAdmin } from './lib/admin-size.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="./assets/index-a.js"></script>
<link rel="modulepreload" crossorigin href="./assets/vendor-b.js">
<link rel="modulepreload" crossorigin href="./assets/index-a.js">
<link rel="stylesheet" href="./assets/style.css">
<script src="./assets/classic.js"></script>
</head><body></body></html>`;

describe('UI-07 the budget of the initial JavaScript', () => {
  it('UI-07 the initial scripts are the module entry and what it preloads, each once, and not a style or a classic script', () => {
    expect(initialScripts(HTML)).toEqual(['assets/index-a.js', 'assets/vendor-b.js']);
  });

  it('UI-07 the size is the compressed size of those files, and a screen that is loaded later is not in it', () => {
    const folder = mkdtempSync(join(tmpdir(), 'bk-size-'));
    folders.push(folder);
    mkdirSync(join(folder, 'assets'));
    writeFileSync(join(folder, 'index.html'), HTML);
    writeFileSync(join(folder, 'assets', 'index-a.js'), 'a'.repeat(50_000));
    writeFileSync(join(folder, 'assets', 'vendor-b.js'), 'b'.repeat(50_000));
    writeFileSync(join(folder, 'assets', 'Later-c.js'), 'c'.repeat(5_000_000));
    const measured = measureAdmin(folder);
    expect(measured.files.map((file) => file.path)).toEqual(['assets/index-a.js', 'assets/vendor-b.js']);
    expect(measured.total).toBeGreaterThan(0);
    expect(measured.total).toBeLessThan(ADMIN_BUDGET_BYTES);
  });

  it('UI-07 the budget is 400 kB', () => {
    expect(ADMIN_BUDGET_BYTES).toBe(400_000);
  });
});
