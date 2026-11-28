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

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolvePlugins } from '@bieberkit/core';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
      exports: { '.': { '@bieberkit/source': './src/index.ts' } },
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
