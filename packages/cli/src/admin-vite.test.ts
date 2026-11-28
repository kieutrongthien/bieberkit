/**
 * BieberKit
 *
 * @file        packages/cli/src/admin-vite.test.ts
 * @description Tests of the Vite plugin that builds the admin of a project from the plugins of its config: the list of admin parts, every mistake that stops the build, one copy of each shared package, and the page of dev (UI-34, UI-36, UI-37).
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

import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { adminDevPage, adminPartsOf, bieberkitAdmin, duplicatedPackages } from './admin-vite.ts';
import { makeProject } from './testing/project.ts';
import type { Fixture, FixtureOptions } from './testing/project.ts';

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The Vite of the repository, the version that a project pins. */
const VITE = join(PACKAGES, 'admin-antd', 'node_modules', 'vite');

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

/** The admin part of a plugin: a sign in or a page, whose chunk carries a text that the test looks for. */
const part = (name: string, extra: string): string => `import { defineAdminPlugin } from '@bieberkit/admin-core';
export default defineAdminPlugin({ name: '${name}', ${extra} });
`;
const SIGN_IN = 'signIn: { load: () => import("./view.js") }';
const view = (marker: string): string => `export default () => '${marker}';\n`;

const MAIN = `import { parts } from 'virtual:bieberkit/admin';
document.title = parts.map((part) => part.name).join(',');
for (const part of parts) for (const page of part.pages ?? []) void page.load();
for (const part of parts) void part.signIn?.load();
for (const part of parts) for (const action of part.headerActions ?? []) void action.load();
`;

interface PluginFixture {
  readonly name: string;
  /** The source of `admin/index.js`. Without it the plugin has no admin part. */
  readonly admin?: string;
  readonly marker?: string;
  /** Left out of the dependencies of apps/admin. */
  readonly notInAdmin?: boolean;
}

function project(plugins: readonly PluginFixture[], options: FixtureOptions = {}): { root: string; admin: string } {
  const files: Record<string, string> = {
    'apps/admin/package.json': JSON.stringify({ name: 'demo-admin', private: true, type: 'module' }),
    'apps/admin/index.html':
      '<!doctype html><html lang="en"><head></head><body><script type="module" src="./src/main.js"></script></body></html>\n',
    'apps/admin/src/main.js': MAIN,
    ...options.files,
  };
  for (const plugin of plugins) {
    if (plugin.admin === undefined) continue;
    files[`node_modules/${plugin.name}/admin/index.js`] = plugin.admin;
    files[`node_modules/${plugin.name}/admin/view.js`] = view(plugin.marker ?? plugin.name);
  }
  const fixture = makeProject({ ...options, plugins: plugins.map(({ name }) => ({ name })), files });
  fixtures.push(fixture);
  const { root } = fixture;
  // makeProject writes the manifest of each plugin without an admin part: add the export, as the published package has it.
  for (const plugin of plugins) {
    if (plugin.admin === undefined) continue;
    const manifest = join(root, 'node_modules', plugin.name, 'package.json');
    const read: Record<string, unknown> = JSON.parse(readFileSync(manifest, 'utf8'));
    read['exports'] = { ...Object(read['exports']), './admin': './admin/index.js' };
    writeFileSync(manifest, JSON.stringify(read));
  }
  const modules = join(root, 'apps/admin/node_modules');
  mkdirSync(join(modules, '@bieberkit'), { recursive: true });
  symlinkSync(join(PACKAGES, 'admin-core'), join(root, 'node_modules/@bieberkit/admin-core'), 'dir');
  symlinkSync(VITE, join(root, 'node_modules/vite'), 'dir');
  for (const plugin of plugins)
    if (plugin.notInAdmin !== true)
      symlinkSync(join(root, 'node_modules', plugin.name), join(modules, plugin.name), 'dir');
  return { root, admin: join(root, 'apps/admin') };
}

/** Builds the admin of a project as `bieberkit build` does, and answers the JavaScript of the build. */
async function build(admin: string): Promise<{ scripts: string }> {
  const vite: unknown = await import(/* @vite-ignore */ pathToFileURL(join(VITE, 'dist/node/index.js')).href);
  const run: unknown = Reflect.get(Object(vite), 'build');
  if (typeof run !== 'function') throw new Error('Expected the build of Vite.');
  await Reflect.apply(run, undefined, [
    {
      root: admin,
      configFile: false,
      logLevel: 'silent',
      plugins: [bieberkitAdmin()],
    },
  ]);
  const assets = join(admin, 'dist/assets');
  return {
    scripts: readdirSync(assets)
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(join(assets, file), 'utf8'))
      .join('\n'),
  };
}

describe('UI-37 the admin of a project is built from its plugins', () => {
  it('UI-37 holds the parts of the plugins of the config in boot order, and leaves out a plugin without one', async () => {
    const { admin } = project([
      { name: 'bieberkit-plugin-b', admin: part('bieberkit-plugin-b', SIGN_IN), marker: 'MARK-OF-B' },
      { name: 'bieberkit-plugin-nothing' },
      {
        name: 'bieberkit-plugin-a',
        admin: part('bieberkit-plugin-a', 'headerActions: [{ id: "a", load: () => import("./view.js") }]'),
        marker: 'MARK-OF-A',
      },
    ]);
    // The boot order of plugins with no requirement between them is the order of their names.
    const { parts, problems } = await adminPartsOf(join(admin, '..', '..'));
    expect([parts.map((item) => item.name), problems]).toEqual([['bieberkit-plugin-a', 'bieberkit-plugin-b'], []]);
    const { scripts } = await build(admin);
    expect(scripts).toContain('MARK-OF-A');
    expect(scripts).toContain('MARK-OF-B');
    expect(scripts).not.toContain('bieberkit-plugin-nothing');
  }, 60_000);

  it('UI-37 adds the part of the project itself, apps/admin/src/part.js, after those of the plugins', async () => {
    const { admin } = project([{ name: 'bieberkit-plugin-users', admin: part('bieberkit-plugin-users', SIGN_IN) }], {
      files: {
        'apps/admin/src/part.js': part('app', 'headerActions: [{ id: "MINE", load: () => import("./main.js") }]'),
      },
    });
    expect((await build(admin)).scripts).toContain('MINE');
  }, 60_000);

  it('UI-36 reads the texts that a part loads with an import of its own, to check each language', async () => {
    const texts = 'messages: { en: () => import("./en.js") }';
    const { admin } = project(
      [{ name: 'bieberkit-plugin-a', admin: part('bieberkit-plugin-a', `${SIGN_IN}, ${texts}`) }],
      {
        files: { 'node_modules/bieberkit-plugin-a/admin/en.js': 'export default { "a.title": "MARK-OF-TEXT" };\n' },
      },
    );
    expect((await build(admin)).scripts).toContain('bieberkit-plugin-a');
  }, 60_000);

  it('UI-36 stops with every mistake of the parts, the plugin of each, and the languages of the project', async () => {
    const { admin } = project([
      { name: 'bieberkit-plugin-users', admin: part('bieberkit-plugin-users', `${SIGN_IN}, sidebar: []`) },
      {
        name: 'bieberkit-plugin-notes',
        admin: part(
          'bieberkit-plugin-notes',
          'pages: [{ path: "/account", title: "notes.title", load: () => import("./view.js") }]',
        ),
      },
    ]);
    const error = await build(admin).then(
      () => undefined,
      (caught: unknown) => String(caught),
    );
    expect(error).toContain('BK_ADMIN_PART_INVALID');
    expect(error).toContain('bieberkit-plugin-users: "sidebar" is no slot');
    expect(error).toContain('bieberkit-plugin-notes: "/account" is an address of the shell');
    expect(error).toContain('bieberkit-plugin-notes: The English texts (messages.en) are missing.');
  }, 60_000);

  it('UI-26 stops when no plugin gives the sign in', async () => {
    const { admin } = project([{ name: 'bieberkit-plugin-a', admin: part('bieberkit-plugin-a', '') }]);
    await expect(build(admin)).rejects.toThrow(/No plugin gives the sign in/);
  }, 60_000);

  it('UI-37 names the plugin whose admin part throws, and never builds a blank admin', async () => {
    const { admin } = project([
      { name: 'bieberkit-plugin-broken', admin: "throw new Error('BOOM-in-a-part');\nexport default {};\n" },
    ]);
    await expect(build(admin)).rejects.toThrow(/bieberkit-plugin-broken[\s\S]*BOOM-in-a-part/);
  }, 60_000);

  it('UI-36 refuses a part whose name is not the one of its plugin, which its texts would be checked against', async () => {
    const { admin } = project([{ name: 'bieberkit-plugin-a', admin: part('bieberkit-plugin-other', SIGN_IN) }]);
    await expect(build(admin)).rejects.toThrow(/bieberkit-plugin-a[\s\S]*bieberkit-plugin-other/);
  }, 60_000);

  it('UI-37 says how to fix a plugin with an admin part that apps/admin does not depend on', async () => {
    const { admin } = project([
      { name: 'bieberkit-plugin-a', admin: part('bieberkit-plugin-a', SIGN_IN), notInAdmin: true },
    ]);
    await expect(build(admin)).rejects.toThrow(
      /bieberkit-plugin-a[\s\S]*pnpm --filter \.\/apps\/admin add bieberkit-plugin-a/,
    );
  }, 60_000);
});

describe('UI-37 one copy of each shared package', () => {
  it('UI-37 finds a package that a build takes from two folders, and none that it takes from one', () => {
    const one = '/p/node_modules/.pnpm/react@19.3.1/node_modules/react';
    const two = '/p/node_modules/.pnpm/react@19.3.0/node_modules/react';
    const antd = '/p/node_modules/.pnpm/antd@6.7.1_a/node_modules/antd';
    expect(duplicatedPackages([`${one}/index.js`, `${one}/jsx-runtime.js`, `${antd}/es/index.js`])).toEqual([]);
    expect(duplicatedPackages([`${one}/index.js`, `${two}/index.js`, `${antd}/es/index.js`])).toEqual(['react']);
  });

  it('UI-37 does not take react-dom for react', () => {
    expect(duplicatedPackages(['/a/node_modules/react/index.js', '/b/node_modules/react-dom/index.js'])).toEqual([]);
  });
});

describe('UI-06 UI-33 the page of the admin in dev', () => {
  it('writes the theme, the brand and the address as the web role writes them', async () => {
    const fixture = makeProject();
    fixtures.push(fixture);
    const write = await adminDevPage(fixture.root);
    const page = write('<html><head></head><body></body></html>');
    expect(page).toContain('<meta name="bk-admin-base" content="" />');
    expect(page).toContain('<meta name="bk-theme" content="');
    expect(page).toContain('<style id="bk-theme">');
  });
});
