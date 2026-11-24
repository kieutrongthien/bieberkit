/**
 * BieberKit
 *
 * @file        packages/data/src/orm/migrate.dialects.test.ts
 * @description Tests of project migrations on every dialect: snapshot diff, make, up, down, status and destructive refusal (DATA-08, DATA-25).
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

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, afterEach, expect, it } from 'vitest';
import { createLogger } from '@bieberkit/core';
import { DataError } from '../errors.ts';
import { defineEntity, f } from '../schema/index.ts';
import { describeDialects } from '../testing/dialects.ts';
import { createDatabase } from './connect.ts';
import { compileEntities } from './compile.ts';
import { kyselyOf } from './internals.ts';
import { openMigrator } from './migrate.ts';
import type { Migrator } from './migrate.ts';

const NoteV1 = defineEntity({
  name: 'notes.Note',
  table: 'notes_notes',
  fields: { id: f.id(), title: f.string({ max: 100 }) },
});
const NoteV2 = defineEntity({
  name: 'notes.Note',
  table: 'notes_notes',
  fields: { id: f.id(), title: f.string({ max: 100 }), body: f.text({ max: 500 }).optional() },
});
const NoteV3 = defineEntity({
  name: 'notes.Note',
  table: 'notes_notes',
  fields: { id: f.id(), title: f.string({ max: 100 }) },
});
const NoteV4 = defineEntity({
  name: 'notes.Note',
  table: 'notes_notes',
  fields: { id: f.id(), title: f.string({ max: 100 }), flag: f.int({ min: 0 }) },
});

// Migration files are TypeScript that Node runs, so they sit inside the package (never under node_modules) and find their imports.
const ROOT = join(fileURLToPath(new URL('../..', import.meta.url)), '.tmp');
mkdirSync(ROOT, { recursive: true });
const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

describeDialects('DATA-08 project migrations', ({ dialect, emptyDatabase }) => {
  const migrators: Migrator[] = [];
  afterEach(async () => {
    for (const migrator of migrators.splice(0)) await migrator.close();
  });

  /** One database and one folder of migrations. `use` opens a migrator for a version of the entities, like a new release would. */
  async function project() {
    const { url } = await emptyDatabase();
    const directory = mkdtempSync(join(ROOT, 'migrations-'));
    directories.push(directory);
    const env = (u: string = url) => ({ DB_CONNECTION: dialect, MIGRATE_DATABASE_URL: u, DB_POOL_MAX: 3 }) as const;
    return {
      url,
      directory,
      async use(...defs: Parameters<typeof compileEntities>[0]): Promise<Migrator> {
        const migrator = await openMigrator(env(), { entities: compileEntities(defs), directory, logger: QUIET });
        migrators.push(migrator);
        return migrator;
      },
      /** A connection of the application, to look at what the migrations did. */
      async look() {
        const db = await createDatabase(
          { DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 2 },
          { entities: [] },
        );
        return {
          db,
          query: async (text: string): Promise<unknown[]> => {
            const { rows } = await sql.raw(text).execute(await kyselyOf(db.orm.em));
            return rows;
          },
        };
      },
    };
  }

  it('DATA-08 makes the first migration and the snapshot of the dialect from the entities', async () => {
    const p = await project();
    const migrator = await p.use(NoteV1);
    const made = await migrator.make();
    expect(made).not.toBeNull();
    expect(made?.name).toMatch(/^Migration\d{14}$/);
    expect(made?.up.join('\n')).toMatch(/create table .?notes_notes/i);
    expect(made?.destructive).toEqual([]);
    expect(existsSync(made?.path ?? '')).toBe(true);
    expect(readdirSync(p.directory).toSorted()).toEqual([`.snapshot-${dialect}.json`, `${made?.name}.ts`]);
  });

  it('DATA-08 writes a migration that imports its base class from @bieberkit/data, so a project needs no dependency on the ORM', async () => {
    const p = await project();
    const made = await (await p.use(NoteV1)).make();
    const source = readFileSync(made?.path ?? '', 'utf8');
    expect(source).toContain("import { Migration } from '@bieberkit/data/migration';");
    expect(source).not.toContain('@mikro-orm');
  });

  it('DATA-08 creates nothing when the entities and the snapshot agree', async () => {
    const p = await project();
    const migrator = await p.use(NoteV1);
    await migrator.make();
    expect(await migrator.make()).toBeNull();
    expect(readdirSync(p.directory)).toHaveLength(2);
  });

  it('DATA-08 up applies the pending migrations and status says what ran', async () => {
    const p = await project();
    const migrator = await p.use(NoteV1);
    const made = await migrator.make();
    expect(await migrator.status()).toEqual({ executed: [], pending: [made?.name] });
    expect(await migrator.up()).toEqual([made?.name]);
    expect(await migrator.status()).toEqual({ executed: [made?.name], pending: [] });
    expect(await migrator.up()).toEqual([]);
    const look = await p.look();
    expect(await look.query('select count(*) as n from notes_notes')).toHaveLength(1);
    expect(await look.query('select count(*) as n from bk_migrations')).toHaveLength(1);
    await look.db.close();
  });

  it('DATA-08 makes the next migration from the snapshot, with only the difference', async () => {
    const p = await project();
    await (await p.use(NoteV1)).make();
    const next = await (await p.use(NoteV2)).make();
    const text = next?.up.join('\n') ?? '';
    expect(text).toMatch(/add (?:column )?.?body/i);
    expect(text).not.toMatch(/create table/i);
    expect(next?.destructive).toEqual([]);
  });

  it('DATA-08 diffs against the snapshot and never against the live database', async () => {
    const p = await project();
    const migrator = await p.use(NoteV1);
    await migrator.make();
    await migrator.up();
    const look = await p.look();
    await look.query('drop table notes_notes');
    await look.db.close();
    expect(await migrator.make()).toBeNull();
  });

  it('DATA-08 refuses to make a migration from the live database when the snapshot is gone', async () => {
    const p = await project();
    const migrator = await p.use(NoteV1);
    await migrator.make();
    rmSync(join(p.directory, `.snapshot-${dialect}.json`));
    const error = await failureOf(() => migrator.make());
    expect(error).toMatchObject({ code: 'DATA_MIGRATION_SNAPSHOT_MISSING' });
  });

  it('DATA-08 two migrations made in the same second are two files', async () => {
    const p = await project();
    const first = await (await p.use(NoteV1)).make();
    const second = await (await p.use(NoteV2)).make();
    const third = await (await p.use(NoteV1)).make('back');
    expect(new Set([first?.name, second?.name, third?.name]).size).toBe(3);
    expect(readdirSync(p.directory).filter((file) => file.endsWith('.ts'))).toHaveLength(3);
  });

  it('DATA-08 down rolls back the last migration only, and up applies it again', async () => {
    const p = await project();
    const first = await (await p.use(NoteV1)).make();
    const migrator = await p.use(NoteV2);
    const second = await migrator.make();
    await migrator.up();
    expect(await migrator.down()).toEqual([second?.name]);
    expect(await migrator.status()).toEqual({ executed: [first?.name], pending: [second?.name] });
    const look = await p.look();
    expect(await failureOf(() => look.query('select body from notes_notes'))).toBeDefined();
    await look.db.close();
    expect(await migrator.up()).toEqual([second?.name]);
  });

  it('DATA-08 down with nothing executed does nothing', async () => {
    const p = await project();
    expect(await (await p.use(NoteV1)).down()).toEqual([]);
  });

  it('DATA-08 reports a dropped column as destructive in make', async () => {
    const p = await project();
    await (await p.use(NoteV2)).make();
    const made = await (await p.use(NoteV3)).make();
    expect(made?.destructive.map((finding) => finding.kind)).toEqual(['drop-column']);
  });

  it('DATA-08 reports a new column that is not null and has no default as destructive in make', async () => {
    const p = await project();
    await (await p.use(NoteV1)).make();
    const made = await (await p.use(NoteV4)).make();
    expect(made?.destructive.map((finding) => finding.kind)).toEqual(['not-null-without-default']);
  });

  it('DATA-08 up refuses a destructive migration before it runs any of the pending ones', async () => {
    const p = await project();
    await (await p.use(NoteV1)).make();
    await (await p.use(NoteV2)).make();
    const migrator = await p.use(NoteV3);
    const dropping = await migrator.make();
    const error = await failureOf(() => migrator.up());
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: 'DATA_MIGRATION_DESTRUCTIVE', status: 409 });
    expect(messageOf(error)).toContain(dropping?.name);
    expect((await migrator.status()).executed).toEqual([]);
  });

  it('DATA-08 up runs a destructive migration when it is told to, in the contract release', async () => {
    const p = await project();
    await (await p.use(NoteV2)).make();
    const migrator = await p.use(NoteV3);
    await migrator.make();
    const applied = await migrator.up({ allowDestructive: true });
    expect(applied).toHaveLength(2);
    expect((await migrator.status()).pending).toEqual([]);
  });

  it('DATA-24 runs plugin steps over the same connection as the migrator', async () => {
    const p = await project();
    const migrator = await p.use(NoteV1);
    const run = await migrator.runPluginSteps(
      [
        {
          plugin: 'a',
          version: '1.0.0',
          id: 'make',
          kind: 'expand',
          up: async (trx) => void (await sql`create table a_things (id varchar(36) primary key)`.execute(trx)),
        },
      ],
      { pluginOrder: ['a'], deployId: 'one' },
    );
    expect(run.applied).toEqual(['a/make']);
    const look = await p.look();
    expect(await look.query('select id from a_things')).toEqual([]);
    expect(await look.query('select step_id from bk_plugin_migrations')).toEqual([{ step_id: 'make' }]);
    await look.db.close();
  });
});

const QUIET = createLogger({ level: 'error', role: 'migrate' });
const ROLE_ENTITIES = compileEntities([NoteV1]);

function folder(): string {
  const made = mkdtempSync(join(ROOT, 'role-'));
  directories.push(made);
  return made;
}

describeDialects('DATA-25 the migrate role', ({ dialect, emptyDatabase }) => {
  it('DATA-25 connects with MIGRATE_DATABASE_URL, which may name another role than DATABASE_URL', async () => {
    const { url } = await emptyDatabase();
    const migrator = await openMigrator(
      { DB_CONNECTION: dialect, MIGRATE_DATABASE_URL: url, DB_POOL_MAX: 2 },
      { entities: ROLE_ENTITIES, directory: folder() },
    );
    expect(migrator.dialect).toBe(dialect);
    await migrator.close();
  });

  it('DATA-25 refuses to start without MIGRATE_DATABASE_URL, and says which variable', async () => {
    const error = await failureOf(() =>
      openMigrator(
        { DB_CONNECTION: dialect, MIGRATE_DATABASE_URL: undefined, DB_POOL_MAX: 2 },
        { entities: ROLE_ENTITIES, directory: folder() },
      ),
    );
    expect(error).toMatchObject({ code: 'DATA_MIGRATE_CONNECTION_MISSING', status: 500 });
    expect(messageOf(error)).toContain('MIGRATE_DATABASE_URL');
  });

  it('DATA-25 names MIGRATE_DATABASE_URL, and never the URL, when the dialect does not match', async () => {
    const error = await failureOf(() =>
      openMigrator(
        { DB_CONNECTION: 'mysql', MIGRATE_DATABASE_URL: 'postgres://u:hunter2@localhost/x', DB_POOL_MAX: 2 },
        { entities: ROLE_ENTITIES, directory: folder() },
      ),
    );
    expect(error).toMatchObject({ code: 'DATA_DIALECT_MISMATCH' });
    expect(messageOf(error)).toContain('MIGRATE_DATABASE_URL');
    expect(messageOf(error)).not.toContain('hunter2');
  });
});
