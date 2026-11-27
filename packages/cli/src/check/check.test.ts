/**
 * BieberKit
 *
 * @file        packages/cli/src/check/check.test.ts
 * @description Tests of bieberkit check on throwaway projects: each rule finds its violation and passes clean code, and the exit code, the JSON and the ignore directive (section 5.2, AI-02, SEC-05, WP-01, DATA-08, SCH-08).
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

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../run.ts';
import { makeProject } from '../testing/project.ts';
import type { Fixture, FixtureOptions } from '../testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

const AUTHOR = 'Test <test@example.com>';
const header = (path: string): string =>
  `/**\n * demo\n *\n * @file        ${path}\n * @description Something.\n * @author      ${AUTHOR}\n * @copyright   Copyright (c) 2026 Test\n * @license     UNLICENSED\n */\n\n`;

/** A source file with a correct header. */
const source = (path: string, body: string): [string, string] => [path, `${header(path)}${body}\n`];

interface Violation {
  code: string;
  file: string;
  line: number;
  severity: string;
}

async function check(files: Record<string, string>, extra: string[] = [], options: FixtureOptions = {}) {
  const fixture = makeProject({ ...options, files });
  fixtures.push(fixture);
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(['check', '--json', ...extra], {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: fixture.root,
  });
  const document: Record<string, unknown> = JSON.parse(out[0] ?? '{}');
  const data = Object(document['data']);
  const violations: Violation[] = Array.isArray(data.violations) ? data.violations : [];
  return { code, document, violations, codes: violations.map((entry) => entry.code), err: err.join('') };
}

const entries = (...list: [string, string][]): Record<string, string> => Object.fromEntries(list);

describe('section 5.2 bieberkit check', () => {
  it('5.2 a project that follows every rule passes with exit code 0', async () => {
    const { code, document, violations } = await check(
      entries(source('apps/server/src/main.ts', 'export const a = 1;')),
      ['headers'],
    );
    expect([code, violations]).toEqual([0, []]);
    expect(document).toMatchObject({
      ok: true,
      command: 'check',
      data: { errors: 0, warnings: 0, rules: ['headers'] },
    });
  });

  it('AI-02 violations end with exit code 3, and each has a code, a file, a line, a fix and a link', async () => {
    const { code, document, violations } = await check({ 'apps/server/src/a.ts': 'export const a = 1;\n' }, [
      'headers',
    ]);
    expect(code).toBe(3);
    expect(document).toMatchObject({ ok: false });
    expect(violations[0]).toMatchObject({
      code: 'BK_HEADER_MISSING',
      file: 'apps/server/src/a.ts',
      line: 1,
      fix: expect.any(String),
      docs: expect.stringContaining('BK_HEADER_MISSING'),
    });
  });

  it('5.2 an unknown rule is a usage error that lists the rules', async () => {
    const result = await check({}, ['nope']);
    expect(result.code).toBe(2);
    expect(JSON.stringify(result.document)).toContain('headers, env-access');
  });

  it('5.2 warnings are shown and do not fail the check', async () => {
    const { code, codes } = await check(
      { ...entries(source('apps/server/src/legacy.orm.ts', 'export const a = 1;')) },
      ['orm'],
    );
    expect([code, codes]).toEqual([0, ['BK_ORM_HANDWRITTEN']]);
  });

  it('AI-02 the directive with a reason lets one violation through, and the one without a reason does not', async () => {
    const withReason = await check(
      entries(
        source(
          'apps/server/src/a.ts',
          "// bieberkit-ignore BK_ENV_ACCESS: the entry of a tool\nconst v = process.env['A'];",
        ),
      ),
      ['env-access'],
    );
    expect(withReason.codes).toEqual([]);
    const without = await check(
      entries(source('apps/server/src/a.ts', "// bieberkit-ignore BK_ENV_ACCESS\nconst v = process.env['A'];")),
      ['env-access'],
    );
    expect(without.codes).toEqual(['BK_ENV_ACCESS']);
  });

  it('GEN-01 generated files, tests, node_modules and builds are not read by the rules about code', async () => {
    const generated = '/**\n * @generated by bieberkit client:generate\n */\nconst v = process.env["A"];\n';
    const result = await check(
      {
        'packages/client/index.ts': generated,
        'apps/server/src/a.test.ts': 'const v = process.env["A"];\n',
        'node_modules/x/index.ts': 'const v = process.env["A"];\n',
        'dist/index.js': 'const v = process.env["A"];\n',
      },
      ['env-access'],
    );
    expect(result.codes).toEqual([]);
  });
});

describe('HDR-01 the headers rule', () => {
  it('HDR-02 finds a wrong path, an empty description, another author and another license, each with its own code', async () => {
    const wrong = `/**\n * demo\n *\n * @file        apps/other.ts\n * @description\n * @author      Someone <s@example.com>\n * @copyright   Copyright (c) 2026 Test\n * @license     MIT\n */\n`;
    const { codes } = await check({ 'apps/server/src/a.ts': wrong }, ['headers']);
    expect(codes.toSorted()).toEqual([
      'BK_HEADER_AUTHOR',
      'BK_HEADER_DESCRIPTION',
      'BK_HEADER_FILE',
      'BK_HEADER_LICENSE',
    ]);
  });

  it('HDR-01 a shebang stays first and the header follows it, and generated files and declaration files are left alone', async () => {
    const { codes } = await check(
      {
        'apps/server/src/bin.ts': `#!/usr/bin/env node\n${header('apps/server/src/bin.ts')}run();\n`,
        'apps/server/src/types.d.ts': 'declare const x: number;\n',
        'packages/client/api.ts': '/**\n * @generated\n */\nexport {};\n',
      },
      ['headers'],
    );
    expect(codes).toEqual([]);
  });

  it('HDR-01 a comment that is not the header is a missing header', async () => {
    const { codes } = await check({ 'apps/server/src/a.ts': '/** Notes. */\nexport {};\n' }, ['headers']);
    expect(codes).toEqual(['BK_HEADER_MISSING']);
  });
});

describe('P8 the env-access rule', () => {
  it('19.2 a script of deploy/ runs in its own container, so it may read its environment', async () => {
    const { violations } = await check(entries(source('deploy/backup.mjs', 'const a = process.env.A;')), [
      'env-access',
    ]);
    expect(violations).toEqual([]);
  });

  it('P8 finds every way to read the environment, and not a string or a comment that says so', async () => {
    const body = [
      'const a = process.env.A;',
      "const b = process['env'];",
      "import { env } from 'node:process';",
      'const { env: c } = process;',
      'process.loadEnvFile();',
      'const d = import.meta.env.X;',
      "const text = 'process.env';",
      '// process.env',
    ].join('\n');
    const { violations } = await check(entries(source('apps/server/src/a.ts', body)), ['env-access']);
    expect(violations.map((entry) => entry.line - 10)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('P8 the config of a tool may read the environment, and the config of the project may not', async () => {
    const files = entries(source('apps/admin/vite.config.ts', 'export default { x: process.env.X };'));
    expect((await check(files, ['env-access'])).codes).toEqual([]);
    const project = await check(files, ['env-access'], {
      config: `${header('bieberkit.config.ts')}import { defineConfig } from '@bieberkit/core';\nconst x = process.env.X;\nexport default defineConfig({ name: 'd', author: '${AUTHOR}', license: 'UNLICENSED', database: { dialect: 'sqlite' }, tenancy: { mode: 'single' }, locales: { default: 'en', supported: ['en'] }, plugins: [] });\n`,
    });
    expect(project.codes).toEqual(['BK_ENV_ACCESS']);
  });
});

const sales = (body: string): [string, string] => source('apps/server/src/modules/sales/orders.ts', body);

describe('MOD-01 the boundaries rule', () => {
  it('MOD-01 a module reaches another through its index, and its own files freely', async () => {
    const files = entries(
      sales(
        "import { stock } from '../stock/index.ts';\nimport { own } from './helper.ts';\nimport { other } from '../stock';",
      ),
      source('apps/server/src/modules/stock/index.ts', 'export const stock = 1;'),
      source('apps/server/src/modules/sales/helper.ts', 'export const own = 1;'),
    );
    expect((await check(files, ['boundaries'])).codes).toEqual([]);
  });

  it('MOD-01 a module that reaches into the files of another is BK_BOUNDARY_MODULE', async () => {
    const files = entries(
      sales("import { secret } from '../stock/internal/secret.ts';"),
      source('apps/server/src/modules/stock/internal/secret.ts', 'export const secret = 1;'),
    );
    const { violations } = await check(files, ['boundaries']);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      code: 'BK_BOUNDARY_MODULE',
      file: 'apps/server/src/modules/sales/orders.ts',
      line: 11,
    });
  });

  it('PKG-03 project code never imports a tool or a driver library', async () => {
    const { codes } = await check(
      entries(
        source(
          'apps/server/src/a.ts',
          "import { runCli } from 'bieberkit';\nimport { Queue } from 'bullmq';\nimport Redis from 'ioredis';\nimport { x } from '@bieberkit/queue';",
        ),
      ),
      ['boundaries'],
    );
    expect(codes).toEqual(['BK_BOUNDARY_TOOLS', 'BK_BOUNDARY_DRIVER', 'BK_BOUNDARY_DRIVER']);
  });

  it('PLG-01 a plugin is imported at its entry or at a subpath that it exports, and not into its files', async () => {
    const files = {
      ...entries(
        source(
          'apps/server/src/a.ts',
          "import a from '@bieberkit/plugin-seo';\nimport b from '@bieberkit/plugin-seo/testing';\nimport c from '@bieberkit/plugin-seo/src/secret.ts';\nimport d from '@bieberkit/plugin-ghost/dist/x.js';",
        ),
      ),
      'node_modules/@bieberkit/plugin-seo/package.json': JSON.stringify({
        name: '@bieberkit/plugin-seo',
        exports: { '.': './index.js', './testing': './testing.js' },
      }),
    };
    const { violations } = await check(files, ['boundaries']);
    expect(violations.map((entry) => [entry.code, entry.line - 10])).toEqual([
      ['BK_BOUNDARY_PLUGIN', 3],
      ['BK_BOUNDARY_PLUGIN', 4],
    ]);
  });
});

/** A plugin package on disk: a `package.json` with its static manifest (PLG-07), and the files that it gives. */
const pluginPackage = (
  dir: string,
  name: string,
  options: { tables?: string[]; exports?: Record<string, unknown>; keyword?: boolean } = {},
): Record<string, string> => ({
  [`${dir}/package.json`]: JSON.stringify({
    name,
    version: '1.0.0',
    ...(options.keyword === true ? { keywords: ['bieberkit-plugin'] } : {}),
    exports: options.exports ?? { '.': './src/index.ts' },
    bieberkit: { core: '*', dialects: ['sqlite'], requires: {}, conflicts: {}, tables: options.tables ?? [] },
  }),
  [`${dir}/src/index.ts`]: `${header(`${dir}/src/index.ts`)}export const Media = 1;\n`,
});

describe('PLG-01 a plugin is reached through its public entry only', () => {
  const media = pluginPackage('node_modules/@bieberkit/plugin-media', '@bieberkit/plugin-media', {
    tables: ['bk_media'],
    exports: { '.': './src/index.ts', './testing': './src/testing.ts' },
  });
  const notes = pluginPackage('plugins/notes', '@acme/bieberkit-plugin-notes', {
    keyword: true,
    tables: ['acme_notes'],
  });

  it('PLG-01 a relative path into the files of another plugin is refused, and the entry that its package exports is not', async () => {
    const files = {
      ...notes,
      ...entries(
        source(
          'plugins/other/src/a.ts',
          "import a from '../../notes/src/index.ts';\nimport b from '../../notes/src/secret.ts';",
        ),
      ),
      ...pluginPackage('plugins/other', '@acme/bieberkit-plugin-other', { keyword: true }),
    };
    const { violations } = await check(files, ['boundaries']);
    expect(
      violations
        .filter((entry) => entry.file === 'plugins/other/src/a.ts')
        .map((entry) => [entry.code, entry.line - 10]),
    ).toEqual([['BK_BOUNDARY_PLUGIN', 2]]);
  });

  it('PLG-01 a path through node_modules into the files of a plugin is refused', async () => {
    const files = {
      ...media,
      ...entries(
        source(
          'apps/server/src/a.ts',
          "import a from '../../../node_modules/@bieberkit/plugin-media/src/secret.ts';\nimport b from '../../../node_modules/@bieberkit/plugin-media/src/index.ts';",
        ),
      ),
    };
    const { violations } = await check(files, ['boundaries']);
    expect(violations.map((entry) => [entry.code, entry.line - 10])).toEqual([['BK_BOUNDARY_PLUGIN', 1]]);
  });

  it('PLG-01 a plugin that is known by its keyword, and not by its name, has the same rule', async () => {
    const files = {
      ...pluginPackage('node_modules/acme-notes', 'acme-notes', { keyword: true }),
      ...entries(
        source('apps/server/src/a.ts', "import a from 'acme-notes/src/secret.ts';\nimport b from 'acme-notes';"),
      ),
    };
    const { violations } = await check(files, ['boundaries']);
    expect(violations.map((entry) => [entry.code, entry.line - 10])).toEqual([['BK_BOUNDARY_PLUGIN', 1]]);
  });

  it('PLG-01 an exports pattern opens the subpaths that it names, and the others stay closed', async () => {
    const files = {
      ...pluginPackage('node_modules/@bieberkit/plugin-seo', '@bieberkit/plugin-seo', {
        exports: { '.': './index.js', './public/*': './public/*.js' },
      }),
      ...entries(
        source(
          'apps/server/src/a.ts',
          "import a from '@bieberkit/plugin-seo/public/card';\nimport b from '@bieberkit/plugin-seo/private/card';",
        ),
      ),
    };
    const { violations } = await check(files, ['boundaries']);
    expect(violations.map((entry) => [entry.code, entry.line - 10])).toEqual([['BK_BOUNDARY_PLUGIN', 2]]);
  });

  it('PLG-01 a plugin may import its own files by its own name', async () => {
    const files = {
      ...notes,
      ...entries(source('plugins/notes/src/a.ts', "import a from '@acme/bieberkit-plugin-notes/src/internal.ts';")),
    };
    const { violations } = await check(files, ['boundaries']);
    expect(violations).toEqual([]);
  });
});

describe('PLG-02 a plugin does not query the tables of another plugin', () => {
  const media = pluginPackage('node_modules/@bieberkit/plugin-media', '@bieberkit/plugin-media', {
    tables: ['bk_media'],
  });
  const notes = pluginPackage('plugins/notes', '@acme/bieberkit-plugin-notes', {
    keyword: true,
    tables: ['acme_notes'],
  });
  const query = (body: string): Record<string, string> => ({
    ...media,
    ...notes,
    ...entries(source('plugins/notes/src/query.ts', body)),
  });
  const findings = async (body: string) => {
    const { violations } = await check(query(body), ['plugin-tables']);
    return violations.map((entry) => [entry.code, entry.line - 10]);
  };

  it('PLG-02 the table of another plugin in a query builder call is refused, with the name of its owner', async () => {
    const { violations, err } = await check(
      query(
        "const a = db.selectFrom('bk_media').selectAll();\nconst b = db.insertInto('bk_media as m');\nconst c = db.selectFrom('acme_notes');",
      ),
      ['plugin-tables'],
    );
    expect(violations.map((entry) => [entry.code, entry.line - 10])).toEqual([
      ['BK_PLUGIN_TABLE_QUERY', 1],
      ['BK_PLUGIN_TABLE_QUERY', 2],
    ]);
    expect(JSON.stringify(violations)).toContain('@bieberkit/plugin-media');
    expect(err).toBe('');
  });

  it('PLG-02 the table of another plugin in SQL text is refused, in every form of it that is seen', async () => {
    expect(
      await findings(
        [
          'const a = sql`select * from bk_media where id = ${id}`;',
          "const b = await em.getConnection().execute('delete from bk_media');",
          "const c = sql.raw('update bk_media set x = 1');",
          "const d = db.selectFrom('acme_notes').innerJoin('bk_media', 'bk_media.id', 'acme_notes.media_id');",
        ].join('\n'),
      ),
    ).toEqual([
      ['BK_PLUGIN_TABLE_QUERY', 1],
      ['BK_PLUGIN_TABLE_QUERY', 2],
      ['BK_PLUGIN_TABLE_QUERY', 3],
      ['BK_PLUGIN_TABLE_QUERY', 4],
    ]);
  });

  it('PLG-02 the own tables, the tables of the framework and a word that only looks like a table are not findings', async () => {
    expect(
      await findings(
        [
          "const a = db.selectFrom('acme_notes');",
          "const b = db.selectFrom('bk_auth_users');",
          'const c = sql`select * from bk_audit_log`;',
          "const d = 'bk_media is a table of another plugin';",
          '// db.selectFrom("bk_media")',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('PLG-02 an entity of another plugin passed to the entity manager is refused, and its use as a type or its own entity is not', async () => {
    expect(
      await findings(
        [
          "import { Media } from '@bieberkit/plugin-media';",
          "import type { MediaView } from '@bieberkit/plugin-media';",
          "import { Note } from './entity.ts';",
          'const a = await em.find(Media, {});',
          'const b = em.createQueryBuilder(Media);',
          'const c = await em.find(Note, {});',
          'const d: MediaView | undefined = undefined;',
        ].join('\n'),
      ),
    ).toEqual([
      ['BK_PLUGIN_ENTITY_QUERY', 4],
      ['BK_PLUGIN_ENTITY_QUERY', 5],
    ]);
  });

  it('PLG-02 the project code is not a plugin, so the rule does not read it', async () => {
    const files = { ...media, ...entries(source('apps/server/src/a.ts', "const a = db.selectFrom('bk_media');")) };
    expect((await check(files, ['plugin-tables'])).violations).toEqual([]);
  });

  it('PLG-02 the directive with a reason lets one query through', async () => {
    expect(
      await findings(
        "// bieberkit-ignore BK_PLUGIN_TABLE_QUERY: a report that the media team asked for\nconst a = db.selectFrom('bk_media');",
      ),
    ).toEqual([]);
  });
});

describe('SCH-08 the orm rule', () => {
  it('SCH-08 an entity file that imports the ORM is an error, and the overrides are warnings', async () => {
    const body =
      "import { defineEntity } from '@bieberkit/data';\nimport { Entity } from '@mikro-orm/core';\nexport const A = defineEntity({ name: 'crm.A', table: 'a', fields: {}, orm: { indexes: [] } });";
    const { violations } = await check(entries(source('apps/server/src/a.ts', body)), ['orm']);
    expect(violations.map((entry) => [entry.code, entry.severity])).toEqual([
      ['BK_ORM_IN_ENTITY', 'error'],
      ['BK_ORM_OVERRIDE', 'warning'],
    ]);
  });

  it('SCH-08 a file that is not an entity may import the ORM', async () => {
    const { codes } = await check(
      entries(
        source(
          'apps/server/src/store.orm.ts',
          "import { EntitySchema } from '@mikro-orm/core';\nexport const S = new EntitySchema({ name: 'S' });",
        ),
      ),
      ['orm'],
    );
    expect(codes).toEqual(['BK_ORM_HANDWRITTEN']);
  });
});

describe('SEC-05 the sql rule', () => {
  it('SEC-05 finds a statement built from a template with a value or joined with +, in each way to run it', async () => {
    const body = [
      'await db.execute(`select * from t where id = ${id}`);',
      "await sql.raw('select * from t where id = ' + id);",
      'await knex.raw(`delete from t where a = ${a}`);',
      "await pool.query('select ' + cols + ' from t');",
    ].join('\n');
    const { codes } = await check(entries(source('apps/server/src/a.ts', body)), ['sql']);
    expect(codes).toEqual(['BK_SQL_STRING_BUILT', 'BK_SQL_STRING_BUILT', 'BK_SQL_STRING_BUILT', 'BK_SQL_STRING_BUILT']);
  });

  it('SEC-05 a fixed statement, the sql tag and a statement with parameters are fine', async () => {
    const body = [
      "await db.execute('select 1');",
      'await db.execute(sql`select * from t where id = ${id}`);',
      "await pool.query('select * from t where id = $1', [id]);",
      'await db.execute(`select 1`);',
    ].join('\n');
    expect((await check(entries(source('apps/server/src/a.ts', body)), ['sql'])).codes).toEqual([]);
  });
});

describe('WP-01 the transactions rule', () => {
  it('WP-01 finds an http call, a mail and a queue dispatch inside a transaction, on the line that makes it', async () => {
    const body = [
      'await runInTransaction(db, async (em) => {',
      '  em.create(A, {});',
      '  await http.fetch(url);',
      '  await mail.send(message);',
      '  await queue.dispatch(job, input);',
      '  await fetch(url);',
      '});',
    ].join('\n');
    const { violations } = await check(entries(source('apps/server/src/a.ts', body)), ['transactions']);
    expect(violations.map((entry) => entry.line - 10)).toEqual([3, 4, 5, 6]);
  });

  it('WP-01 the same calls after the transaction, and an outbox event inside it, are fine', async () => {
    const body = [
      'await runInTransaction(db, async (em) => {',
      '  emitEvent(em, { name: "a.b.c", payload: {} });',
      '});',
      'await http.fetch(url);',
      'const text = `runInTransaction( http.fetch(`;',
    ].join('\n');
    expect((await check(entries(source('apps/server/src/a.ts', body)), ['transactions'])).codes).toEqual([]);
  });
});

const migration = (sql: string): [string, string] =>
  source(
    'migrations/Migration20260101.ts',
    `export class Migration20260101 extends Migration {\n  async up(): Promise<void> {\n    this.addSql('${sql}');\n  }\n  async down(): Promise<void> {}\n}`,
  );

describe('DATA-08 the migrations rule', () => {
  it('DATA-08 a dropped column is BK_MIGRATION_DESTRUCTIVE, and an added column is not', async () => {
    expect((await check(entries(migration('alter table t drop column a;')), ['migrations'])).codes).toEqual([
      'BK_MIGRATION_DESTRUCTIVE',
    ]);
    expect((await check(entries(migration('alter table t add column a text;')), ['migrations'])).codes).toEqual([]);
  });

  it('DATA-08 a deliberate drop is let through with a reason', async () => {
    const [path, text] = migration('alter table t drop column a;');
    const marked = text.replace(
      '  async up()',
      '  // bieberkit-ignore BK_MIGRATION_DESTRUCTIVE: the contract release of 2.0\n  async up()',
    );
    expect((await check({ [path]: marked }, ['migrations'])).codes).toEqual([]);
  });

  it('DATA-08 a file that is not a migration class is a warning, not a crash', async () => {
    const { code, violations } = await check(entries(source('migrations/odd.ts', 'export const x = 1;')), [
      'migrations',
    ]);
    expect([code, violations.map((entry) => entry.severity)]).toEqual([0, ['warning']]);
  });
});

const PLUGIN = '@bieberkit/plugin-p';
const pluginWith = (kind: string, up: string, after = true): Record<string, string> => ({
  [`node_modules/${PLUGIN}/index.mjs`]: `import { definePlugin } from '@bieberkit/core';
export default definePlugin({ name: '${PLUGIN}', version: '1.0.0', core: '*', dialects: ['sqlite', 'mysql'],
  migrations: [${
    kind === 'contract' && after
      ? `{ plugin: '${PLUGIN}', version: '0.9.0', id: 'first', kind: 'expand', up: async () => undefined }, `
      : ''
  }{ plugin: '${PLUGIN}', version: '1.0.0', id: 'one', kind: '${kind}', ${
    kind === 'contract' && after ? "after: 'first', " : ''
  }up: async (trx) => { ${up} } }] });
`,
});

describe('DATA-08 and DATA-27 the plugin-steps rule', () => {
  it('DATA-08 a drop or a rename in a step that is not a contract step is an error that names the step', async () => {
    const { code, violations } = await check(
      pluginWith('expand', "await trx.schema.alterTable('t').dropColumn('a').execute();"),
      ['plugin-steps'],
      { plugins: [{ name: PLUGIN }] },
    );
    expect(code).toBe(3);
    expect(violations).toMatchObject([{ code: 'BK_STEP_DESTRUCTIVE', file: PLUGIN, severity: 'error' }]);
  });

  it('DATA-08 the same drop in a contract step passes', async () => {
    const { code, codes } = await check(
      pluginWith('contract', "await trx.schema.alterTable('t').dropColumn('a').execute();"),
      ['plugin-steps'],
      { plugins: [{ name: PLUGIN }] },
    );
    expect([code, codes]).toEqual([0, []]);
  });

  it('DATA-08 a contract step with no after is a warning, because the migrate role cannot refuse it', async () => {
    const { code, violations } = await check(pluginWith('contract', 'return;', false), ['plugin-steps'], {
      plugins: [{ name: PLUGIN }],
    });
    expect([code, violations]).toMatchObject([0, [{ code: 'BK_STEP_CONTRACT_NO_AFTER', severity: 'warning' }]]);
  });

  it('DATA-27 on MySQL a step with two DDL statements and one without a guard is a warning, and on SQLite it is not reported', async () => {
    const up =
      "await trx.schema.createTable('a').ifNotExists().addColumn('id', 'integer').execute(); await trx.schema.createTable('b').addColumn('id', 'integer').execute();";
    const mysql = await check(pluginWith('expand', up), ['plugin-steps'], {
      plugins: [{ name: PLUGIN }],
      dialect: 'mysql',
    });
    expect([mysql.code, mysql.violations]).toMatchObject([
      0,
      [{ code: 'BK_STEP_MYSQL_UNGUARDED', severity: 'warning' }],
    ]);
    const sqlite = await check(pluginWith('expand', up), ['plugin-steps'], { plugins: [{ name: PLUGIN }] });
    expect(sqlite.codes).toEqual([]);
  });
});

const SCOPED_MODULE = (when: string, subject = 'crm.Person'): string => `import { defineModule } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';
const Person = defineEntity({ name: 'crm.Person', table: 'crm_people', fields: { id: f.id(), name: f.string({ max: 50 }) } });
export default defineModule({ name: 'crm', entities: [Person],
  scopedPermissions: { 'crm.person.read.own': { subject: '${subject}', action: 'read', when: ${when} } } });
`;

describe('AUTHZ-06 the scoped-permissions rule', () => {
  it('AUTHZ-06 a condition inside the language of the translator passes', async () => {
    const { code, codes } = await check(
      { 'apps/server/src/modules/crm/module.ts': SCOPED_MODULE('(user) => ({ name: user.id })') },
      ['scoped-permissions'],
    );
    expect([code, codes]).toEqual([0, []]);
  });

  it('AUTHZ-06 a dotted path, an unknown entity and a condition that throws are errors that name the permission', async () => {
    const dotted = await check(
      { 'apps/server/src/modules/crm/module.ts': SCOPED_MODULE("() => ({ 'owner.id': 1 })") },
      ['scoped-permissions'],
    );
    expect([dotted.code, dotted.codes]).toEqual([3, ['BK_AUTHZ_CONDITION_NOT_ALLOWED']]);
    expect(dotted.violations[0]?.file).toBe('apps/server/src/modules/crm/module.ts');
    const unknown = await check(
      { 'apps/server/src/modules/crm/module.ts': SCOPED_MODULE('() => ({})', 'crm.Nothing') },
      ['scoped-permissions'],
    );
    expect(unknown.codes).toEqual(['BK_AUTHZ_SUBJECT_UNKNOWN']);
  });
});
