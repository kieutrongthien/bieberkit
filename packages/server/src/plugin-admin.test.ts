/**
 * BieberKit
 *
 * @file        packages/server/src/plugin-admin.test.ts
 * @description Tests of what the plugins add to the admin: the contributions are read and checked with their files, and the web role serves each folder under the admin and nothing outside it (UI-04, ADR 0037).
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { definePlugin } from '@bieberkit/core';
import { createHttpServer } from '@bieberkit/http';
import type { AdminContribution } from '@bieberkit/http';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAdmin } from './admin.ts';
import { pluginAdminOf } from './plugin-admin.ts';
import type { LoadedPlugin } from './project.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A plugin package on disk with the files of its folder admin, and the plugin that exports `admin`. */
function plugin(name: string, admin: AdminContribution | undefined, files: Record<string, string>): LoadedPlugin {
  const root = mkdtempSync(join(tmpdir(), 'bk-plugin-'));
  folders.push(root);
  mkdirSync(join(root, 'admin'), { recursive: true });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(root, 'admin', file), text);
  const def = definePlugin({
    name,
    version: '1.0.0',
    core: '*',
    dialects: ['sqlite'],
    ...(admin === undefined ? {} : { admin }),
  });
  return { def, options: undefined, root };
}

describe('UI-04 the contributions of the plugins are read and checked', () => {
  it('UI-04 a plugin that adds nothing adds nothing, and one that adds pages gives its folder to be served', () => {
    const none = plugin('@acme/plugin-plain', undefined, {});
    const rich = plugin(
      '@acme/plugin-reports',
      { pages: [{ path: 'sales', module: 'sales.js', title: 'Sales', menu: true }] },
      { 'sales.js': 'export default () => () => null;' },
    );
    const read = pluginAdminOf({ plugins: [none, rich] });
    expect(read.extensions.pages.map((page) => [page.plugin, page.module])).toEqual([
      ['reports', '/plugins/reports/sales.js'],
    ]);
    expect(read.extensions.menu.map((item) => item.path)).toEqual(['/ext/reports/sales']);
    expect(read.folders.map((folder) => folder.plugin)).toEqual(['reports']);
  });

  it('UI-04 stops the boot, with every problem together, for a contribution that is not valid and a file that is not there', () => {
    const wrong = plugin('@acme/plugin-wrong', { pages: [{ path: 'Bad Path', module: 'x.js', title: 'X' }] }, {});
    const missing = plugin('@acme/plugin-missing', { widgets: [{ slot: 'dashboard', module: 'gone.js' }] }, {});
    const stopped = (): unknown => {
      try {
        pluginAdminOf({ plugins: [wrong, missing] });
      } catch (error) {
        return error;
      }
      return undefined;
    };
    const error = stopped();
    expect(error).toMatchObject({ code: 'BK_ADMIN_CONTRIBUTION_INVALID' });
    const text = error instanceof Error ? error.message : '';
    expect(text).toContain('wrong: admin.pages');
    expect(text).toContain('gone.js');
  });
});

function serve() {
  const admin = mkdtempSync(join(tmpdir(), 'bk-admin-'));
  folders.push(admin);
  writeFileSync(join(admin, 'index.html'), '<!doctype html><head></head><title>admin</title>');
  const rich = plugin(
    '@acme/plugin-reports',
    { pages: [{ path: 'sales', module: 'sales.js', title: 'Sales' }] },
    { 'sales.js': 'export default 1;' },
  );
  writeFileSync(join(rich.root, 'secret.txt'), 'not in the folder admin');
  const server = createHttpServer({ APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false });
  const root = mkdtempSync(join(tmpdir(), 'bk-root-'));
  folders.push(root);
  mkdirSync(join(root, 'apps/server/node_modules/@bieberkit/admin-antd/dist/app'), { recursive: true });
  writeFileSync(
    join(root, 'apps/server/node_modules/@bieberkit/admin-antd/dist/app/index.html'),
    '<!doctype html><head></head><title>admin</title>',
  );
  const { folders: served } = pluginAdminOf({ plugins: [rich] });
  registerAdmin(
    server,
    root,
    { origin: 'http://x.test', host: undefined, prefix: '/admin' },
    undefined,
    undefined,
    undefined,
    served,
  );
  return server;
}

describe('UI-04 the folder of a plugin is served under the admin', () => {
  it("UI-04 sends a module as a script of the admin with its policy, and a missing file, a folder above and the plugin's other files are a 404", async () => {
    const server = serve();
    const module = await server.inject({ method: 'GET', url: '/admin/plugins/reports/sales.js' });
    expect(module.statusCode).toBe(200);
    expect(module.headers['content-type']).toContain('text/javascript');
    expect(module.headers['content-security-policy']).toContain("script-src 'self'");
    expect(module.body).toBe('export default 1;');
    for (const url of [
      '/admin/plugins/reports/gone.js',
      '/admin/plugins/reports/secret.txt',
      '/admin/plugins/reports/..%2fsecret.txt',
      '/admin/plugins/reports/',
      '/admin/plugins/reports/not-a-file',
    ]) {
      expect(`${url} ${String((await server.inject({ method: 'GET', url })).statusCode)}`).toMatch(/ 404$/);
    }
    expect((await server.inject({ method: 'POST', url: '/admin/plugins/reports/sales.js' })).statusCode).toBe(405);
  });
});
