/**
 * BieberKit
 *
 * @file        packages/server/src/seed-doctor.test.ts
 * @description Tests of the seeders and of the doctor on throwaway projects: plugin seeds in order, the seed of the project, and each service that is reachable or not (section 5.2).
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diagnose } from './doctor.ts';
import { seed } from './seed.ts';
import { makeProject, testEnv } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});
const project = (files: Record<string, string> = {}): Fixture => {
  const made = makeProject(files);
  fixtures.push(made);
  return made;
};

const plugin = (
  name: string,
  requires: string,
  mark: string,
): string => `import { definePlugin } from '@bieberkit/core';
export default definePlugin({
  name: '${name}', version: '1.0.0', core: '*', dialects: ['sqlite'], requires: ${requires},
  seed: async () => { (globalThis.__seeded ??= []).push('${mark}'); },
});
`;

function withPlugins(): Fixture {
  const fixture = project();
  for (const [name, requires, mark] of [
    ['@bieberkit/plugin-b', "{ '@bieberkit/plugin-a': '*' }", 'b'],
    ['@bieberkit/plugin-a', '{}', 'a'],
  ] as const) {
    const folder = join(fixture.root, 'node_modules', name);
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
    writeFileSync(join(folder, 'index.mjs'), plugin(name, requires, mark));
  }
  writeFileSync(
    join(fixture.root, 'bieberkit.config.ts'),
    `import { defineConfig } from '@bieberkit/core';
export default defineConfig({ name: 'demo', author: 'Test <test@example.com>', license: 'UNLICENSED', database: { dialect: 'sqlite' }, tenancy: { mode: 'single' }, locales: { default: 'en', supported: ['en'] }, plugins: ['@bieberkit/plugin-b', '@bieberkit/plugin-a'] });
`,
  );
  return fixture;
}

const seeded = (): string[] => Reflect.get(globalThis, '__seeded') ?? [];

describe('section 5.2 db:seed', () => {
  it('5.2 runs the seed of each plugin in boot order, and then the seed of the project', async () => {
    Reflect.set(globalThis, '__seeded', []);
    const fixture = withPlugins();
    writeFileSync(
      join(fixture.root, 'apps/server/src/seed.ts'),
      "// Plain JavaScript: the test runner reads a file that is imported with a query by its extension, which hides the TypeScript.\nexport default async function seed() { globalThis.__seeded.push('project'); }\n",
    );
    const env = await testEnv(fixture.root);
    const done = await seed({ cwd: fixture.root, env });
    expect(done.ran).toEqual(['@bieberkit/plugin-a', '@bieberkit/plugin-b', 'project']);
    expect(seeded()).toEqual(['a', 'b', 'project']);
  });

  it('5.2 a project with nothing to seed runs nothing', async () => {
    const fixture = project();
    expect((await seed({ cwd: fixture.root, env: await testEnv(fixture.root) })).ran).toEqual([]);
  });

  it('5.2 a seed file that exports no function is BK_SEED_NOT_EXPORTED', async () => {
    const fixture = project({ 'apps/server/src/seed.ts': 'export const x = 1;\n' });
    await expect(seed({ cwd: fixture.root, env: await testEnv(fixture.root) })).rejects.toMatchObject({
      code: 'BK_SEED_NOT_EXPORTED',
    });
  });
});

describe('section 5.2 doctor', () => {
  it('5.2 says that each service answers, in a fixed order', async () => {
    const fixture = project();
    const findings = await diagnose({ cwd: fixture.root, env: await testEnv(fixture.root) });
    expect(findings.map((finding) => [finding.id, finding.level])).toEqual([
      ['env', 'ok'],
      ['database', 'ok'],
      ['mail', 'ok'],
      ['storage', 'warning'],
    ]);
    expect(findings[3]?.fix).toContain('first file');
  });

  it('5.2 a database that does not answer is an error with what to do', async () => {
    const fixture = project();
    const env = await testEnv(fixture.root, {
      DB_CONNECTION: 'postgres',
      DATABASE_URL: 'postgres://nobody:x@127.0.0.1:1/none',
    });
    const database = (await diagnose({ cwd: fixture.root, env })).find((finding) => finding.id === 'database');
    expect(database).toMatchObject({ level: 'error', message: expect.stringContaining('does not answer') });
    expect(database?.fix).toContain('DATABASE_URL');
  });

  it('5.2 an environment that is not valid is the one finding, and the others are not tried', async () => {
    const fixture = project();
    const findings = await diagnose({ cwd: fixture.root, env: { APP_PORT: 'x' } });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'env', level: 'error', fix: 'Run: bieberkit env:check' });
  });

  it('5.2 Valkey is checked with the findings of the cache package, and S3 needs its keys', async () => {
    const fixture = project();
    const env = await testEnv(fixture.root, { QUEUE_DRIVER: 'redis', STORAGE_DISK: 's3' });
    const findings = await diagnose({ cwd: fixture.root, env });
    expect(findings.find((finding) => finding.id === 'redis.queue.url')?.level).toBe('error');
    expect(findings.find((finding) => finding.id === 'storage')).toMatchObject({
      level: 'error',
      fix: expect.stringContaining('S3_BUCKET'),
    });
  });
});
