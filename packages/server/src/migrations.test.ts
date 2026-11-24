/**
 * BieberKit
 *
 * @file        packages/server/src/migrations.test.ts
 * @description Tests of the migrate commands over a project: make from the entities, run the steps of the framework and of the plugins and then the files, status and rollback (DATA-08, DATA-24, DATA-25).
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

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeMigration, migrationStatus, rollbackMigration, runMigrations } from './migrations.ts';
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

const STEP_PLUGIN = (
  name: string,
  version: string,
  id: string,
  table: string,
): string => `import { definePlugin } from '@bieberkit/core';
export default definePlugin({
  name: '${name}', version: '${version}', core: '*', dialects: ['sqlite'],
  migrations: [{ plugin: '${name}', version: '${version}', id: '${id}', kind: 'expand',
    up: async (trx) => { await trx.schema.createTable('${table}').addColumn('id', 'varchar(10)', (c) => c.notNull()).execute(); } }],
});
`;

function withPlugin(): Fixture {
  const fixture = project();
  const name = '@bieberkit/plugin-a';
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
  writeFileSync(join(folder, 'index.mjs'), STEP_PLUGIN(name, '1.0.0', 'a-create', 'plugin_a'));
  writeFileSync(
    join(fixture.root, 'bieberkit.config.ts'),
    `import { defineConfig } from '@bieberkit/core';
export default defineConfig({ name: 'demo', author: 'Test <test@example.com>', license: 'UNLICENSED', database: { dialect: 'sqlite' }, tenancy: { mode: 'single' }, locales: { default: 'en', supported: ['en'] }, plugins: ['${name}'] });
`,
  );
  return fixture;
}

async function options(fixture: Fixture) {
  return { cwd: fixture.root, env: await testEnv(fixture.root) };
}

describe('DATA-08 the migrate commands over a project', () => {
  it('DATA-08 makes the first migration from the entities, in migrations/ of the project, and nothing when they agree with the snapshot', async () => {
    const fixture = project();
    const made = await makeMigration(await options(fixture));
    expect(made?.up.join('\n')).toMatch(/create table .?crm_people/i);
    expect(readdirSync(join(fixture.root, 'migrations')).toSorted()).toEqual([
      '.snapshot-sqlite.json',
      `${made?.name}.ts`,
    ]);
    expect(await makeMigration(await options(fixture))).toBeNull();
  });

  it('DATA-08 runs the steps of the framework and then the files of the project, and runs nothing the second time', async () => {
    const fixture = project();
    const opts = await options(fixture);
    const made = await makeMigration(opts);
    const first = await runMigrations(opts);
    expect(first.migrations).toEqual([made?.name]);
    expect(first.steps.applied.some((step) => step.startsWith('@bieberkit/data/'))).toBe(true);
    expect(first.steps.applied.some((step) => step.startsWith('@bieberkit/auth/'))).toBe(true);
    const second = await runMigrations(opts);
    expect(second.migrations).toEqual([]);
    expect(second.steps.applied).toEqual([]);
  });

  it('DATA-24 runs the steps that a plugin contributes, after the framework and in the boot order', async () => {
    const fixture = withPlugin();
    const done = await runMigrations(await options(fixture));
    expect(done.steps.applied.at(-1)).toBe('@bieberkit/plugin-a/a-create');
    expect(done.steps.applied[0]?.startsWith('@bieberkit/data/')).toBe(true);
  });

  it('DATA-08 status says what ran and what waits, for the files and for the steps', async () => {
    const fixture = withPlugin();
    const opts = await options(fixture);
    const made = await makeMigration(opts);
    const before = await migrationStatus(opts);
    expect(before.pending).toEqual([made?.name]);
    expect(before.executed).toEqual([]);
    expect(before.steps.pending).toContain('@bieberkit/plugin-a/a-create');
    await runMigrations(opts);
    const after = await migrationStatus(opts);
    expect(after.pending).toEqual([]);
    expect(after.executed).toEqual([made?.name]);
    expect(after.steps.pending).toEqual([]);
    expect(after.steps.applied).toContain('@bieberkit/plugin-a/a-create');
  });

  it('DATA-08 rolls back the last migration of the project and says which', async () => {
    const fixture = project();
    const opts = await options(fixture);
    await makeMigration(opts);
    await runMigrations(opts);
    const module = join(fixture.root, 'apps/server/src/modules/crm/module.ts');
    writeFileSync(
      module,
      readFileSync(module, 'utf8').replace('secretNote:', 'title: f.string({ max: 20 }).optional(), secretNote:'),
    );
    const second = await makeMigration(opts);
    await runMigrations(opts);
    expect(await rollbackMigration(opts)).toEqual([second?.name]);
    expect((await migrationStatus(opts)).pending).toEqual([second?.name]);
  });

  it('DATA-08 refuses a migration that drops something, and says which, until it is told to run it', async () => {
    const fixture = project();
    const opts = await options(fixture);
    await makeMigration(opts);
    await runMigrations(opts);
    writeFileSync(
      join(fixture.root, 'migrations', 'Migration20300101000000.ts'),
      "import { Migration } from '@bieberkit/data/migration';\nexport class Migration20300101000000 extends Migration {\n  override name = 'Migration20300101000000';\n  override up(): void {\n    this.addSql('alter table `crm_people` drop column `name`;');\n  }\n}\n",
    );
    await expect(runMigrations(opts)).rejects.toMatchObject({ code: 'DATA_MIGRATION_DESTRUCTIVE' });
    expect(existsSync(join(fixture.root, 'migrations'))).toBe(true);
  });
});
