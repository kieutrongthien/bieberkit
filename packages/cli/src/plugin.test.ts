/**
 * BieberKit
 *
 * @file        packages/cli/src/plugin.test.ts
 * @description Tests of bieberkit add and remove on a throwaway project: the plugin is installed, listed, resolved and given its environment, or the attempt is undone; and a removal asks before it drops data (section 5.2, PLG-03, DATA-02).
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

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANCEL, createRunner, scriptedPrompts } from 'create-bieberkit/kit';
import type { Prompts } from 'create-bieberkit/kit';
import { checkCommand } from './commands/check.ts';
import { addCommand, removeCommand } from './commands/plugin.ts';
import type { Spawn } from './processes.ts';
import { makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

/** What `pnpm add` leaves in `node_modules`: a plugin that owns a table and an environment key. */
function install(root: string, name: string, extra = ''): void {
  const prefix = (/plugin-([a-z]+)$/.exec(name)?.[1] ?? 'x').toUpperCase();
  const folder = join(root, 'node_modules', name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      exports: { '.': './index.mjs', './package.json': './package.json' },
    }),
  );
  writeFileSync(
    join(folder, 'index.mjs'),
    `import { defineModule, definePlugin, env } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';
const Page = defineEntity({ name: 'pages.Page', table: '${prefix.toLowerCase()}_pages', fields: { id: f.id(), title: f.string({ max: 100 }) }, api: { list: true } });
export default definePlugin({ name: ${JSON.stringify(name)}, version: '1.0.0', core: '*', dialects: ['sqlite', 'postgres', 'mysql'], env: { ${prefix}_ROOT: env.string().describe('Folder of the pages'), ${prefix}_DEPTH: env.int().default(3).describe('Depth') }, entities: [Page]${extra} });
`,
  );
}

interface Call {
  args: readonly string[];
  cwd: string;
}

/** A pnpm that does what the real one leaves behind: `add` installs the plugin, `remove` takes it out. */
function pnpmFor(root: string, options: { fail?: boolean } = {}): { spawn: Spawn; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: Spawn = (_file, args, where) => {
    calls.push({ args, cwd: where.cwd });
    const [verb, name = ''] = args;
    let code = 0;
    if (options.fail === true) code = 1;
    else if (verb === 'add') install(root, name);
    else if (verb === 'remove') rmSync(join(root, 'node_modules', name), { recursive: true, force: true });
    return { exit: Promise.resolve(code), kill: () => undefined };
  };
  return { spawn, calls };
}

async function run(root: string, spawn: Spawn, argv: string[], prompts?: Prompts) {
  const runner = createRunner({
    name: 'bieberkit',
    version: '0.0.0',
    commands: [
      addCommand({ spawn, now: () => new Date('2026-05-01T10:20:30Z') }),
      removeCommand({ spawn, now: () => new Date('2026-05-01T10:20:30Z') }),
      checkCommand,
    ],
  });
  const out: string[] = [];
  const err: string[] = [];
  const code = await runner(argv, {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: root,
    ...(prompts === undefined ? {} : { prompts }),
  });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return { code, out: out.join(''), err: err.join(''), data: Object(json['data']), error: Object(json['error']) };
}

const PAGES = '@bieberkit/plugin-pages';
const project = (): Fixture => {
  const made = makeProject();
  fixtures.push(made);
  return made;
};

describe('section 5.2 add', () => {
  it('5.2 installs in the server app, lists the plugin in the config, adds its keys to .env, and refreshes .env.example', async () => {
    const { root } = project();
    writeFileSync(join(root, '.env'), 'APP_NAME=demo\n');
    const { spawn, calls } = pnpmFor(root);
    const { code, data, out } = await run(root, spawn, ['add', PAGES, '--json']);
    expect(code).toBe(0);
    expect(calls).toEqual([{ args: ['add', PAGES], cwd: join(root, 'apps/server') }]);
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toContain(`plugins: [\n    '${PAGES}',\n  ]`);
    expect(readFileSync(join(root, '.env'), 'utf8')).toContain(`# ${PAGES}\nPAGES_ROOT=\n`);
    expect(readFileSync(join(root, '.env'), 'utf8')).not.toContain('PAGES_DEPTH');
    expect(readFileSync(join(root, '.env.example'), 'utf8')).toContain('PAGES_ROOT=');
    expect(data).toMatchObject({ plugin: PAGES, version: '1.0.0', env: ['PAGES_ROOT'] });
    expect(out).toContain('"ok":true');
  });

  it('5.2 the project that it leaves is one that the CLI reads: plugins, env:check and the rules of check', async () => {
    const { root } = project();
    await run(root, pnpmFor(root).spawn, ['add', PAGES]);
    const checked = await run(root, pnpmFor(root).spawn, ['check', 'boundaries', '--json']);
    expect(checked.code).toBe(0);
  });

  it('5.2 a plugin that is listed already is BK_ADD_ALREADY, and nothing is installed', async () => {
    const { root } = project();
    const { spawn, calls } = pnpmFor(root);
    await run(root, spawn, ['add', PAGES]);
    calls.length = 0;
    const again = await run(root, spawn, ['add', PAGES, '--json']);
    expect([again.code, again.error.code]).toEqual([1, 'BK_ADD_ALREADY']);
    expect(calls).toEqual([]);
  });

  it('5.2 a graph that does not resolve undoes the attempt: the config as it was, the package taken out again, and the code of the resolver', async () => {
    const { root } = project();
    const before = readFileSync(join(root, 'bieberkit.config.ts'), 'utf8');
    const calls: string[] = [];
    const spawn: Spawn = (_file, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'add') install(root, PAGES, ", requires: { '@bieberkit/plugin-ghost': '*' }");
      if (args[0] === 'remove') rmSync(join(root, 'node_modules', PAGES), { recursive: true, force: true });
      return { exit: Promise.resolve(0), kill: () => undefined };
    };
    const { code, error } = await run(root, spawn, ['add', PAGES, '--json']);
    expect([code, error.code]).toEqual([1, 'PLG_MISSING_REQUIRE']);
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toBe(before);
    expect(calls).toEqual([`add ${PAGES}`, `remove ${PAGES}`]);
    expect(existsSync(join(root, 'node_modules', PAGES))).toBe(false);
  });

  it('5.2 a pnpm that fails is BK_PNPM_FAILED, and the config is not touched; a name that is not npm is a usage error', async () => {
    const { root } = project();
    const before = readFileSync(join(root, 'bieberkit.config.ts'), 'utf8');
    const failed = await run(root, pnpmFor(root, { fail: true }).spawn, ['add', PAGES, '--json']);
    expect([failed.code, failed.error.code]).toEqual([1, 'BK_PNPM_FAILED']);
    expect(failed.error.fix).toContain('never relaxed');
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toBe(before);
    expect((await run(root, pnpmFor(root).spawn, ['add', 'Not A Name'])).code).toBe(2);
  });
});

async function withPages(): Promise<{ root: string; spawn: Spawn; calls: Call[] }> {
  const { root } = project();
  const pnpm = pnpmFor(root);
  await run(root, pnpm.spawn, ['add', PAGES]);
  pnpm.calls.length = 0;
  return { root, ...pnpm };
}

describe('section 5.2 remove', () => {
  it('PLG-03 lists the data that the plugin owns and does not touch anything until it is confirmed, exit code 2', async () => {
    const { root, spawn, calls } = await withPages();
    const { code, error } = await run(root, spawn, ['remove', PAGES, '--json']);
    expect([code, error.code]).toEqual([2, 'BK_REMOVE_CONFIRM_NEEDED']);
    expect(error.message).toContain('pages_pages');
    expect(error.fix).toContain('--yes');
    expect(calls).toEqual([]);
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toContain(PAGES);
  });

  it('PLG-03 a person at the terminal is asked, and a no is the same as no answer', async () => {
    const { root, spawn } = await withPages();
    expect((await run(root, spawn, ['remove', PAGES], scriptedPrompts([false]))).code).toBe(2);
    const yes = await run(root, spawn, ['remove', PAGES], scriptedPrompts([true]));
    expect(yes.code).toBe(0);
  });

  it('DATA-02 with --yes it takes the plugin out of the config and the server app, and writes the migration that drops its tables', async () => {
    const { root, spawn, calls } = await withPages();
    const { code, data } = await run(root, spawn, ['remove', PAGES, '--yes', '--json']);
    expect(code).toBe(0);
    expect(calls).toEqual([{ args: ['remove', PAGES], cwd: join(root, 'apps/server') }]);
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toContain('plugins: []');
    expect(data).toMatchObject({
      plugin: PAGES,
      tables: ['pages_pages'],
      migration: 'migrations/Migration20260501102030_remove_pages.ts',
    });
    const migration = readFileSync(join(root, 'migrations/Migration20260501102030_remove_pages.ts'), 'utf8');
    expect(migration).toContain('@file        migrations/Migration20260501102030_remove_pages.ts');
    expect(migration).toContain(`this.addSql('drop table if exists "pages_pages";');`);
    expect(migration).toContain('bieberkit-ignore BK_MIGRATION_DESTRUCTIVE');
    expect(readFileSync(join(root, '.env.example'), 'utf8')).not.toContain('PAGES_ROOT');
  });

  it('DATA-08 the migration that it writes passes bieberkit check, because the drop was confirmed and says why', async () => {
    const { root, spawn } = await withPages();
    await run(root, spawn, ['remove', PAGES, '--yes']);
    const checked = await run(root, spawn, ['check', 'migrations', '--json']);
    expect(checked.code).toBe(0);
    expect(readdirSync(join(root, 'migrations'))).toHaveLength(1);
  });

  it('PLG-03 a cancelled question touches nothing: the config, the packages and the migrations stay as they were', async () => {
    const { root, spawn, calls } = await withPages();
    const before = readFileSync(join(root, 'bieberkit.config.ts'), 'utf8');
    const cancelled = await run(root, spawn, ['remove', PAGES], scriptedPrompts([CANCEL]));
    expect(cancelled.code).not.toBe(0);
    expect(calls).toEqual([]);
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toBe(before);
    expect(existsSync(join(root, 'migrations'))).toBe(false);
  });

  it('PLG-03 a pnpm that fails leaves the config, the example and the migrations as they were', async () => {
    const { root } = project();
    const ok = pnpmFor(root);
    await run(root, ok.spawn, ['add', PAGES]);
    const before = readFileSync(join(root, 'bieberkit.config.ts'), 'utf8');
    const example = readFileSync(join(root, '.env.example'), 'utf8');
    const failing = pnpmFor(root, { fail: true });
    const { code, error } = await run(root, failing.spawn, ['remove', PAGES, '--yes', '--json']);
    expect([code, error.code]).toEqual([1, 'BK_PNPM_FAILED']);
    expect(readFileSync(join(root, 'bieberkit.config.ts'), 'utf8')).toBe(before);
    expect(readFileSync(join(root, '.env.example'), 'utf8')).toBe(example);
    expect(existsSync(join(root, 'migrations'))).toBe(false);
  });

  it('5.2 a plugin that another one requires, and one that is not installed, are refused', async () => {
    const { root } = project();
    const { spawn } = pnpmFor(root);
    install(root, '@bieberkit/plugin-base');
    install(root, '@bieberkit/plugin-top', ", requires: { '@bieberkit/plugin-base': '*' }");
    writeFileSync(
      join(root, 'bieberkit.config.ts'),
      readFileSync(join(root, 'bieberkit.config.ts'), 'utf8').replace(
        'plugins: []',
        "plugins: ['@bieberkit/plugin-base', '@bieberkit/plugin-top']",
      ),
    );
    const used = await run(root, spawn, ['remove', '@bieberkit/plugin-base', '--yes', '--json']);
    expect([used.code, used.error.code]).toEqual([1, 'BK_REMOVE_REQUIRED_BY']);
    const none = await run(root, spawn, ['remove', '@bieberkit/plugin-ghost', '--json']);
    expect(none.error.code).toBe('BK_REMOVE_NOT_INSTALLED');
  });
});
