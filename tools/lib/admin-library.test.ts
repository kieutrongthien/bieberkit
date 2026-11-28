/**
 * BieberKit
 *
 * @file        tools/lib/admin-library.test.ts
 * @description Test of @bieberkit/admin-antd as a library: a project outside the repository, with the packed packages only, builds an admin with the styles, the font and the logo, and with one copy of React (UI-37, ADR 0040).
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

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), 'bk-admin-library-'));
const PACKAGES = ['tokens', 'admin-core', 'admin-antd'];

afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

function pack(name: string): string {
  const destination = join(TEMP, 'packs', name);
  mkdirSync(destination, { recursive: true });
  execFileSync('pnpm', ['pack', '--pack-destination', destination], {
    cwd: join(ROOT, 'packages', name),
    stdio: 'pipe',
  });
  return join(destination, readdirSync(destination).find((file) => file.endsWith('.tgz')) ?? '');
}

const put = (path: string, text: string): void => {
  mkdirSync(join(TEMP, 'consumer', path, '..'), { recursive: true });
  writeFileSync(join(TEMP, 'consumer', path), text);
};

const MAIN = `import { startAdmin } from '@bieberkit/admin-antd';

const root = document.getElementById('root');
if (root !== null) startAdmin(root, { parts: [] });
`;

/** Counts the folders that a bundle takes each of these packages from. */
const CONFIG = `import { writeFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const NAMES = ['react', 'react-dom', 'antd', '@bieberkit/admin-core'];
const copies = {
  name: 'count-copies',
  generateBundle(_options, bundle) {
    const found = Object.fromEntries(NAMES.map((name) => [name, new Set()]));
    for (const chunk of Object.values(bundle))
      for (const id of chunk.moduleIds ?? [])
        for (const name of NAMES) {
          const at = id.lastIndexOf('/node_modules/' + name + '/');
          if (at !== -1) found[name].add(id.slice(0, at));
        }
    writeFileSync('copies.json', JSON.stringify(Object.fromEntries(NAMES.map((n) => [n, found[n].size]))));
  },
};

export default defineConfig({ base: './', plugins: [react(), copies], build: { modulePreload: { polyfill: false }, assetsInlineLimit: 0 } });
`;

it('UI-37 a project with the packed packages builds the admin from the library, with its styles, font and logo', () => {
  const overrides = PACKAGES.map((name) => [`@bieberkit/${name}`, `file:${pack(name)}`] as const);
  put(
    'package.json',
    JSON.stringify({
      name: 'consumer',
      private: true,
      type: 'module',
      dependencies: { '@bieberkit/admin-antd': overrides.at(-1)?.[1] },
      devDependencies: { vite: '8.3.8', '@vitejs/plugin-react': '6.3.0' },
    }),
  );
  // The tarballs stand for the registry, which is why this temporary project alone lets a dependency name a file.
  put(
    'pnpm-workspace.yaml',
    `packages: []\nminimumReleaseAge: 10080\nblockExoticSubdeps: false\noverrides:\n${overrides.map(([name, file]) => `  '${name}': '${file}'\n`).join('')}`,
  );
  put(
    'index.html',
    '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>\n',
  );
  put('main.js', MAIN);
  put('vite.config.js', CONFIG);
  const cwd = join(TEMP, 'consumer');
  execFileSync('pnpm', ['install', '--reporter=silent'], { cwd, stdio: 'pipe' });
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd, stdio: 'pipe' });
  const assets = readdirSync(join(cwd, 'dist', 'assets'));
  expect(assets.filter((file) => file.endsWith('.css')).length).toBeGreaterThan(0);
  expect(assets.filter((file) => file.endsWith('.woff2')).length).toBeGreaterThan(0);
  expect(assets.filter((file) => /^logo-.*\.svg$/.test(file))).toHaveLength(1);
  const css = assets
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(cwd, 'dist', 'assets', file), 'utf8'))
    .join('\n');
  expect(css).toContain('Be Vietnam Pro');
  expect(css).toContain('.bk-rail');
  expect(JSON.parse(readFileSync(join(cwd, 'copies.json'), 'utf8'))).toEqual({
    react: 1,
    'react-dom': 1,
    antd: 1,
    '@bieberkit/admin-core': 1,
  });
}, 600_000);
