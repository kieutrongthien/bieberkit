/**
 * BieberKit
 *
 * @file        packages/create/src/index.test.ts
 * @description Smoke test for the create-bieberkit entry point.
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

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('create-bieberkit', () => {
  it('exposes its npm name', () => {
    expect(packageName).toBe('create-bieberkit');
  });
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLED = [
  '@clack/prompts',
  '@clack/core',
  'sisteransi',
  'fast-wrap-ansi',
  'fast-string-width',
  'fast-string-truncated-width',
];

describe('ADR-0029 clack is bundled', () => {
  it('ADR-0029 the published dist imports no @clack package, and NOTICE names each bundled one', () => {
    const dist = join(ROOT, 'dist');
    const files = readdirSync(dist);
    for (const file of files.filter((name) => name.endsWith('.js')))
      expect(`${file}: ${readFileSync(join(dist, file), 'utf8')}`).not.toMatch(/from\s*["'](?:@clack\/|sisteransi|fast-)/);
    for (const file of files.filter((name) => name.endsWith('.d.ts')))
      expect(`${file}: ${readFileSync(join(dist, file), 'utf8')}`).not.toContain('@clack');
    const manifest: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(Object.keys(Object(Reflect.get(Object(manifest), 'dependencies')))).not.toContain('@clack/prompts');
    const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
    for (const name of BUNDLED) expect(notice).toContain(name);
  });
});
