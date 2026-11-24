/**
 * BieberKit
 *
 * @file        tools/lib/plugin-artifacts.test.ts
 * @description Tests the actual plugin and scaffolder tarballs after a build, without installed runtime plugin packages (PLG-07).
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), 'bk-plugin-artifacts-'));
const PLUGINS = ['audit-log', 'media', 'notifications', 'roles', 'settings', 'users'];

function json(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object');
  return Object.fromEntries(Object.entries(value));
}

function pack(folder: string, name: string): string {
  const destination = join(TEMP, name);
  mkdirSync(destination, { recursive: true });
  execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: folder, stdio: 'pipe' });
  const files = readdirSync(destination).filter((file) => file.endsWith('.tgz'));
  if (files.length !== 1) throw new Error('Expected one package tarball');
  return join(destination, files[0] ?? '');
}

afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

it('PLG-07 all packed first-party plugins retain their canonical static metadata and release identity', () => {
  for (const name of PLUGINS) {
    const folder = join(ROOT, 'plugins', name);
    const source = json(readFileSync(join(folder, 'package.json'), 'utf8'));
    const archive = pack(folder, name);
    const packed = json(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
    expect(packed).toMatchObject({ name: source['name'], version: source['version'], bieberkit: source['bieberkit'] });
    expect(packed['bieberkit']).toBeDefined();
    const files = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' });
    expect(files).toContain('package/dist/index.js');
    expect(files).toContain('package/dist/index.d.ts');
    expect(files).toContain('package/LICENSE');
    expect(files).toContain('package/README.md');
  }
}, 30_000);

it('PLG-07 the packed scaffolder resolves its bundled graph with no plugin packages installed', () => {
  const archive = pack(join(ROOT, 'packages/create'), 'scaffolder');
  const isolated = join(TEMP, 'isolated');
  mkdirSync(join(isolated, 'node_modules/@bieberkit'), { recursive: true });
  // The scaffolder depends on core, which itself has only Node.js built-ins. No plugin is installed here.
  symlinkSync(join(ROOT, 'packages/core'), join(isolated, 'node_modules/@bieberkit/core'), 'dir');
  execFileSync('tar', ['-xzf', archive, '-C', isolated]);
  expect(existsSync(join(isolated, 'node_modules/@bieberkit/plugin-users'))).toBe(false);
  const program = `import { BUILTIN_PLUGIN_INDEX } from './package/dist/index.js';
import { resolvePlugins } from '@bieberkit/core';
const plugins = Object.entries(BUILTIN_PLUGIN_INDEX).map(([name, entry]) => ({ name, ...entry }));
const orders = ['postgres', 'mysql', 'sqlite'].map(dialect => resolvePlugins(plugins, { core: '0.0.0', dialect }).order);
console.log(JSON.stringify({ index: BUILTIN_PLUGIN_INDEX, orders }));`;
  const result = json(
    execFileSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: isolated,
      encoding: 'utf8',
    }),
  );
  for (const name of PLUGINS) {
    const pkg = json(readFileSync(join(ROOT, 'plugins', name, 'package.json'), 'utf8'));
    expect(Reflect.get(Object(result['index']), `@bieberkit/plugin-${name}`)).toMatchObject({
      version: pkg['version'],
      manifest: pkg['bieberkit'],
    });
  }
  expect(result['orders']).toHaveLength(3);
  const orders = result['orders'];
  if (!Array.isArray(orders)) throw new Error('Expected dialect orders');
  for (const value of orders) {
    const order: unknown = value;
    if (!Array.isArray(order) || !order.every((item: unknown) => typeof item === 'string'))
      throw new Error('Expected plugin names');
    expect(order).toHaveLength(6);
    expect(order.indexOf('@bieberkit/plugin-roles')).toBeLessThan(order.indexOf('@bieberkit/plugin-users'));
  }
}, 30_000);
