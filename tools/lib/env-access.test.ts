/**
 * BieberKit
 *
 * @file        tools/lib/env-access.test.ts
 * @description Tests for the rule that only packages/core/src/config/ reads the process environment (CFG-02, P8).
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

import { describe, expect, it } from 'vitest';
import { findEnvAccess, isScanned } from './env-access.ts';

const CONFIG = 'packages/core/src/config/load-env.ts';
const OTHER = 'packages/core/src/index.ts';

describe('CFG-02 findEnvAccess', () => {
  it('CFG-02 allows process.env inside packages/core/src/config/', () => {
    expect(findEnvAccess(CONFIG, 'const real = process.env;')).toEqual([]);
  });

  it('CFG-02 flags process.env anywhere else, with the line number', () => {
    const found = findEnvAccess(OTHER, 'const a = 1;\nconst key = process.env.APP_KEY;\n');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: OTHER, line: 2 });
    expect(found[0]?.fix).toContain('loadEnv');
  });

  it.each([
    ['dot access', 'const a = process.env.X;'],
    ['bracket access', "const a = process['env'].X;"],
    ['double quoted bracket', 'const a = process["env"].X;'],
    ['global process', 'const a = globalThis.process.env.X;'],
    ['named import of env', "import { env } from 'node:process';"],
    ['named import without node:', "import { env as e } from 'process';"],
    ['destructuring from process', 'const { env } = process;'],
    ['loading a file into the environment', "process.loadEnvFile('.env');"],
  ])('CFG-02 flags %s', (_name, code) => {
    expect(findEnvAccess('packages/http/src/x.ts', code)).toHaveLength(1);
  });

  it('CFG-02 ignores comments', () => {
    const code = '// reads process.env here\n/* process.env */\n * process.env in a block comment\nconst a = 1;\n';
    expect(findEnvAccess(OTHER, code)).toEqual([]);
  });

  it('CFG-02 does not flag unrelated code', () => {
    const code = "import { argv } from 'node:process';\nconst environment = 'x';\nconst a = process.argv;\n";
    expect(findEnvAccess(OTHER, code)).toEqual([]);
  });

  it('CFG-02 the config folder of another package is not allowed', () => {
    expect(findEnvAccess('packages/data/src/config/x.ts', 'process.env.X')).toHaveLength(1);
  });

  it('CFG-02 a sibling folder with a similar name is not allowed', () => {
    expect(findEnvAccess('packages/core/src/config-extra/x.ts', 'process.env.X')).toHaveLength(1);
  });

  it('CFG-02 reports every line', () => {
    expect(findEnvAccess(OTHER, 'process.env.A;\nprocess.env.B;')).toHaveLength(2);
  });
});

describe('CFG-02 isScanned', () => {
  it.each([
    ['packages/core/src/a.ts', true],
    ['packages/data/src/a.tsx', true],
    ['plugins/seo/src/a.ts', true],
    ['templates/app/src/a.ts', true],
    ['packages/core/dist/a.js', false],
    ['packages/core/node_modules/x/a.js', false],
    ['tools/a.ts', false],
    ['packages/core/README.md', false],
    ['packages/core/api/index.api.md', false],
  ])('CFG-02 %s scanned: %s', (path, expected) => {
    expect(isScanned(path)).toBe(expected);
  });
});
