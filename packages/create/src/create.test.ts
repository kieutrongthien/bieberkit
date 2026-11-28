/**
 * BieberKit
 *
 * @file        packages/create/src/create.test.ts
 * @description Tests of create-bieberkit: the files of a new project, the choices and where they come from, the graph that is resolved before anything is written, and the install and the first commit (section 5.1, section 6, section 23.7).
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

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { definePlugin, env, parseEnvFile, readCoreEnv, toManifest } from '@bieberkit/core';
import { createCommand } from './commands/create.ts';
import type { CreateDeps } from './commands/create.ts';
import { createRunner } from './kit/run.ts';
import type { Prompts } from './kit/command.ts';
import { CANCEL, scriptedPrompts } from './kit/scripted.ts';
import type { Exec } from './scaffold/run.ts';
import type { PluginIndex, Template } from './scaffold/templates.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const workdir = (): string => {
  const made = mkdtempSync(join(tmpdir(), 'bk-create-'));
  folders.push(made);
  return made;
};

const AUTHOR = 'Ada Lovelace <ada@example.com>';
const GIT = { name: 'Git Person', email: 'git@example.com' };

function counter(): () => string {
  let n = 0;
  return () => `secret-${String((n += 1)).padStart(3, '0')}`;
}

interface RunOptions {
  readonly deps?: CreateDeps;
  readonly prompts?: Prompts;
}

async function create(cwd: string, argv: string[], options: RunOptions = {}) {
  const calls: { file: string; args: readonly string[]; cwd: string }[] = [];
  const exec: Exec = async (file, args, where) => {
    calls.push({ file, args, cwd: where });
  };
  const run = createRunner({
    name: 'create-bieberkit',
    version: '0.0.0',
    commands: [
      createCommand({
        exec,
        gitUser: () => GIT,
        random: counter(),
        now: () => new Date('2026-05-01T00:00:00Z'),
        framework: '1.2.3',
        ...options.deps,
      }),
    ],
    single: 'create',
  });
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd,
    ...(options.prompts === undefined ? {} : { prompts: options.prompts }),
  });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return {
    code,
    out: out.join(''),
    err: err.join(''),
    calls,
    json,
    data: Object(json['data']),
    error: Object(json['error']),
  };
}

const read = (cwd: string, path: string): string => readFileSync(join(cwd, path), 'utf8');
const listing = (root: string, prefix = ''): string[] =>
  readdirSync(join(root, prefix), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? listing(root, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .toSorted();

describe('section 6 the files of a new project', () => {
  it('6 --yes makes a blank project on SQLite with the files of section 4.2, and says what to do next', async () => {
    const cwd = workdir();
    const { code, data, out } = await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--json']);
    expect(code).toBe(0);
    expect(listing(join(cwd, 'demo'))).toEqual(
      [
        '.dockerignore',
        '.env',
        '.env.example',
        '.env.production.example',
        '.gitignore',
        'AGENTS.md',
        'CLAUDE.md',
        'Dockerfile',
        'apps/admin/index.html',
        'apps/admin/package.json',
        'apps/admin/src/admin.d.ts',
        'apps/admin/src/main.tsx',
        'apps/admin/tsconfig.json',
        'apps/admin/vite.config.ts',
        'apps/server/package.json',
        'apps/server/src/main.ts',
        'bieberkit.config.ts',
        'compose.prod.yaml',
        'compose.yaml',
        'deploy/Caddyfile',
        'deploy/backup.mjs',
        'deploy/upload.sh',
        'data/.gitkeep',
        'package.json',
        'pnpm-workspace.yaml',
        'tsconfig.json',
      ].toSorted(),
    );
    expect(data).toMatchObject({
      name: 'demo',
      dialect: 'sqlite',
      template: 'blank',
      files: 26,
      installed: false,
      git: 'skipped',
      next: ['cd demo', 'pnpm install', 'pnpm dev'],
    });
    expect(out).toContain('"ok":true');
  });

  it('23.7 every file that has comments carries the header of the project, with its own path, its author and its license', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--author', AUTHOR, '--license', 'MIT']);
    const config = read(cwd, 'demo/bieberkit.config.ts');
    expect(config).toContain(' * demo\n');
    expect(config).toContain('@file        bieberkit.config.ts');
    expect(config).toContain(`@author      ${AUTHOR}`);
    expect(config).toContain('@copyright   Copyright (c) 2026 Ada Lovelace');
    expect(config).toContain('@license     MIT');
    expect(read(cwd, 'demo/compose.yaml').startsWith('# demo\n#\n# @file        compose.yaml')).toBe(true);
    expect(read(cwd, 'demo/AGENTS.md').startsWith('<!--\n  demo\n')).toBe(true);
    expect(read(cwd, 'demo/apps/server/src/main.ts')).toContain('@file        apps/server/src/main.ts');
  });

  it('6 the config names the project, the dialect and the plugins in boot order', async () => {
    const cwd = workdir();
    await create(cwd, [
      'demo',
      '--db',
      'postgres',
      '--template',
      'blank',
      '--no-install',
      '--no-git',
      '--author',
      AUTHOR,
    ]);
    const config = read(cwd, 'demo/bieberkit.config.ts');
    expect(config).toContain("name: 'demo'");
    expect(config).toContain("database: { dialect: 'postgres' }");
    expect(config).toContain("tenancy: { mode: 'single' }");
    // Each plugin after the ones that it requires: `roles` before `users`.
    expect(config.indexOf("'@bieberkit/plugin-roles'")).toBeGreaterThan(0);
    expect(config.indexOf("'@bieberkit/plugin-roles'")).toBeLessThan(config.indexOf("'@bieberkit/plugin-users'"));
    expect(config).toContain("'@bieberkit/plugin-media'");
  });

  it('12 .env gives the administrator of the blank template a password of its own, and .env.example never shows it', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    const dotenv = read(cwd, 'demo/.env');
    const password = /^USERS_ADMIN_PASSWORD=(.+)$/m.exec(dotenv)?.[1] ?? '';
    expect(password).not.toBe('');
    // A key that has a default is written with it, and not left empty.
    expect(dotenv).toContain('USERS_ADMIN_EMAIL=admin@example.com');
    expect([`APP_KEY=${password}`, `AUTH_SECRET=${password}`].some((line) => dotenv.includes(line))).toBe(false);
    expect(read(cwd, 'demo/.env.example')).not.toContain(password);
    expect(() => readCoreEnv(parseEnvFile(dotenv))).not.toThrow();
  });

  it('6 .env has fresh secrets and the development defaults, and passes the validation of core', async () => {
    for (const db of ['sqlite', 'postgres', 'mysql']) {
      const cwd = workdir();
      await create(cwd, ['demo', '--yes', '--db', db, '--no-install', '--no-git']);
      const dotenv = read(cwd, 'demo/.env');
      expect(dotenv).toContain('APP_KEY=secret-001');
      expect(dotenv).toContain('AUTH_SECRET=secret-002');
      for (const line of [
        'QUEUE_DRIVER=sync',
        'CACHE_DRIVER=file',
        'STORAGE_DISK=local',
        'MAIL_DRIVER=log',
        `DB_CONNECTION=${db}`,
      ])
        expect(dotenv).toContain(line);
      // The environment that the scaffolder wrote is one that core accepts.
      expect(() => readCoreEnv(parseEnvFile(dotenv))).not.toThrow();
    }
  });

  it('CFG-06 .env.example has every key and never a secret, and .env is not committed', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    const example = read(cwd, 'demo/.env.example');
    expect(example).toContain('DATABASE_URL=\n');
    expect(example).toContain('APP_KEY=\n');
    expect(example).not.toContain('secret-0');
    expect(read(cwd, 'demo/.gitignore')).toMatch(/^\.env$/m);
  });

  it('6 the database decides the url, the compose services and the supply chain settings', async () => {
    const sqlite = workdir();
    await create(sqlite, ['demo', '--yes', '--no-install', '--no-git']);
    expect(read(sqlite, 'demo/.env')).toContain('DATABASE_URL=./data/app.db');
    expect(read(sqlite, 'demo/compose.yaml')).not.toContain('image: postgres');
    expect(read(sqlite, 'demo/pnpm-workspace.yaml')).toContain('better-sqlite3: true');
    const postgres = workdir();
    await create(postgres, ['my-app', '--db', 'postgres', '--yes', '--no-install', '--no-git']);
    expect(read(postgres, 'my-app/.env')).toContain('DATABASE_URL=postgres://my_app:my_app@localhost:5432/my_app');
    expect(read(postgres, 'my-app/compose.yaml')).toContain('image: postgres:15');
    expect(read(postgres, 'my-app/compose.yaml')).toContain('allkeys-lru');
    expect(read(postgres, 'my-app/pnpm-workspace.yaml')).not.toContain('better-sqlite3');
    const mysql = workdir();
    await create(mysql, ['demo', '--db', 'mysql', '--yes', '--no-install', '--no-git']);
    expect(read(mysql, 'demo/compose.yaml')).toContain('image: mysql:8.4');
    for (const root of [sqlite, postgres, mysql]) {
      const workspace = read(root, `${readdirSync(root)[0]}/pnpm-workspace.yaml`);
      for (const setting of [
        'minimumReleaseAge: 10080',
        'trustPolicy: no-downgrade',
        'strictDepBuilds: true',
        'saveExact: true',
      ])
        expect(workspace).toContain(setting);
    }
  });

  it('UI-38 the workspace holds the plugins of the project, and its type check reads their sources, the screens apart', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    expect(read(cwd, 'demo/pnpm-workspace.yaml')).toContain("  - 'plugins/*'\n");
    const config = JSON.parse(read(cwd, 'demo/tsconfig.json'));
    expect(config.include).toContain('plugins/*/src/**/*.ts');
    // The screens of a plugin need the DOM and JSX: each has a tsconfig of its own.
    expect(config.exclude).toContain('plugins/*/src/admin');
  });

  it('6 a scoped name makes a folder without the scope, and the packages pin the version of the framework', async () => {
    const cwd = workdir();
    await create(cwd, ['@team/crm-app', '--yes', '--no-install', '--no-git']);
    const server = JSON.parse(read(cwd, 'crm-app/apps/server/package.json'));
    expect(server.name).toBe('crm-app-server');
    expect(server.dependencies['@bieberkit/core']).toBe('1.2.3');
    expect(server.dependencies['@bieberkit/server']).toBe('1.2.3');
    expect(JSON.parse(read(cwd, 'crm-app/package.json'))).toMatchObject({
      name: '@team/crm-app',
      devDependencies: { bieberkit: '1.2.3', '@bieberkit/testing': '1.2.3' },
    });
  });

  it('4.2 the root declares what bieberkit.config.ts and the editor need: core, and the types of Node.js', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    const root = JSON.parse(read(cwd, 'demo/package.json'));
    expect(root.devDependencies['@bieberkit/core']).toBe('1.2.3');
    expect(root.devDependencies['@types/node']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(JSON.parse(read(cwd, 'demo/tsconfig.json')).compilerOptions.types).toEqual(['node']);
  });

  it('UI-38 the root declares data, which a made migration imports from the migrations folder of the root', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    // A migration begins with `import { Migration } from '@bieberkit/data/migration'`, and pnpm resolves nothing undeclared.
    expect(JSON.parse(read(cwd, 'demo/package.json')).devDependencies['@bieberkit/data']).toBe('1.2.3');
  });

  it('23.7 a known license writes its LICENSE with the year and the holder, UNLICENSED and an unknown one write none', async () => {
    const mit = workdir();
    await create(mit, ['demo', '--yes', '--license', 'MIT', '--author', AUTHOR, '--no-install', '--no-git']);
    expect(read(mit, 'demo/LICENSE')).toContain('Copyright (c) 2026 Ada Lovelace');
    const apache = workdir();
    await create(apache, ['demo', '--yes', '--license', 'Apache-2.0', '--no-install', '--no-git']);
    const repoLicense = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'LICENSE'),
      'utf8',
    );
    expect(read(apache, 'demo/LICENSE').trimEnd()).toBe(repoLicense.trimEnd());
    for (const license of ['UNLICENSED', 'GPL-3.0-only']) {
      const cwd = workdir();
      await create(cwd, ['demo', '--yes', '--license', license, '--no-install', '--no-git']);
      expect(existsSync(join(cwd, 'demo/LICENSE'))).toBe(false);
    }
  });
});

/** An exec whose pnpm install is refused, as it is for a version younger than minimumReleaseAge. */
const tooYoung: Exec = async (file) => {
  if (file === 'pnpm')
    throw Object.assign(new Error('Command failed: pnpm install\nlots of output'), {
      stderr: 'Progress: resolved 1\nERR_PNPM_NO_MATURE_MATCHING_VERSION create-bieberkit@0.2.0 is too young\n',
    });
};

describe('section 5.1 the choices', () => {
  it('5.1 without --yes and with nobody to ask, the command lists every flag that is missing, exit code 2', async () => {
    const cwd = workdir();
    const { code, error } = await create(cwd, ['demo', '--json', '--no-install', '--no-git'], {
      deps: { gitUser: () => ({}) },
    });
    expect(code).toBe(2);
    expect(error.code).toBe('BK_CREATE_CHOICE_NEEDED');
    expect(error.message).toContain('--db');
    expect(error.message).toContain('--template');
    expect(error.message).toContain('--author');
    expect(error.fix).toContain('--yes');
    expect(existsSync(join(cwd, 'demo'))).toBe(false);
  });

  it('5.1 --yes and --json never ask, even with a person at the terminal', async () => {
    const json = scriptedPrompts([]);
    const { data } = await create(workdir(), ['demo', '--no-install', '--no-git', '--json'], { prompts: json });
    expect(json.asked).toEqual([]);
    expect(data.dialect).toBeUndefined();
    const yes = scriptedPrompts([]);
    await create(workdir(), ['demo', '--yes', '--no-install', '--no-git'], { prompts: yes });
    expect(yes.asked).toEqual([]);
  });

  it('6 a person at the terminal is asked in order, sees a summary, and gets the project', async () => {
    const cwd = workdir();
    const prompts = scriptedPrompts(['mysql', true, 'MIT', true, true, true]);
    const { code, out } = await create(cwd, ['demo'], { prompts });
    expect(code).toBe(0);
    expect(prompts.asked).toEqual([
      'Which database?',
      'Include the admin app?',
      'License?',
      'Run pnpm install?',
      'Create a git repository?',
      'Create the project?',
    ]);
    expect(prompts.shown[0]).toBe('create-bieberkit 1.2.3');
    expect(prompts.notes['Summary']).toContain('MySQL');
    expect(prompts.notes['Summary']).toContain('blank');
    expect(prompts.shown).toEqual(expect.arrayContaining(['Writing files', 'Installing dependencies', 'Next steps']));
    expect(prompts.shown.at(-1)).toBe('Done. Happy building!');
    expect(out).toBe('');
    expect(read(cwd, 'demo/bieberkit.config.ts')).toContain("dialect: 'mysql'");
    expect(read(cwd, 'demo/LICENSE')).toContain('MIT License');
  });

  it('6 with several templates the person picks one, and the extra plugins are those of the dialect on top of it', async () => {
    const cwd = workdir();
    const blank = { name: 'blank', description: 'Nothing on top.', plugins: [] };
    const crm = { name: 'crm', description: 'Customers and deals.', plugins: [] };
    const prompts = scriptedPrompts(['postgres', 'crm', [], true, 'UNLICENSED', false, false, true]);
    await create(cwd, ['demo'], { prompts, deps: { templates: { blank, crm } } });
    expect(prompts.asked.slice(0, 3)).toEqual(['Which database?', 'Which template?', 'Extra plugins?']);
    expect(prompts.notes['Summary']).toContain('crm');
  });

  it('5.1 another license is typed as an SPDX identifier', async () => {
    const cwd = workdir();
    const prompts = scriptedPrompts(['sqlite', true, 'other', 'BSD-3-Clause', false, false, true]);
    await create(cwd, ['demo'], { prompts });
    expect(prompts.asked).toContain('SPDX identifier?');
    expect(read(cwd, 'demo/bieberkit.config.ts')).toContain("license: 'BSD-3-Clause'");
  });

  it('5.1 a missing name is asked, and a folder that is not empty is refused at the prompt', async () => {
    const cwd = workdir();
    const fresh = scriptedPrompts(['fresh', 'sqlite', true, 'UNLICENSED', false, false, true]);
    await create(cwd, [], { prompts: fresh });
    expect(fresh.asked[0]).toBe('Project name?');
    expect(existsSync(join(cwd, 'fresh/bieberkit.config.ts'))).toBe(true);
    const taken = await create(cwd, [], { prompts: scriptedPrompts(['fresh']) });
    expect(taken.err).toContain('The folder fresh exists and is not empty.');
  });

  it('5.1 without a name and with nobody to ask, <name> is in the list of what is missing', async () => {
    const { code, error } = await create(workdir(), ['--json', '--db', 'sqlite', '--template', 'blank']);
    expect([code, error.code]).toEqual([2, 'BK_CREATE_CHOICE_NEEDED']);
    expect(error.message).toContain('<name>');
  });

  it('6 a cancel at the summary writes nothing, exit 1', async () => {
    const cwd = workdir();
    const prompts = scriptedPrompts(['sqlite', true, 'UNLICENSED', true, true, CANCEL]);
    const { code, err } = await create(cwd, ['demo'], { prompts });
    expect(code).toBe(1);
    expect(err).toContain('error[BK_CANCELLED]');
    expect(existsSync(join(cwd, 'demo'))).toBe(false);
  });

  it('6 a failed install says why, with the end of what pnpm printed', async () => {
    const { data } = await create(workdir(), ['demo', '--yes', '--no-git', '--json'], { deps: { exec: tooYoung } });
    expect(data.problems[0]).toContain('ERR_PNPM_NO_MATURE_MATCHING_VERSION create-bieberkit@0.2.0 is too young');
  });

  it('6 a person whose task is stopped stops its program: the install is given the signal of the task', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const exec: Exec = async (_file, _args, _cwd, signal) => {
      signals.push(signal);
    };
    const prompts = scriptedPrompts(['sqlite', true, 'UNLICENSED', true, true, true]);
    await create(workdir(), ['demo'], { prompts, deps: { exec } });
    expect(signals.length).toBeGreaterThan(1);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it('5.1 a name given on the command line whose folder is not empty is asked again before the other questions', async () => {
    const cwd = workdir();
    mkdirSync(join(cwd, 'taken'));
    writeFileSync(join(cwd, 'taken/file'), 'x');
    const prompts = scriptedPrompts(['fresh', 'sqlite', true, 'UNLICENSED', false, false, true]);
    await create(cwd, ['taken'], { prompts });
    expect(prompts.asked[0]).toBe('Project name?');
    expect(existsSync(join(cwd, 'fresh/bieberkit.config.ts'))).toBe(true);
  });

  it('6 a failing install stops its spinner, and the problem is reported, exit 1', async () => {
    const cwd = workdir();
    const prompts = scriptedPrompts(['sqlite', true, 'UNLICENSED', true, false, true]);
    const { code } = await create(cwd, ['demo'], { prompts, deps: { exec: failingInstall } });
    expect(code).toBe(1);
    expect(prompts.notes['Problems']).toMatch(/^pnpm install failed: network is down\nRun it/);
  });

  it('5.1 the author comes from the flag, then from git config', async () => {
    const withFlag = workdir();
    await create(withFlag, ['demo', '--yes', '--author', AUTHOR, '--no-install', '--no-git']);
    expect(read(withFlag, 'demo/bieberkit.config.ts')).toContain(`author: '${AUTHOR}'`);
    const fromGit = workdir();
    await create(fromGit, ['demo', '--yes', '--no-install', '--no-git']);
    expect(read(fromGit, 'demo/bieberkit.config.ts')).toContain("author: 'Git Person <git@example.com>'");
  });

  it.each([
    ['a name that npm refuses', ['Demo App', '--yes'], 'BK_CREATE_NAME_INVALID'],
    ['a database that does not exist', ['demo', '--yes', '--db', 'oracle'], 'BK_CREATE_DB_INVALID'],
    ['a template that does not exist', ['demo', '--yes', '--template', 'cms'], 'BK_CREATE_TEMPLATE_UNKNOWN'],
    ['an author that is not Name <email>', ['demo', '--yes', '--author', 'Ada'], 'BK_CREATE_AUTHOR_INVALID'],
    ['a license that is not SPDX', ['demo', '--yes', '--license', 'my license'], 'BK_CREATE_LICENSE_INVALID'],
    [
      'a plugin that is not known',
      ['demo', '--yes', '--plugins', '@bieberkit/plugin-ghost'],
      'BK_CREATE_PLUGIN_UNKNOWN',
    ],
  ])('5.1 %s is a usage error with its code, and nothing is written', async (_name, argv, code) => {
    const cwd = workdir();
    const result = await create(cwd, [...argv, '--no-install', '--no-git', '--json']);
    expect([result.code, result.error.code]).toEqual([2, code]);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('6 a folder that is not empty is refused and left as it was', async () => {
    const cwd = workdir();
    mkdirSync(join(cwd, 'demo'));
    writeFileSync(join(cwd, 'demo/keep.txt'), 'mine');
    const { code, error } = await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--json']);
    expect([code, error.code]).toEqual([2, 'BK_CREATE_TARGET_NOT_EMPTY']);
    expect(readdirSync(join(cwd, 'demo'))).toEqual(['keep.txt']);
  });

  it('6 an empty folder is fine', async () => {
    const cwd = workdir();
    mkdirSync(join(cwd, 'demo'));
    expect((await create(cwd, ['demo', '--yes', '--no-install', '--no-git'])).code).toBe(0);
  });

  it('5.1 --site is accepted and the result says that its app is not part of this version', async () => {
    const cwd = workdir();
    const { data } = await create(cwd, ['demo', '--yes', '--site', '--no-install', '--no-git', '--json']);
    expect(data.notes).toEqual([expect.stringContaining('site app')]);
    expect(read(cwd, 'demo/.env')).toContain('SITE_SERVICE_TOKEN=secret-');
  });

  it('UI-37 a project with an admin has apps/admin, which builds the admin from the plugins with Vite', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--author', AUTHOR]);
    const admin = JSON.parse(read(cwd, 'demo/apps/admin/package.json'));
    expect(admin).toMatchObject({ name: 'demo-admin', private: true, type: 'module' });
    expect(admin.dependencies).toMatchObject({ '@bieberkit/admin-antd': '1.2.3', '@bieberkit/admin-core': '1.2.3' });
    expect(admin.devDependencies).toMatchObject({ bieberkit: '1.2.3' });
    // The admin gives each plugin its React, so every plugin of the server is a dependency of the admin too.
    const server = JSON.parse(read(cwd, 'demo/apps/server/package.json'));
    expect(server.dependencies).not.toHaveProperty('@bieberkit/admin-antd');
    for (const name of Object.keys(server.dependencies).filter((item) => item.includes('plugin-')))
      expect(admin.dependencies).toHaveProperty(name);
    expect(read(cwd, 'demo/apps/admin/vite.config.ts')).toContain(
      "import { bieberkitAdmin } from 'bieberkit/admin-vite';",
    );
    expect(read(cwd, 'demo/apps/admin/src/main.tsx')).toContain('startAdmin(root, { parts });');
    expect(read(cwd, 'demo/apps/admin/src/admin.d.ts')).toContain("declare module 'virtual:bieberkit/admin'");
    expect(read(cwd, 'demo/apps/admin/index.html')).toContain('<script type="module" src="./src/main.tsx"></script>');
    expect(JSON.parse(read(cwd, 'demo/apps/admin/tsconfig.json')).compilerOptions.jsx).toBe('react-jsx');
    // The server's type check has no DOM and no JSX, so it leaves the admin to the tsconfig of the admin.
    expect(JSON.parse(read(cwd, 'demo/tsconfig.json')).exclude).toContain('apps/admin');
  });

  it('UI-37 --no-admin makes no apps/admin', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-admin', '--no-install', '--no-git']);
    expect(existsSync(join(cwd, 'demo/apps/admin'))).toBe(false);
    expect(JSON.parse(read(cwd, 'demo/apps/server/package.json')).dependencies).not.toHaveProperty(
      '@bieberkit/admin-antd',
    );
  });

  it('UI-37 pins React, Ant Design and Vite at the versions that the library of the admin is built with', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    const made = JSON.parse(read(cwd, 'demo/apps/admin/package.json'));
    const library = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'admin-antd', 'package.json'), 'utf8'),
    );
    const built = { ...library.dependencies, ...library.devDependencies };
    for (const name of [
      'react',
      'react-dom',
      'antd',
      '@tanstack/react-query',
      'vite',
      '@vitejs/plugin-react',
      '@types/react',
      '@types/react-dom',
    ])
      expect([name, { ...made.dependencies, ...made.devDependencies }[name]]).toEqual([name, built[name]]);
  });

  // pnpm gives an optional peer to a package only through the one that depends on it. What a plugin asks of the admin and `apps/admin`
  // does not declare is missing from the build of a new project, while this repository, which installs each plugin alone, builds.
  it('UI-38 apps/admin declares every package that the admin part of a first-party plugin asks its project for', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git']);
    const made = JSON.parse(read(cwd, 'demo/apps/admin/package.json'));
    const plugins = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'plugins');
    const manifests = readdirSync(plugins, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const asked = manifests.flatMap(({ name }) => {
      const manifest = JSON.parse(readFileSync(join(plugins, name, 'package.json'), 'utf8'));
      return Object.keys(manifest.peerDependencies ?? {});
    });
    expect(asked).toContain('@tanstack/react-query');
    expect([...new Set(asked)].filter((name) => made.dependencies[name] === undefined)).toEqual([]);
  });
});

const plugin = (name: string, requires: Record<string, string> = {}, keys: Record<string, string> = {}) => {
  const def = definePlugin({
    name,
    version: '1.0.0',
    core: '*',
    dialects: ['sqlite', 'postgres', 'mysql'],
    requires,
    env: Object.fromEntries(Object.keys(keys).map((key) => [key, env.string().describe(keys[key] ?? key)])),
  });
  return { name, version: '1.0.0', manifest: { ...toManifest(def), env: Object.keys(keys) } };
};

const index = (...entries: ReturnType<typeof plugin>[]): PluginIndex =>
  Object.fromEntries(entries.map((entry) => [entry.name, { version: entry.version, manifest: entry.manifest }]));

describe('section 6 steps 4 and 5: the plugin graph before anything is written', () => {
  const templates: Record<string, Template> = {
    blank: { name: 'blank', description: 'x', plugins: ['@bieberkit/plugin-seo', '@bieberkit/plugin-pages'] },
  };

  it('6 the plugins of the template and of --plugins are resolved into boot order, and written to the config and the server package', async () => {
    const cwd = workdir();
    const deps: CreateDeps = {
      templates,
      index: index(
        plugin('@bieberkit/plugin-pages', {}, { PAGES_ROOT: 'x' }),
        plugin('@bieberkit/plugin-seo', { '@bieberkit/plugin-pages': '*' }),
        plugin('@bieberkit/plugin-tags'),
      ),
    };
    const { code, data } = await create(
      cwd,
      ['demo', '--yes', '--plugins', '@bieberkit/plugin-tags', '--no-install', '--no-git', '--json'],
      { deps },
    );
    expect(code).toBe(0);
    expect(data.plugins).toEqual(['@bieberkit/plugin-pages', '@bieberkit/plugin-seo', '@bieberkit/plugin-tags']);
    const config = read(cwd, 'demo/bieberkit.config.ts');
    expect(config.indexOf('plugin-pages')).toBeLessThan(config.indexOf('plugin-seo'));
    expect(JSON.parse(read(cwd, 'demo/apps/server/package.json')).dependencies).toMatchObject({
      '@bieberkit/plugin-pages': '1.0.0',
      '@bieberkit/plugin-seo': '1.0.0',
    });
    expect(read(cwd, 'demo/.env')).toContain('PAGES_ROOT=');
    expect(read(cwd, 'demo/.env.example')).toContain('PAGES_ROOT=');
  });

  it('6 a graph that does not resolve stops with the code of the resolver, and the folder is not made', async () => {
    const cwd = workdir();
    const deps: CreateDeps = {
      templates,
      index: index(
        plugin('@bieberkit/plugin-seo', { '@bieberkit/plugin-pages': '*' }),
        plugin('@bieberkit/plugin-pages'),
      ),
    };
    const missing = await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--json'], {
      deps: { ...deps, templates: { blank: { name: 'blank', description: 'x', plugins: ['@bieberkit/plugin-seo'] } } },
    });
    expect([missing.code, missing.error.code]).toEqual([1, 'PLG_MISSING_REQUIRE']);
    const conflict = await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--json'], {
      deps: {
        templates,
        index: index(plugin('@bieberkit/plugin-seo'), {
          ...plugin('@bieberkit/plugin-pages'),
          manifest: { ...plugin('@bieberkit/plugin-pages').manifest, conflicts: ['@bieberkit/plugin-seo'] },
        }),
      },
    });
    expect(conflict.error.code).toBe('PLG_CONFLICT');
    expect(readdirSync(cwd)).toEqual([]);
  });

  it('6 a plugin that does not support the dialect is refused', async () => {
    const cwd = workdir();
    const only = plugin('@bieberkit/plugin-seo');
    const deps: CreateDeps = {
      templates: { blank: { name: 'blank', description: 'x', plugins: ['@bieberkit/plugin-seo'] } },
      index: index({ ...only, manifest: { ...only.manifest, dialects: ['postgres'] } }),
    };
    const { error } = await create(cwd, ['demo', '--yes', '--db', 'sqlite', '--no-install', '--no-git', '--json'], {
      deps,
    });
    expect(error.code).toBe('PLG_DIALECT');
    expect(readdirSync(cwd)).toEqual([]);
  });
});

const failingInstall: Exec = async (file) => {
  if (file === 'pnpm') throw new Error('network is down\nmore');
};
const failingGit: Exec = async (file) => {
  if (file === 'git') throw new Error('git is not installed');
};

describe('section 6 steps 8 and 11: install and the first commit', () => {
  it('6 installs in the project, then makes the first commit signed by the author of the project, in this order', async () => {
    const cwd = workdir();
    const { calls, data } = await create(cwd, ['demo', '--yes', '--author', AUTHOR, '--json']);
    expect(calls.map((call) => `${call.file} ${call.args.join(' ')}`)).toEqual([
      'pnpm install',
      'git init -b main',
      'git add -A',
      `git -c user.name=Ada Lovelace -c user.email=ada@example.com commit -q -m chore: initial commit from create-bieberkit`,
    ]);
    expect(calls.every((call) => call.cwd === join(cwd, 'demo'))).toBe(true);
    expect(data).toMatchObject({ installed: true, git: 'committed', problems: [] });
  });

  it('6 an install that fails leaves the project, says so, and exits with 1; the commit is still made', async () => {
    const cwd = workdir();
    const { code, data, err } = await create(cwd, ['demo', '--yes', '--json'], { deps: { exec: failingInstall } });
    expect(code).toBe(1);
    expect(data).toMatchObject({ installed: false, git: 'committed' });
    expect(data.problems[0]).toContain('pnpm install failed: network is down');
    expect(existsSync(join(cwd, 'demo/bieberkit.config.ts'))).toBe(true);
    // The progress goes to stderr, and a problem of install is data on stdout and not an error document.
    expect(err).not.toContain('error[');
  });

  it('6 a git that fails is a problem, and does not remove the files', async () => {
    const cwd = workdir();
    const { code, data } = await create(cwd, ['demo', '--yes', '--no-install', '--json'], {
      deps: { exec: failingGit },
    });
    expect([code, data.git]).toEqual([1, 'failed']);
    expect(existsSync(join(cwd, 'demo/package.json'))).toBe(true);
  });

  it('6 a real repository gets one commit with every file but .env, signed by the author', async () => {
    const cwd = workdir();
    const real = createCommand({ gitUser: () => GIT, random: counter() });
    const run = createRunner({ name: 'create-bieberkit', version: '0.0.0', commands: [real], single: 'create' });
    const code = await run(['demo', '--yes', '--no-install', '--author', AUTHOR], {
      stdout: () => undefined,
      stderr: () => undefined,
      cwd,
    });
    expect(code).toBe(0);
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: join(cwd, 'demo'), encoding: 'utf8' }).trim();
    expect(git('log', '--format=%an <%ae>|%s')).toBe(`${AUTHOR}|chore: initial commit from create-bieberkit`);
    const tracked = git('ls-files').split('\n');
    expect(tracked).toContain('bieberkit.config.ts');
    expect(tracked).toContain('.env.example');
    expect(tracked).not.toContain('.env');
    expect(git('status', '--porcelain')).toBe('');
  });
});

describe('UI-38 the project that create writes', () => {
  const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

  it('UI-38 passes the type check that bieberkit build runs, with the compiler options of its own tsconfig', async () => {
    const cwd = workdir();
    await create(cwd, ['demo', '--yes', '--no-install', '--no-git', '--author', AUTHOR]);
    const root = join(cwd, 'demo');
    // What pnpm install leaves for the config: core, here from its source, and the types of Node.js.
    mkdirSync(join(root, 'node_modules', '@bieberkit'), { recursive: true });
    symlinkSync(join(repository, 'packages', 'core'), join(root, 'node_modules', '@bieberkit', 'core'), 'dir');
    writeFileSync(
      join(root, 'tsconfig.check.json'),
      JSON.stringify({
        extends: './tsconfig.json',
        compilerOptions: {
          customConditions: ['@bieberkit/source'],
          typeRoots: [join(repository, 'node_modules', '@types')],
        },
        // The entry point of the processes needs every package of the server, which is not what this checks.
        include: ['bieberkit.config.ts'],
      }),
    );
    let output = '';
    try {
      execFileSync(join(repository, 'node_modules', '.bin', 'tsc'), ['--noEmit', '-p', 'tsconfig.check.json'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      output = String(Reflect.get(Object(error), 'stdout'));
    }
    expect(output).toBe('');
  }, 60_000);
});
