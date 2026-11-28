/**
 * BieberKit
 *
 * @file        packages/cli/src/make.test.ts
 * @description Tests of make:module, make:entity and make:job: the files that they write pass the rules of check, are registered in their module, and load as part of the application (section 5.2, section 7.4).
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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { composeAdmin, messageProblems } from '@bieberkit/admin-core';
import type { AdminPart } from '@bieberkit/admin-core';
import { createRunner } from 'create-bieberkit/kit';
import { resolvePlugins } from '@bieberkit/core';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pluginMaker } from './commands/make.ts';
import { PINNED } from './make-versions.ts';
import type { Spawn } from './processes.ts';
import { runCli } from './run.ts';
import { makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});
const project = (): Fixture => {
  const made = makeProject();
  fixtures.push(made);
  return made;
};

async function run(root: string, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { stdout: (text) => out.push(text), stderr: (text) => err.push(text), cwd: root });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return { code, out: out.join(''), err: err.join(''), json, data: Object(json['data']), error: Object(json['error']) };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
const MODULE = 'apps/server/src/modules/crm/module.ts';

describe('section 5.2 make:module', () => {
  it('5.2 writes the module with the header of the project and the markers that the other recipes use', async () => {
    const { root } = project();
    const { code, data } = await run(root, ['make:module', 'crm', '--json']);
    expect([code, data.files]).toEqual([0, [MODULE]]);
    const text = read(root, MODULE);
    expect(text).toContain('@file        apps/server/src/modules/crm/module.ts');
    expect(text).toContain('@author      Test <test@example.com>');
    expect(text).toMatch(/@copyright   Copyright \(c\) \d{4} Test\n/);
    expect(text).toContain("name: 'crm'");
    for (const marker of ['bieberkit:imports', 'bieberkit:entities', 'bieberkit:jobs']) expect(text).toContain(marker);
  });

  it('5.2 refuses a name that is not a module name with a usage error, and a module that exists', async () => {
    const { root } = project();
    expect((await run(root, ['make:module', 'Crm', '--json'])).error.code).toBe('BK_MAKE_NAME_INVALID');
    expect((await run(root, ['make:module', 'Crm'])).code).toBe(2);
    await run(root, ['make:module', 'crm']);
    const again = await run(root, ['make:module', 'crm', '--json']);
    expect([again.code, again.error.code]).toEqual([1, 'BK_MAKE_EXISTS']);
  });
});

describe('section 5.2 make:entity', () => {
  it('5.2 writes the entity, registers it, and the application then has its routes', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    const { code, data } = await run(root, ['make:entity', 'crm.SalesOrder', '--tenant', '--json']);
    expect([code, data.files]).toEqual([0, ['apps/server/src/modules/crm/entities/sales-order.ts', MODULE]]);
    const entity = read(root, 'apps/server/src/modules/crm/entities/sales-order.ts');
    expect(entity).toContain("name: 'crm.SalesOrder'");
    expect(entity).toContain("table: 'crm_sales_orders'");
    expect(entity).toContain('tenant: true');
    const module = read(root, MODULE);
    expect(module).toContain("import { SalesOrder } from './entities/sales-order.ts';");
    expect(module).toMatch(/entities: \[\n {4}SalesOrder,\n {4}\/\/ bieberkit:entities/);
    const routes = await run(root, ['routes']);
    expect(routes.out).toContain('/api/v1/crm/sales-orders');
  });

  it('5.2 registers a second entity next to the first, keeping the markers', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    await run(root, ['make:entity', 'crm.Deal']);
    await run(root, ['make:entity', 'crm.Contact']);
    const module = read(root, MODULE);
    expect(module).toMatch(/entities: \[\n {4}Deal,\n {4}Contact,\n {4}\/\/ bieberkit:entities/);
    expect(module.match(/bieberkit:imports/g)).toHaveLength(1);
    expect((await run(root, ['routes', '--json'])).data.routes.length).toBeGreaterThan(8);
  });

  it('UI-38 the module that it writes passes the type check of a project, which wants declared types on exports', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    await run(root, ['make:entity', 'crm.Deal']);
    await run(root, ['make:job', 'crm.send-welcome']);
    writeFileSync(
      join(root, 'tsconfig.check.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'esnext',
          module: 'esnext',
          moduleResolution: 'bundler',
          customConditions: ['@bieberkit/source'],
          lib: ['esnext'],
          types: ['node'],
          typeRoots: [join(REPOSITORY, 'node_modules', '@types')],
          strict: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          allowImportingTsExtensions: true,
          erasableSyntaxOnly: true,
          resolveJsonModule: true,
          isolatedDeclarations: true,
          declaration: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['apps/server/src/modules/**/*.ts'],
      }),
    );
    let output = '';
    try {
      execFileSync(join(REPOSITORY, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.check.json'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      output = String(Reflect.get(Object(error), 'stdout'));
    }
    // Only what the recipes wrote: the sources of the framework are checked by the framework.
    expect(output.split('\n').filter((line) => line.startsWith('apps/'))).toEqual([]);
  }, 60_000);

  it('5.2 the files that it writes pass bieberkit check, and generate works on them', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    await run(root, ['make:entity', 'crm.Deal']);
    await run(root, ['make:job', 'crm.send-welcome']);
    expect((await run(root, ['generate'])).code).toBe(0);
    const checked = await run(root, ['check', '--json']);
    expect(checked.data.violations).toEqual([]);
    expect(checked.code).toBe(0);
    expect(existsSync(join(root, '.bieberkit/schemas/crm.Deal.create.json'))).toBe(true);
  });

  it('5.2 says what is wrong: a name that is not <module>.<Name>, a module that does not exist, a name in lower case', async () => {
    const { root } = project();
    expect((await run(root, ['make:entity', 'Deal', '--json'])).error.code).toBe('BK_MAKE_NAME_INVALID');
    expect((await run(root, ['make:entity', 'crm.deal', '--json'])).error.code).toBe('BK_MAKE_NAME_INVALID');
    const missing = await run(root, ['make:entity', 'crm.Deal', '--json']);
    expect([missing.code, missing.error.code, missing.error.fix]).toEqual([
      1,
      'BK_MAKE_MODULE_MISSING',
      'Run: bieberkit make:module crm',
    ]);
  });

  it('5.2 a module whose marker was edited away still gets the file, and the error gives the lines to add by hand', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    writeFileSync(join(root, MODULE), read(root, MODULE).replace('// bieberkit:entities', ''));
    const { code, error } = await run(root, ['make:entity', 'crm.Deal', '--json']);
    expect([code, error.code]).toEqual([1, 'BK_MAKE_UNREGISTERED']);
    expect(error.fix).toContain("import { Deal } from './entities/deal.ts'");
    expect(existsSync(join(root, 'apps/server/src/modules/crm/entities/deal.ts'))).toBe(true);
  });
});

describe('section 5.2 make:job', () => {
  it('5.2 writes a job with the name of the module, and registers it in jobs', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    const { code, data } = await run(root, ['make:job', 'crm.send-welcome', '--json']);
    expect([code, data.files]).toEqual([0, ['apps/server/src/modules/crm/jobs/send-welcome.ts', MODULE]]);
    const job = read(root, 'apps/server/src/modules/crm/jobs/send-welcome.ts');
    expect(job).toContain("name: 'crm.send-welcome'");
    expect(job).toContain('export const sendWelcome');
    expect(read(root, MODULE)).toMatch(/jobs: \[\n {4}sendWelcome,\n {4}\/\/ bieberkit:jobs/);
  });

  it('5.2 a job name with a capital letter is a usage error', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    expect((await run(root, ['make:job', 'crm.SendWelcome'])).code).toBe(2);
  });
});

describe('PLG-03 make:plugin', () => {
  const FILES = [
    'plugins/notes/README.md',
    'plugins/notes/package.json',
    'plugins/notes/src/entity.ts',
    'plugins/notes/src/index.test.ts',
    'plugins/notes/src/index.ts',
    'plugins/notes/tsconfig.json',
    'plugins/notes/tsdown.config.ts',
  ];
  const NAME = 'bieberkit-plugin-notes';

  it('PLG-03 writes a plugin package with the header of the project, the keyword and the static manifest', async () => {
    const { root } = project();
    const { code, data } = await run(root, ['make:plugin', NAME, '--json']);
    expect(code).toBe(0);
    expect(Array.isArray(data.files) ? data.files.toSorted() : data.files).toEqual(FILES);
    for (const file of FILES.filter((path) => /\.(?:ts|md)$/.test(path) && !path.endsWith('.md'))) {
      expect(read(root, file)).toContain(`@file        ${file}`);
      expect(read(root, file)).toContain('@author      Test <test@example.com>');
    }
    const pkg = JSON.parse(read(root, 'plugins/notes/package.json'));
    expect(pkg).toMatchObject({
      name: NAME,
      keywords: expect.arrayContaining(['bieberkit-plugin']),
      exports: { '.': './src/index.ts' },
      scripts: { build: 'tsdown && bieberkit build' },
      bieberkit: { core: '*', requires: {}, tables: ['notes_items'], permissions: ['notes.manage', 'notes.read'] },
    });
  });

  it('PLG-03 the plugin that it makes builds and passes the check of its manifest at once, and resolves on every dialect', async () => {
    const { root } = project();
    await run(root, ['make:plugin', NAME]);
    const dir = join(root, 'plugins/notes');
    const checked = await run(dir, ['build', '--check', '--json']);
    expect([checked.code, checked.error]).toEqual([0, {}]);
    const rebuilt = await run(dir, ['build', '--json']);
    expect(rebuilt.code).toBe(0);
    const pkg = JSON.parse(read(root, 'plugins/notes/package.json'));
    for (const dialect of ['sqlite', 'postgres', 'mysql'] as const) {
      const resolution = resolvePlugins([{ name: NAME, version: pkg.version, manifest: pkg.bieberkit }], {
        core: '1.0.0',
        dialect,
      });
      expect(resolution.order).toEqual([NAME]);
    }
  });

  it('PLG-03 what it writes follows the rules of the check: headers, env access, boundaries and the tables of its own', async () => {
    const { root } = project();
    await run(root, ['make:plugin', NAME]);
    const checked = await run(root, ['check', 'headers', '--json']);
    expect(checked.data.violations).toEqual([]);
    expect((await run(root, ['check', 'plugin-tables', '--json'])).data.violations).toEqual([]);
    expect((await run(root, ['check', 'boundaries', '--json'])).data.violations).toEqual([]);
  });

  it('PLG-05 the name is a community name, a scoped one, or a first-party one with --first-party, and nothing else', async () => {
    const { root } = project();
    for (const bad of ['notes', 'plugin-notes', 'Bieberkit-plugin-notes', '@acme/notes', 'bieberkit-plugin-']) {
      const refused = await run(root, ['make:plugin', bad, '--json']);
      expect([bad, refused.code, refused.error.code]).toEqual([bad, 2, 'BK_MAKE_NAME_INVALID']);
    }
    const first = await run(root, ['make:plugin', '@bieberkit/plugin-notes', '--json']);
    expect(first.error.code).toBe('BK_MAKE_NAME_INVALID');
    expect((await run(root, ['make:plugin', '@bieberkit/plugin-notes', '--first-party'])).code).toBe(0);
    expect((await run(root, ['make:plugin', '@acme/bieberkit-plugin-tags'])).code).toBe(0);
    expect(existsSync(join(root, 'plugins/tags/package.json'))).toBe(true);
  });

  it('PLG-03 a second run is BK_MAKE_EXISTS and changes nothing, and --dir puts the package elsewhere', async () => {
    const { root } = project();
    await run(root, ['make:plugin', NAME]);
    const before = read(root, 'plugins/notes/src/index.ts');
    writeFileSync(join(root, 'plugins/notes/src/index.ts'), `${before}// edited\n`);
    const again = await run(root, ['make:plugin', NAME, '--json']);
    expect(again.error.code).toBe('BK_MAKE_EXISTS');
    expect(read(root, 'plugins/notes/src/index.ts')).toBe(`${before}// edited\n`);
    expect((await run(root, ['make:plugin', NAME, '--dir', 'vendor/notes'])).code).toBe(0);
    expect(existsSync(join(root, 'vendor/notes/package.json'))).toBe(true);
  });

  it('PLG-03 needs no application: with --author and --license it works in an empty folder', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'bk-plugin-'));
    try {
      const refused = await run(empty, ['make:plugin', NAME, '--json']);
      expect([refused.code, refused.error.code]).toEqual([2, 'BK_MAKE_AUTHOR_MISSING']);
      const made = await run(empty, ['make:plugin', NAME, '--author', 'Ann <ann@example.com>', '--license', 'MIT']);
      expect(made.code).toBe(0);
      expect(read(empty, 'plugins/notes/src/index.ts')).toContain('@author      Ann <ann@example.com>');
      expect(JSON.parse(read(empty, 'plugins/notes/package.json'))).toMatchObject({ license: 'MIT' });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

const NOTES = 'bieberkit-plugin-notes';

/** What `create` leaves in a project with an admin, as far as a made plugin reads and changes it. */
const NEW_PROJECT: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({
    name: 'demo',
    devDependencies: {
      '@bieberkit/core': '0.7.1',
      '@bieberkit/data': '0.7.1',
      bieberkit: '0.7.1',
      typescript: '7.0.2',
      vitest: '4.1.12',
    },
  }),
  'apps/server/package.json': JSON.stringify({ name: 'demo-server', dependencies: { zod: '4.6.7' } }),
  'apps/admin/package.json': JSON.stringify({
    name: 'demo-admin',
    dependencies: {
      '@bieberkit/admin-antd': '0.7.1',
      '@bieberkit/admin-core': '0.7.1',
      '@tanstack/react-query': '5.108.0',
      antd: '6.7.1',
      react: '19.3.1',
      'react-dom': '19.3.1',
    },
    devDependencies: { '@types/react': '19.3.0' },
  }),
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n\nminimumReleaseAge: 10080\n",
};

function newProject(files: Readonly<Record<string, string>> = NEW_PROJECT): Fixture {
  const made = makeProject({ files });
  fixtures.push(made);
  return made;
}

const jsonOf = (root: string, path: string): Record<string, unknown> => JSON.parse(read(root, path));

const ADMIN_FILES = [
  'plugins/notes/src/admin/NotesPage.tsx',
  'plugins/notes/src/admin/index.ts',
  'plugins/notes/src/admin/messages/en.ts',
  'plugins/notes/src/admin/messages/vi.ts',
  'plugins/notes/src/admin/messages/zh.ts',
  'plugins/notes/src/admin/tsconfig.json',
  'plugins/notes/tsdown.admin.config.ts',
];

describe('UI-38 make:plugin in a project with an admin', () => {
  it('UI-38 makes the admin part beside the backend, each file with the header of the project', async () => {
    const { root } = newProject();
    const { code, data } = await run(root, ['make:plugin', NOTES, '--no-install', '--json']);
    expect(code).toBe(0);
    expect(data.files).toEqual(expect.arrayContaining(ADMIN_FILES));
    for (const file of ADMIN_FILES.filter((path) => !path.endsWith('.json')))
      expect(read(root, file)).toContain(`@file        ${file}`);
  });

  it('UI-38 exports its source here and its build when published, and asks for no version that the project has not', async () => {
    const { root } = newProject();
    await run(root, ['make:plugin', NOTES, '--no-install']);
    const pkg = jsonOf(root, 'plugins/notes/package.json');
    expect(pkg['exports']).toEqual({
      '.': './src/index.ts',
      './admin': './src/admin/index.ts',
      './package.json': './package.json',
    });
    expect(Object(pkg['publishConfig'])['exports']).toEqual({
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './admin': { types: './dist/admin/index.d.ts', default: './dist/admin/index.js' },
      './package.json': './package.json',
    });
    expect(pkg['peerDependencies']).toEqual({
      '@bieberkit/admin-antd': '^0.7.1',
      '@bieberkit/admin-core': '^0.7.1',
      '@bieberkit/core': '^0.7.1',
      '@bieberkit/data': '^0.7.1',
      '@tanstack/react-query': '^5.108.0',
      antd: '^6.7.1',
      react: '^19.3.1',
    });
    // A server installs the plugin without React: only the admin asks for the packages of the screens.
    expect(Object.keys(Object(pkg['peerDependenciesMeta'])).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '@bieberkit/admin-antd',
      '@bieberkit/admin-core',
      '@tanstack/react-query',
      'antd',
      'react',
    ]);
    expect(pkg['devDependencies']).toEqual({
      '@bieberkit/admin-antd': '0.7.1',
      '@bieberkit/admin-core': '0.7.1',
      '@bieberkit/core': '0.7.1',
      '@bieberkit/data': '0.7.1',
      '@tanstack/react-query': '5.108.0',
      '@types/react': '19.3.0',
      antd: '6.7.1',
      bieberkit: '0.7.1',
      react: '19.3.1',
      'react-dom': '19.3.1',
      tsdown: PINNED.tsdown,
      typescript: '7.0.2',
      vitest: '4.1.12',
    });
    expect(pkg['scripts']).toMatchObject({
      build: 'tsdown && tsdown -c tsdown.admin.config.ts && bieberkit build',
      typecheck: 'tsc --noEmit -p tsconfig.json && tsc --noEmit -p src/admin/tsconfig.json',
    });
  });

  it('UI-38 wires the plugin into the project: the workspace, the server, the admin and the config', async () => {
    const { root } = newProject();
    const { data } = await run(root, ['make:plugin', NOTES, '--no-install', '--json']);
    expect(data.todo).toEqual([]);
    expect(read(root, 'pnpm-workspace.yaml')).toContain("packages:\n  - 'plugins/*'\n  - 'apps/*'");
    for (const app of ['server', 'admin'])
      expect(Object(jsonOf(root, `apps/${app}/package.json`)['dependencies'])[NOTES]).toBe('workspace:*');
    expect(read(root, 'bieberkit.config.ts')).toContain(`'${NOTES}'`);
  });

  it('UI-38 installs the workspace after it wired the plugin, and says how to run it when that fails', async () => {
    const { root } = newProject();
    const calls: (readonly string[])[] = [];
    const exit = { code: 0 };
    const spawn: Spawn = (file, args, where) => {
      calls.push([file, ...args, where.cwd]);
      return { exit: Promise.resolve(exit.code), kill: () => undefined };
    };
    const make = async (name: string) => {
      const out: string[] = [];
      const runner = createRunner({ name: 'bieberkit', version: '0.0.0', commands: [pluginMaker({ spawn })] });
      const code = await runner(['make:plugin', name, '--json'], {
        stdout: (text) => out.push(text),
        stderr: () => undefined,
        cwd: root,
      });
      return { code, answer: JSON.parse(out.join('')) };
    };
    expect((await make(NOTES)).code).toBe(0);
    expect(calls).toEqual([['pnpm', 'install', root]]);
    exit.code = 1;
    const failed = await make('bieberkit-plugin-tags');
    expect(failed.code).toBe(0);
    expect(failed.answer.data.todo).toEqual([expect.stringContaining('pnpm install')]);
  });

  it('UI-38 says what it could not wire, and does the rest', async () => {
    const { root } = newProject({ ...NEW_PROJECT, 'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n' });
    const { code, data, out } = await run(root, ['make:plugin', NOTES, '--no-install', '--json']);
    expect(code).toBe(0);
    expect(data.todo).toEqual([expect.stringContaining("'plugins/*'")]);
    expect(out).toContain('plugins/*');
    expect(read(root, 'bieberkit.config.ts')).toContain(`'${NOTES}'`);
  });

  it('UI-38 a project without an admin gets a plugin with no admin part and no React', async () => {
    const { 'apps/admin/package.json': _admin, ...files } = NEW_PROJECT;
    const { root } = newProject(files);
    const { data } = await run(root, ['make:plugin', NOTES, '--no-install', '--json']);
    expect(data.todo).toEqual([]);
    expect(existsSync(join(root, 'plugins/notes/src/admin'))).toBe(false);
    const pkg = read(root, 'plugins/notes/package.json');
    expect(pkg).not.toContain('react');
    expect(pkg).not.toContain('./admin');
  });

  it('UI-36 the made admin part composes with no mistake of its own, in every language of the admin', async () => {
    const { root } = newProject();
    await run(root, ['make:plugin', NOTES, '--no-install']);
    mkdirSync(join(root, 'plugins/notes/node_modules/@bieberkit'), { recursive: true });
    symlinkSync(
      join(REPOSITORY, 'packages/admin-core'),
      join(root, 'plugins/notes/node_modules/@bieberkit/admin-core'),
      'dir',
    );
    const loaded: { default: AdminPart<unknown> } = await import(
      /* @vite-ignore */ pathToFileURL(join(root, 'plugins/notes/src/admin/index.ts')).href
    );
    const part = loaded.default;
    expect(composeAdmin([part]).problems.map((problem) => problem.code)).toEqual(['no-sign-in']);
    expect(await messageProblems([part], ['en', 'vi', 'zh'])).toEqual([]);
    expect(part.pages?.map((page) => [page.path, page.permission])).toEqual([['/notes', 'notes.read']]);
  });

  it('UI-38 the made files pass the strict type check of a project, backend and admin', async () => {
    const { root } = newProject();
    await run(root, ['make:plugin', NOTES, '--no-install']);
    const modules = join(root, 'plugins/notes/node_modules');
    // What `pnpm install` gives the plugin, from where this repository has it.
    const from: Readonly<Record<string, string>> = {
      '@bieberkit/admin-antd': 'packages/admin-antd',
      '@bieberkit/admin-core': 'packages/admin-core',
      '@tanstack/react-query': 'packages/admin-antd/node_modules/@tanstack/react-query',
      '@types/react': 'packages/admin-antd/node_modules/@types/react',
      antd: 'packages/admin-antd/node_modules/antd',
      react: 'packages/admin-antd/node_modules/react',
      vitest: 'node_modules/vitest',
    };
    for (const [name, folder] of Object.entries(from)) {
      mkdirSync(dirname(join(modules, name)), { recursive: true });
      symlinkSync(join(REPOSITORY, folder), join(modules, name), 'dir');
    }
    const tsc = join(REPOSITORY, 'node_modules/typescript/bin/tsc');
    const checkTypes = (config: string): string => {
      try {
        return execFileSync(process.execPath, [tsc, '--noEmit', '-p', config], { cwd: root, encoding: 'utf8' });
      } catch (error) {
        return String(Reflect.get(Object(error), 'stdout'));
      }
    };
    expect(checkTypes('plugins/notes/tsconfig.json')).toBe('');
    expect(checkTypes('plugins/notes/src/admin/tsconfig.json')).toBe('');
  }, 120_000);

  it('23.7 the made plugin with its admin part passes every rule of bieberkit check', async () => {
    const { root } = newProject();
    await run(root, ['make:plugin', NOTES, '--no-install']);
    for (const rule of ['headers', 'boundaries', 'env-access', 'plugin-tables'])
      expect((await run(root, ['check', rule, '--json'])).data.violations).toEqual([]);
  });

  it('UI-38 pins the version of the builder of the repository', () => {
    const rootManifest: { devDependencies: Record<string, string> } = JSON.parse(
      readFileSync(join(REPOSITORY, 'package.json'), 'utf8'),
    );
    // The lowest version that the repository takes.
    expect([PINNED.tsdown, PINNED.typescript, PINNED.vitest]).toEqual(
      ['tsdown', 'typescript', 'vitest'].map((name) => rootManifest.devDependencies[name]?.replace(/^\^/, '')),
    );
  });
});
