/**
 * BieberKit
 *
 * @file        tools/lib/plugin-manifests.test.ts
 * @description Tests of first-party manifest generation, deterministic output and read-only drift detection (PLG-07).
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

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { makeProject } from '../../packages/cli/src/testing/project.ts';
import type { Fixture } from '../../packages/cli/src/testing/project.ts';

const fixtures: Fixture[] = [];
const script = fileURLToPath(new URL('../plugin-manifests.ts', import.meta.url));
const INDEX = 'packages/create/src/scaffold/plugin-index.ts';
const MANIFEST = {
  core: '*',
  dialects: ['sqlite'],
  requires: {},
  conflicts: [],
  env: [],
  tables: [],
  routes: [],
  permissions: ['demo.read'],
  admin: [],
};

function fixture(): Fixture {
  const made = makeProject({
    files: {
      'plugins/demo/package.json':
        JSON.stringify(
          {
            name: '@bieberkit/plugin-demo',
            version: '1.2.3',
            type: 'module',
            exports: { '.': './index.mjs' },
            description: 'Preserve me',
          },
          null,
          2,
        ) + '\n',
      'plugins/demo/index.mjs': `import { definePlugin } from '@bieberkit/core';
export default definePlugin({ name: '@bieberkit/plugin-demo', version: '1.2.3',
core: '*', dialects: ['sqlite'], permissions: ['demo.read'] });`,
    },
  });
  fixtures.push(made);
  return made;
}

function run(root: string, write = false): { code: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    ['--conditions=@bieberkit/source', script, '--root', root, ...(write ? ['--write'] : [])],
    { cwd: root, encoding: 'utf8' },
  );
  return { code: result.status, output: result.stdout + result.stderr };
}

function text(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

afterEach(() => {
  for (const made of fixtures.splice(0)) made.cleanup();
});

it('PLG-07 generation writes executable bundled metadata and preserves package fields', async () => {
  const { root } = fixture();
  expect(run(root, true)).toMatchObject({ code: 0 });
  const pkg: unknown = JSON.parse(text(root, 'plugins/demo/package.json'));
  expect(pkg).toMatchObject({ version: '1.2.3', description: 'Preserve me', bieberkit: MANIFEST });
  const loaded: unknown = await import(pathToFileURL(join(root, INDEX)).href);
  expect(Reflect.get(Object(loaded), 'BUILTIN_PLUGIN_INDEX')).toEqual({
    '@bieberkit/plugin-demo': { version: '1.2.3', manifest: MANIFEST },
  });
});

it('PLG-07 generation is deterministic and its read-only check does not change files', () => {
  const { root } = fixture();
  expect(run(root, true).code).toBe(0);
  const pkg = text(root, 'plugins/demo/package.json');
  const index = text(root, INDEX);
  expect(run(root, true).code).toBe(0);
  expect(run(root).code).toBe(0);
  expect(text(root, 'plugins/demo/package.json')).toBe(pkg);
  expect(text(root, INDEX)).toBe(index);
});

it('PLG-07 a missing committed field fails checking without creating an index', () => {
  const { root } = fixture();
  const before = text(root, 'plugins/demo/package.json');
  const result = run(root);
  expect(result.code).toBe(1);
  expect(result.output).toContain('PLG_MANIFEST_MISSING');
  expect(text(root, 'plugins/demo/package.json')).toBe(before);
  expect(existsSync(join(root, INDEX))).toBe(false);
});

it('PLG-07 a stale bundled index fails checking instead of repairing itself', () => {
  const { root } = fixture();
  expect(run(root, true).code).toBe(0);
  const stale = text(root, INDEX) + '\nexport const stale = true;\n';
  writeFileSync(join(root, INDEX), stale);
  const result = run(root);
  expect(result.code).toBe(1);
  expect(result.output).toContain('BK_PLUGIN_INDEX_STALE');
  expect(text(root, INDEX)).toBe(stale);
});

it('PLG-07 a stale package field fails checking without rewriting it', () => {
  const { root } = fixture();
  expect(run(root, true).code).toBe(0);
  const stale = text(root, 'plugins/demo/package.json').replace('demo.read', 'demo.old');
  writeFileSync(join(root, 'plugins/demo/package.json'), stale);
  const result = run(root);
  expect(result.code).toBe(1);
  expect(result.output).toContain('PLG_MANIFEST_STALE');
  expect(text(root, 'plugins/demo/package.json')).toBe(stale);
});
