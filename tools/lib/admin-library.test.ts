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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), 'bk-admin-library-'));

afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

function pack(folder: string): string {
  const destination = join(TEMP, 'packs', folder);
  const packed = (): string | undefined =>
    existsSync(destination) ? readdirSync(destination).find((file) => file.endsWith('.tgz')) : undefined;
  if (packed() === undefined) {
    mkdirSync(destination, { recursive: true });
    execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: join(ROOT, folder), stdio: 'pipe' });
  }
  return join(destination, packed() ?? '');
}

const folderOf = (name: string): string => {
  const bare = name.replace('@bieberkit/', '');
  return bare.startsWith('plugin-') ? `plugins/${bare.slice('plugin-'.length)}` : `packages/${bare}`;
};

/** The packages of this repository that installing `names` can ask for: their dependencies and their peers, and theirs. */
function closureOf(names: readonly string[]): readonly string[] {
  const found = new Set<string>();
  const queue = [...names];
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (found.has(name)) continue;
    found.add(name);
    const manifest: Record<string, unknown> = JSON.parse(
      readFileSync(join(ROOT, folderOf(name), 'package.json'), 'utf8'),
    );
    const asked = { ...Object(manifest['dependencies']), ...Object(manifest['peerDependencies']) };
    queue.push(...Object.keys(asked).filter((dependency) => dependency.startsWith('@bieberkit/')));
  }
  return [...found].toSorted();
}

/** A project of its own, whose packages of this repository are tarballs. */
function consumer(
  folder: string,
  dependencies: readonly string[],
  devDependencies: Readonly<Record<string, string>> = {},
): { readonly cwd: string; readonly put: (path: string, text: string) => void } {
  const cwd = join(TEMP, folder);
  const put = (path: string, text: string): void => {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const packed = new Map(closureOf(dependencies).map((name) => [name, `file:${pack(folderOf(name))}`]));
  put(
    'package.json',
    JSON.stringify({
      name: folder,
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(dependencies.map((name) => [name, packed.get(name)])),
      devDependencies,
    }),
  );
  // The tarballs stand for the registry, which is why this temporary project alone lets a dependency name a file. The one build
  // script of the dependencies is denied, as in this repository and in a new project (ADR 0020): no script runs.
  put(
    'pnpm-workspace.yaml',
    `packages: []\nminimumReleaseAge: 10080\nblockExoticSubdeps: false\nallowBuilds:\n  msgpackr-extract: false\noverrides:\n${[...packed].map(([name, file]) => `  '${name}': '${file}'\n`).join('')}`,
  );
  return { cwd, put };
}

const install = (cwd: string): void =>
  void execFileSync('pnpm', ['install', '--reporter=silent'], { cwd, stdio: 'pipe' });

const BUILD_TOOLS = { vite: '8.3.8', '@vitejs/plugin-react': '6.3.0' };
const PAGE =
  '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>\n';

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
  const { cwd, put } = consumer('consumer', ['@bieberkit/admin-antd'], BUILD_TOOLS);
  put('index.html', PAGE);
  put('main.js', MAIN);
  put('vite.config.js', CONFIG);
  install(cwd);
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

it('UI-37 the packed users plugin ships its admin part, and installing it for a server brings no React', () => {
  const files = execFileSync('tar', ['-tf', pack('plugins/users')], { encoding: 'utf8' }).split('\n');
  for (const file of ['admin/index.js', 'admin/index.d.ts', 'admin/SignIn.js', 'admin/account.module.css'])
    expect(files).toContain(`package/dist/${file}`);
  expect(files.filter((file) => file.startsWith('package/src/'))).toEqual([]);
  const { cwd } = consumer('server', ['@bieberkit/plugin-users']);
  install(cwd);
  const installed = readdirSync(join(cwd, 'node_modules', '.pnpm'));
  expect(installed.filter((folder) => /^(react|react-dom|antd|@tanstack\+react-query)@/.test(folder))).toEqual([]);
}, 600_000);

const WITH_USERS = `import { startAdmin } from '@bieberkit/admin-antd';
import users from '@bieberkit/plugin-users/admin';

const root = document.getElementById('root');
if (root !== null) startAdmin(root, { parts: [users] });
`;

it('UI-37 an admin builds with the screens of the packed users plugin, their styles and one copy of React', () => {
  const { cwd, put } = consumer('with-users', ['@bieberkit/admin-antd', '@bieberkit/plugin-users'], BUILD_TOOLS);
  // The optional peers of the plugin, which `apps/admin` of a project names with the versions of the shell.
  const manifest: Record<string, unknown> = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  manifest['dependencies'] = {
    ...Object(manifest['dependencies']),
    '@bieberkit/admin-core': `file:${pack('packages/admin-core')}`,
    '@tanstack/react-query': '5.108.0',
    antd: '6.7.1',
    react: '19.3.1',
    'react-dom': '19.3.1',
  };
  put('package.json', JSON.stringify(manifest));
  put('index.html', PAGE);
  put('main.js', WITH_USERS);
  put('vite.config.js', CONFIG);
  install(cwd);
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd, stdio: 'pipe' });
  const assets = readdirSync(join(cwd, 'dist', 'assets'));
  expect(assets.some((file) => /^SignIn-.*\.js$/.test(file))).toBe(true);
  const css = assets
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(cwd, 'dist', 'assets', file), 'utf8'))
    .join('\n');
  // A rule of the CSS module of the account screens, whose class names the build makes its own.
  expect(css).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  expect(JSON.parse(readFileSync(join(cwd, 'copies.json'), 'utf8'))).toEqual({
    react: 1,
    'react-dom': 1,
    antd: 1,
    '@bieberkit/admin-core': 1,
  });
}, 600_000);
