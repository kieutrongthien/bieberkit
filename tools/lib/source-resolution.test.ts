/**
 * BieberKit
 *
 * @file        tools/lib/source-resolution.test.ts
 * @description Proves Node tests resolve real workspace sources without a dist directory on a clean checkout (TST-01).
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

import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';

const run = promisify(execFile);
const PROJECT = resolve(import.meta.dirname, '../..');

it('TST-01 Node tests import an unbuilt workspace package through its source condition', async () => {
  mkdirSync(join(PROJECT, '.tmp'), { recursive: true });
  const root = mkdtempSync(join(PROJECT, '.tmp/source-resolution-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const core = join(root, 'node_modules/@bieberkit/core');
  mkdirSync(core, { recursive: true });
  cpSync(join(PROJECT, 'packages/core/package.json'), join(core, 'package.json'));
  cpSync(join(PROJECT, 'packages/core/src'), join(core, 'src'), { recursive: true });
  // Copy the real package's manifest and sources, deliberately leaving its default dist entry absent.
  writeFileSync(
    join(root, 'entry.test.ts'),
    `
import { expect, it } from 'vitest';
import { BkError } from '@bieberkit/core';
it('resolves the unbuilt core package', () => {
  expect(new BkError('Source resolution probe', { code: 'TEST_COLD_SOURCE', status: 400 }))
    .toMatchObject({ code: 'TEST_COLD_SOURCE', status: 400 });
});
`,
  );
  const config = pathToFileURL(join(PROJECT, 'vitest.config.ts')).href;
  writeFileSync(
    join(root, 'vitest.config.ts'),
    `
import { defineConfig } from 'vitest/config';
import base from ${JSON.stringify(config)};
export default defineConfig({
  ...base,
  root: import.meta.dirname,
  test: {
    ...base.test,
    include: ['entry.test.ts'], exclude: [], setupFiles: [],
    coverage: { enabled: false }, maxWorkers: 1,
  },
});
`,
  );
  const cli = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url));
  const { stdout } = await run(
    process.execPath,
    [cli, 'run', '--config', join(root, 'vitest.config.ts'), '--reporter=json'],
    {
      cwd: PROJECT,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const result: unknown = JSON.parse(stdout);
  expect(result).toMatchObject({ success: true, numPassedTests: 1 });
}, 30_000);
