/**
 * BieberKit
 *
 * @file        packages/server/src/project-import.test.ts
 * @description Tests that a TypeScript file of a project is read again when it changes, also when the time of the file has a fraction.
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

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importFile } from './project.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'bk-import-'));
  roots.push(root);
  writeFileSync(join(root, 'types.ts'), 'export interface Settings { readonly name: string }\n');
  return root;
}

describe('section 7.2 importFile', () => {
  it('7.2 reads a TypeScript file with a type import when its time has a fraction of a millisecond', async () => {
    const root = project();
    const file = join(root, 'config.ts');
    writeFileSync(
      file,
      "import type { Settings } from './types.ts';\nconst settings: Settings = { name: 'demo' };\nexport default settings;\n",
    );
    // A time in seconds with a fraction: the address of the module must not turn it into something that looks like an extension.
    utimesSync(file, 1_700_000_000.123_456, 1_700_000_000.123_456);
    expect(await importFile(file)).toEqual({ name: 'demo' });
  });

  it('7.2 reads a file again after it was edited', async () => {
    const root = project();
    const file = join(root, 'config.ts');
    writeFileSync(file, "export default { name: 'first' };\n");
    utimesSync(file, 1_700_000_100, 1_700_000_100);
    expect(await importFile(file)).toEqual({ name: 'first' });
    writeFileSync(file, "export default { name: 'second' };\n");
    utimesSync(file, 1_700_000_200, 1_700_000_200);
    expect(await importFile(file)).toEqual({ name: 'second' });
  });
});
