/**
 * BieberKit
 *
 * @file        packages/cli/src/plugin-manifest.test.ts
 * @description Tests of the plugin build and read-only manifest check through the CLI, without booting an application (PLG-07).
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

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePlugins } from '@bieberkit/core';
import type { Manifest } from '@bieberkit/core';
import { createRunner } from 'create-bieberkit/kit';
import { buildCommand } from './commands/build.ts';
import { makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isManifest(value: unknown): value is Manifest {
  if (!isRecord(value) || typeof value['core'] !== 'string' || !isRecord(value['requires'])) return false;
  if (!Object.values(value['requires']).every((item: unknown) => typeof item === 'string')) return false;
  const dialects = value['dialects'];
  if (
    !Array.isArray(dialects) ||
    !dialects.every((item: unknown) => item === 'postgres' || item === 'mysql' || item === 'sqlite')
  )
    return false;
  return ['conflicts', 'env', 'tables', 'routes', 'permissions', 'admin'].every((key) => {
    const items = value[key];
    return Array.isArray(items) && items.every((item: unknown) => typeof item === 'string');
  });
}

const fixtures: Fixture[] = [];
const MANIFEST = {
  core: '*',
  dialects: ['mysql', 'postgres', 'sqlite'],
  requires: {},
  conflicts: [],
  env: ['DEMO_LABEL'],
  tables: [],
  routes: [],
  permissions: ['demo.read', 'demo.write'],
  admin: [],
};

const SOURCE = `import { definePlugin, env } from '@bieberkit/core';
export default definePlugin({
  name: '@bieberkit/plugin-demo', version: '1.2.3', core: '*',
  dialects: ['sqlite', 'postgres', 'mysql'],
  permissions: ['demo.write', 'demo.read'],
  env: { DEMO_LABEL: env.string().default('Demo') },
  seed() { throw new Error('A plugin build must never seed the database'); },
});
`;

function plugin(metadata: Record<string, unknown> = {}, source = SOURCE): Fixture {
  const fixture = makeProject({
    files: {
      'package.json':
        JSON.stringify(
          {
            name: '@bieberkit/plugin-demo',
            version: '1.2.3',
            type: 'module',
            keywords: ['bieberkit-plugin'],
            exports: { '.': './index.mjs' },
            files: ['index.mjs'],
            description: 'Keep this description',
            custom: { keep: true },
            ...metadata,
          },
          null,
          2,
        ) + '\n',
      'index.mjs': source,
    },
  });
  // A plugin author has a package, not an application config or a database.
  rmSync(join(fixture.root, 'bieberkit.config.ts'));
  fixtures.push(fixture);
  return fixture;
}

function packageText(root: string): string {
  return readFileSync(join(root, 'package.json'), 'utf8');
}

function packageJson(root: string): Record<string, unknown> {
  const value: unknown = JSON.parse(packageText(root));
  if (!isRecord(value)) throw new Error('Expected a package object');
  return value;
}

async function run(root: string, ...flags: string[]): Promise<{ code: number; data: unknown; error: unknown }> {
  const stdout: string[] = [];
  const runner = createRunner({ name: 'bieberkit', version: '0.0.0', commands: [buildCommand()] });
  const code = await runner(['build', '--json', ...flags], {
    cwd: root,
    stdout: (text) => stdout.push(text),
    stderr: () => undefined,
  });
  const result: unknown = JSON.parse(stdout.join(''));
  if (!isRecord(result)) throw new Error('Expected a CLI response object');
  return { code, data: result['data'], error: result['error'] };
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

describe('PLG-07 plugin build', () => {
  it('PLG-07 writes a canonical manifest without booting, seeding or needing an app config', async () => {
    const { root } = plugin();
    const result = await run(root);
    expect(result.code).toBe(0);
    expect(packageJson(root)['bieberkit']).toEqual(MANIFEST);
    expect(existsSync(join(root, '.bieberkit'))).toBe(false);
    expect(existsSync(join(root, 'apps'))).toBe(false);
  });

  it('PLG-07 preserves package identity, exports and unrelated metadata', async () => {
    const { root } = plugin();
    expect((await run(root)).code).toBe(0);
    expect(packageJson(root)).toMatchObject({
      name: '@bieberkit/plugin-demo',
      version: '1.2.3',
      exports: { '.': './index.mjs' },
      description: 'Keep this description',
      custom: { keep: true },
    });
  });

  it('PLG-07 a repeated build leaves the complete package file unchanged', async () => {
    const { root } = plugin();
    expect((await run(root)).code).toBe(0);
    const first = packageText(root);
    expect((await run(root)).code).toBe(0);
    expect(packageText(root)).toBe(first);
  });

  it('PLG-07 regenerates a stale field from the plugin definition', async () => {
    const { root } = plugin({ bieberkit: { ...MANIFEST, permissions: [] } });
    expect((await run(root)).code).toBe(0);
    expect(packageJson(root)['bieberkit']).toEqual(MANIFEST);
  });

  it.each([
    [{ name: '@bieberkit/plugin-other' }, 'PLG_MANIFEST_NAME'],
    [{ version: '9.9.9' }, 'PLG_MANIFEST_VERSION'],
  ])('PLG-07 refuses mismatched package identity with %s', async (metadata, code) => {
    const { root } = plugin(metadata);
    const before = packageText(root);
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.error).toMatchObject({ code });
    expect(packageText(root)).toBe(before);
  });

  it('PLG-07 a failed definition import preserves package metadata', async () => {
    const { root } = plugin({}, "throw new Error('broken plugin definition');\n");
    const before = packageText(root);
    const result = await run(root);
    expect(result.code).toBe(1);
    expect(result.error).toMatchObject({ code: 'BK_PLUGIN_IMPORT' });
    expect(packageText(root)).toBe(before);
  });
});

describe('PLG-07 read-only manifest verification', () => {
  it('PLG-07 checks current metadata successfully without writing', async () => {
    const { root } = plugin({ bieberkit: MANIFEST });
    const before = packageText(root);
    expect((await run(root, '--check')).code).toBe(0);
    expect(packageText(root)).toBe(before);
  });

  it.each([
    [{}, 'PLG_MANIFEST_MISSING'],
    [{ bieberkit: { ...MANIFEST, permissions: [] } }, 'PLG_MANIFEST_STALE'],
    [{ bieberkit: MANIFEST, version: '9.9.9' }, 'PLG_MANIFEST_VERSION'],
    [{ bieberkit: MANIFEST, name: '@bieberkit/plugin-other' }, 'PLG_MANIFEST_NAME'],
  ])('PLG-07 reports %s without regenerating metadata', async (metadata, code) => {
    const { root } = plugin(metadata);
    const before = packageText(root);
    const result = await run(root, '--check');
    expect(result.code).toBe(1);
    expect(result.error).toMatchObject({ code });
    expect(packageText(root)).toBe(before);
  });

  it('PLG-07 accepts reordered object keys and manifest key lists without writing', async () => {
    const reversed = Object.fromEntries(Object.entries(MANIFEST).toReversed());
    reversed['permissions'] = ['demo.write', 'demo.read'];
    reversed['dialects'] = ['sqlite', 'postgres', 'mysql'];
    const { root } = plugin({ bieberkit: reversed });
    const before = packageText(root);
    expect((await run(root, '--check')).code).toBe(0);
    expect(packageText(root)).toBe(before);
  });

  it('PLG-07 finds the plugin package when invoked from a child folder', async () => {
    const { root } = plugin({ bieberkit: MANIFEST });
    // node_modules already exists and has no package.json of its own in this fixture.
    expect((await run(join(root, 'node_modules'), '--check')).code).toBe(0);
  });
});

describe('PLG-07 package and check boundaries', () => {
  it('PLG-07 recognizes a nonstandard package name through the plugin keyword', async () => {
    const { root } = plugin({ name: '@acme/demo' }, SOURCE.replace('@bieberkit/plugin-demo', '@acme/demo'));
    expect((await run(root)).code).toBe(0);
    expect(packageJson(root)['bieberkit']).toEqual(MANIFEST);
  });

  it('PLG-07 uses a declared source export before an unbuilt default entry', async () => {
    const { root } = plugin({ exports: { '.': { '@bieberkit/source': './index.mjs', default: './dist/index.js' } } });
    expect((await run(root)).code).toBe(0);
    expect(packageJson(root)['bieberkit']).toEqual(MANIFEST);
  });

  it.each(['./missing.mjs', '../outside.mjs'])(
    'PLG-07 rejects an invalid package entry %s without changing metadata',
    async (entry) => {
      const { root } = plugin({ exports: { '.': entry } });
      const before = packageText(root);
      expect((await run(root)).error).toMatchObject({ code: 'BK_PLUGIN_ENTRY' });
      expect(packageText(root)).toBe(before);
    },
  );

  it('PLG-07 rejects an entry that does not default-export a plugin', async () => {
    const { root } = plugin({}, 'export default {};');
    const before = packageText(root);
    expect((await run(root)).error).toMatchObject({ code: 'BK_PLUGIN_NOT_EXPORTED' });
    expect(packageText(root)).toBe(before);
  });

  it('PLG-07 duplicated key-list entries are stale metadata, not harmless reordering', async () => {
    const { root } = plugin({ bieberkit: { ...MANIFEST, permissions: ['demo.read', 'demo.write', 'demo.read'] } });
    expect((await run(root, '--check')).error).toMatchObject({ code: 'PLG_MANIFEST_STALE' });
  });

  it('PLG-07 an application cannot silently interpret build --check as an ordinary build', async () => {
    const made = makeProject();
    fixtures.push(made);
    const result = await run(made.root, '--check');
    expect(result.code).toBe(2);
    expect(result.error).toMatchObject({ code: 'BK_USAGE_PLUGIN_CHECK' });
    expect(existsSync(join(made.root, '.bieberkit'))).toBe(false);
  });
});

it.each(['table', 'route'] as const)('PLG-07 generated runtime %s keys detect plugin collisions', async (kind) => {
  const installed: { name: string; version: string; manifest: Manifest }[] = [];
  for (const short of ['demo', 'other']) {
    const name = `@bieberkit/plugin-${short}`;
    const table = kind === 'table' ? 'bk_shared_rows' : `bk_${short}_rows`;
    const url = kind === 'route' ? '/api/v1/shared/report' : `/api/v1/${short}/report`;
    const source = `import { definePlugin } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';
import { defineRoute } from '@bieberkit/http';
const entity = defineEntity({ name: '${short}.Thing', table: '${table}', fields: { id: f.id(), title: f.string({ min: 1, max: 100 }) },
  permissions: { read: '${short}.read' } });
const route = defineRoute({ method: 'GET', url: '${url}', public: true,
  handler: () => ({ ok: true }),
  schema: { response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } } });
export default definePlugin({ name: '${name}', version: '1.2.3', core: '*', dialects: ['sqlite'],
  permissions: ['${short}.read'], entities: [entity], routes: [route] });`;
    const { root } = plugin({ name }, source);
    expect(await run(root)).toMatchObject({ code: 0 });
    const manifest = packageJson(root)['bieberkit'];
    expect(manifest).toEqual({
      core: '*',
      dialects: ['sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: [table],
      routes: [`GET ${url}`],
      permissions: [`${short}.read`],
      admin: [],
    });
    if (!isManifest(manifest)) throw new Error('Expected a complete manifest');
    installed.push({ name, version: '1.2.3', manifest });
  }
  expect(() => resolvePlugins(installed, { core: '0.0.0', dialect: 'sqlite' })).toThrow(
    expect.objectContaining({
      problems: expect.arrayContaining([
        expect.objectContaining({ code: kind === 'table' ? 'PLG_COLLISION_TABLE' : 'PLG_COLLISION_ROUTE' }),
      ]),
    }),
  );
});
