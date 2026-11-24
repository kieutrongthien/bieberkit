/**
 * BieberKit
 *
 * @file        packages/cli/src/create.test.ts
 * @description Tests of bieberkit create and of the loop of a new project: it is made, its files pass bieberkit check, and the CLI reads its config, its environment and its application (section 5.1, section 5.2).
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

import { mkdtempSync, rmSync, symlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './run.ts';
import { linkBasePlugins } from './testing/project.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function run(cwd: string, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { stdout: (text) => out.push(text), stderr: (text) => err.push(text), cwd });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return { code, out: out.join(''), err: err.join(''), data: Object(json['data']), error: Object(json['error']) };
}

/** Makes a project with the command, and links the packages of this repository where `pnpm install` would put them. */
async function made(...flags: string[]): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), 'bk-new-'));
  roots.push(cwd);
  const result = await run(cwd, [
    'create',
    'demo',
    '--yes',
    '--no-install',
    '--no-git',
    '--author',
    'Ada Lovelace <ada@example.com>',
    ...flags,
    '--json',
  ]);
  expect(result.code).toBe(0);
  const root = join(cwd, 'demo');
  mkdirSync(join(root, 'node_modules/@bieberkit'), { recursive: true });
  for (const name of ['core', 'data', 'http', 'queue', 'auth', 'log'])
    symlinkSync(join(PACKAGES, name), join(root, 'node_modules/@bieberkit', name), 'dir');
  symlinkSync(join(PACKAGES, 'data', 'node_modules', 'zod'), join(root, 'node_modules/zod'), 'dir');
  linkBasePlugins(root);
  return root;
}

describe('section 5.1 bieberkit create', () => {
  it('5.1 is an alias of create-bieberkit: the same flags, the same project', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'bk-new-'));
    roots.push(cwd);
    const { code, data } = await run(cwd, [
      'create',
      'demo',
      '--db',
      'mysql',
      '--yes',
      '--no-install',
      '--no-git',
      '--author',
      'A B <a@b.co>',
      '--json',
    ]);
    expect([code, data.dialect, data.template]).toEqual([0, 'mysql', 'blank']);
    expect(readFileSync(join(cwd, 'demo/bieberkit.config.ts'), 'utf8')).toContain("dialect: 'mysql'");
  });

  it('5.1 the help of bieberkit lists create', async () => {
    expect((await run(process.cwd(), [])).out).toMatch(/create\s+Make a project/);
  });
});

describe('section 6 a new project is a project that the CLI understands', () => {
  it('6 the config loads, the plugin graph resolves, and the environment that was written is valid', async () => {
    const root = await made();
    const order: unknown = (await run(root, ['plugins', '--json'])).data['order'];
    expect(Array.isArray(order) ? order.length : 0).toBe(6);
    const env = await run(root, ['env:check', '--json']);
    expect(env.code).toBe(0);
    expect(env.data).toMatchObject({ valid: true });
  });

  it('5.4 .env.example is what bieberkit env:example gives, so check passes at once', async () => {
    const root = await made();
    expect((await run(root, ['env:example', '--check'])).code).toBe(0);
  });

  it('23.7 every file passes the rules of bieberkit check, after generate has written the client', async () => {
    const root = await made();
    expect((await run(root, ['generate'])).code).toBe(0);
    const checked = await run(root, ['check', '--json']);
    expect(checked.data.violations).toEqual([]);
    expect(checked.code).toBe(0);
  });

  it('5.2 make:module and make:entity work in it, and its first routes are those of the entity', async () => {
    const root = await made();
    await run(root, ['make:module', 'crm']);
    await run(root, ['make:entity', 'crm.Deal']);
    expect((await run(root, ['routes'])).out).toContain('/api/v1/crm/deals');
    expect((await run(root, ['generate'])).code).toBe(0);
    expect((await run(root, ['check'])).code).toBe(0);
  });
});
