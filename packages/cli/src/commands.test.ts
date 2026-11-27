/**
 * BieberKit
 *
 * @file        packages/cli/src/commands.test.ts
 * @description Tests of the commands on a throwaway project: plugins, env:check and env:example, and the ways that a project can be wrong (section 5.2, CFG-06, GEN-01).
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './run.ts';
import { makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});
const project = (...args: Parameters<typeof makeProject>): Fixture => {
  const made = makeProject(...args);
  fixtures.push(made);
  return made;
};

async function run(root: string, argv: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: root,
    env,
  });
  const first = out[0] ?? '{}';
  const parsed: unknown = argv.includes('--json') ? JSON.parse(first) : undefined;
  return {
    code,
    out: out.join(''),
    err: err.join(''),
    json: typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {},
  };
}

const PAGES = { name: '@bieberkit/plugin-pages', env: { PAGES_ROOT: 'Folder of the page files' } };
const SEO = {
  name: '@bieberkit/plugin-seo',
  requires: { '@bieberkit/plugin-pages': '*' },
  env: { SEO_SITEMAP: 'Sitemap file' },
};

describe('section 5.2 plugins', () => {
  it('5.2 lists the plugins in boot order, each after what it requires, whatever the order of the config', async () => {
    const { root } = project({ plugins: [SEO, PAGES] });
    const { code, out, json } = await run(root, ['plugins', '--json']);
    expect(code).toBe(0);
    expect(json).toMatchObject({ ok: true, data: { order: ['@bieberkit/plugin-pages', '@bieberkit/plugin-seo'] } });
    const human = await run(root, ['plugins']);
    expect(human.out).toContain('Boot order:');
    expect(human.out).toContain('@bieberkit/plugin-seo@1.0.0  requires @bieberkit/plugin-pages');
    expect(out).not.toContain('Boot order');
  });

  it('PLG-03 the graph has its edges with their ranges, who requires each plugin and what it owns, and the text and the JSON say the same', async () => {
    const { root } = project({ plugins: [SEO, PAGES] });
    const { json } = await run(root, ['plugins', '--json']);
    const data: Record<string, unknown> = Object(json['data']);
    expect(data['edges']).toEqual([{ from: '@bieberkit/plugin-seo', to: '@bieberkit/plugin-pages', range: '*' }]);
    const plugins: Record<string, unknown>[] = Array.isArray(data['plugins']) ? data['plugins'] : [];
    const byName = Object.fromEntries(plugins.map((plugin) => [String(plugin['name']), plugin]));
    expect(byName['@bieberkit/plugin-pages']).toMatchObject({
      requiredBy: ['@bieberkit/plugin-seo'],
      tables: [],
      routes: [],
    });
    expect(byName['@bieberkit/plugin-seo']).toMatchObject({ requiredBy: [] });
    const human = await run(root, ['plugins']);
    expect(human.out).toContain('@bieberkit/plugin-seo@1.0.0  requires @bieberkit/plugin-pages (*)');
    expect(human.out).toContain('@bieberkit/plugin-pages@1.0.0  required by @bieberkit/plugin-seo');
  });

  it('5.2 a project with no plugins says so, and the command works from a folder inside the project', async () => {
    const { root } = project();
    const { code, out } = await run(join(root, 'node_modules'), ['plugins']);
    expect([code, out.trim()]).toEqual([0, 'No plugins are installed.']);
  });

  it('PLG-04 a plugin that is in the config and not installed is BK_PLUGIN_NOT_INSTALLED, with the command to run', async () => {
    const { root } = project({ entries: ['"@bieberkit/plugin-ghost"'] });
    const { code, json } = await run(root, ['plugins', '--json']);
    expect(code).toBe(1);
    expect(json).toMatchObject({
      ok: false,
      error: { code: 'BK_PLUGIN_NOT_INSTALLED', fix: 'Run: pnpm add @bieberkit/plugin-ghost' },
    });
  });

  it('4.2 a plugin is found among the dependencies of apps/server, where pnpm installs it', async () => {
    const folder = 'apps/server/node_modules/@bieberkit/plugin-pages';
    const { root } = project({
      entries: ['"@bieberkit/plugin-pages"'],
      files: {
        [`${folder}/package.json`]: JSON.stringify({
          name: '@bieberkit/plugin-pages',
          type: 'module',
          exports: './index.mjs',
        }),
        [`${folder}/index.mjs`]: [
          "import { definePlugin } from '@bieberkit/core';",
          "export default definePlugin({ name: '@bieberkit/plugin-pages', version: '1.0.0', core: '*', dialects: ['sqlite', 'postgres', 'mysql'], requires: {}, env: {} });",
        ].join('\n'),
      },
    });
    const { code, json } = await run(root, ['plugins', '--json']);
    expect([code, json]).toMatchObject([0, { ok: true, data: { order: ['@bieberkit/plugin-pages'] } }]);
  });

  it('PLG-04 a package that does not export a plugin by default is BK_PLUGIN_NOT_EXPORTED', async () => {
    const { root } = project({ plugins: [{ name: '@bieberkit/plugin-odd', noDefault: true }] });
    expect((await run(root, ['plugins', '--json'])).json).toMatchObject({ error: { code: 'BK_PLUGIN_NOT_EXPORTED' } });
  });

  it('PLG-08 a plugin whose requirement is missing is reported with the code of the resolver', async () => {
    const { root } = project({ plugins: [SEO] });
    const { code, json } = await run(root, ['plugins', '--json']);
    expect(code).toBe(1);
    expect(json).toMatchObject({ ok: false, error: { code: 'PLG_MISSING_REQUIRE' } });
  });

  it('PLG-04 options that the plugin does not take are BK_PLUGIN_OPTIONS', async () => {
    const { root } = project({ plugins: [PAGES], entries: ['["@bieberkit/plugin-pages", { depth: 3 }]'] });
    expect((await run(root, ['plugins', '--json'])).json).toMatchObject({ error: { code: 'BK_PLUGIN_OPTIONS' } });
  });

  it('CFG-09 a config that is not valid reports every problem together, each with its key', async () => {
    const { root } = project({
      config:
        "export default { name: '', author: 'A', license: 'MIT', database: { dialect: 'oracle' }, tenancy: { mode: 'single' }, locales: { default: 'en', supported: ['en'] }, plugins: [] };\n",
    });
    const { code, json } = await run(root, ['plugins', '--json']);
    expect(code).toBe(1);
    const error = Object(json['error']);
    expect(error.code).toBe('CFG_CONFIG_INVALID');
    expect(error.problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe('section 5.2 env:check', () => {
  const REQUIRED = { DATABASE_URL: ':memory:', APP_KEY: 'k'.repeat(44) };

  it('CFG-02 says that the environment is valid, with what the file and the real variables gave', async () => {
    const { root } = project({ plugins: [PAGES], dotenv: 'PAGES_ROOT=/srv/pages\n' });
    const { code, json } = await run(root, ['env:check', '--json'], REQUIRED);
    expect(json).toMatchObject({ ok: true, data: { valid: true } });
    expect(code).toBe(0);
  });

  it('CFG-09 a key that is missing is reported with its code and every other problem, exit code 1', async () => {
    const { root } = project({ plugins: [PAGES] });
    const { code, json, err } = await run(root, ['env:check', '--json'], REQUIRED);
    expect(code).toBe(1);
    expect(json).toMatchObject({ ok: false, error: { code: 'CFG_ENV_MISSING' } });
    expect(JSON.stringify(Object(json['error']).problems)).toContain('PAGES_ROOT');
    expect(err).toBe('');
    const human = await run(root, ['env:check'], REQUIRED);
    expect(human.err).toContain('error[CFG_ENV_MISSING]');
    expect(human.err).toContain('PAGES_ROOT');
  });
});

describe('section 5.2 env:example', () => {
  it('CFG-06 prints every key of core and of the plugins, and never the value or the default of a secret', async () => {
    const { root } = project({ plugins: [PAGES] });
    const { code, out } = await run(root, ['env:example']);
    expect(code).toBe(0);
    expect(out).toContain('DATABASE_URL=');
    expect(out).toContain('PAGES_ROOT=');
    expect(out).toContain('# Folder of the page files');
    expect(out).toMatch(/APP_KEY=\n/);
  });

  it('GEN-03 gives the same bytes at every run', async () => {
    const { root } = project({ plugins: [SEO, PAGES] });
    const first = await run(root, ['env:example', '--json']);
    const second = await run(root, ['env:example', '--json']);
    expect(Object(first.json['data']).text).toBe(Object(second.json['data']).text);
    expect(Object(first.json['data']).text.indexOf('PAGES_ROOT')).toBeLessThan(
      Object(first.json['data']).text.indexOf('SEO_SITEMAP'),
    );
  });

  it('GEN-01 --check fails with 3 when the file is missing or out of date, and passes when --write made it', async () => {
    const { root } = project({ plugins: [PAGES] });
    const file = join(root, '.env.example');
    expect((await run(root, ['env:example', '--check'])).code).toBe(3);
    expect(existsSync(file)).toBe(false);
    expect((await run(root, ['env:example', '--write'])).code).toBe(0);
    expect(readFileSync(file, 'utf8')).toContain('PAGES_ROOT=');
    expect((await run(root, ['env:example', '--check'])).code).toBe(0);
    writeFileSync(file, 'EDITED=1\n');
    const stale = await run(root, ['env:example', '--check', '--json']);
    expect(stale.code).toBe(3);
    expect(stale.json).toMatchObject({ ok: false, data: { upToDate: false } });
    expect((await run(root, ['env:example', '--write'])).code).toBe(0);
    expect((await run(root, ['env:example', '--check'])).code).toBe(0);
  });

  it('GEN-01 --write leaves a file that is already right alone', async () => {
    const { root } = project();
    await run(root, ['env:example', '--write']);
    const again = await run(root, ['env:example', '--write', '--json']);
    expect(again.json).toMatchObject({ data: { changed: false } });
  });
});
