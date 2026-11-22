/**
 * BieberKit
 *
 * @file        packages/data/src/orm/plugin-migrate.dialects.test.ts
 * @description Tests of the plugin migration runner: ledger, order, rollback, the same deploy guard and SQLite rebuilds (DATA-08, DATA-24, DATA-27).
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

import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { PluginMigrationStep } from '../migrations/steps.ts';
import { kyselyOf } from './internals.ts';
import { setNotNull } from './portable.ts';
import { runPluginMigrations } from './plugin-migrate.ts';

type Db = Kysely<Record<string, Record<string, unknown>>>;

function step(
  plugin: string,
  version: string,
  id: string,
  up: PluginMigrationStep['up'],
  rest: Partial<PluginMigrationStep> = {},
): PluginMigrationStep {
  return { plugin, version, id, kind: 'expand', up, ...rest };
}

const createTable =
  (name: string): PluginMigrationStep['up'] =>
  async (trx) => {
    await sql.raw(`create table ${name} (id varchar(36) primary key)`).execute(trx);
  };

interface LedgerRow {
  plugin: string;
  step_id: string;
  version: string;
  kind: string;
  deploy_id: string;
  applied_at: unknown;
}

async function ledger(db: Db): Promise<LedgerRow[]> {
  const { rows } =
    await sql<LedgerRow>`select plugin, step_id, version, kind, deploy_id, applied_at from bieberkit_plugin_migrations order by plugin, step_id`.execute(
      db,
    );
  return rows;
}

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

function causeOf(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined;
}

describeDialects('DATA-24 plugin migration runner', ({ dialect, open }) => {
  async function connect(): Promise<Db> {
    return kyselyOf((await open([])).orm.em);
  }

  it('DATA-24 creates the ledger and applies the steps by plugin, version and declaration order', async () => {
    const db = await connect();
    const seen: string[] = [];
    const mark =
      (id: string): PluginMigrationStep['up'] =>
      async () =>
        void seen.push(id);
    const run = await runPluginMigrations(
      db,
      dialect,
      [
        step('b', '1.0.0', 'b1', mark('b1')),
        step('a', '1.2.0', 'a2', mark('a2')),
        step('a', '1.0.0', 'a1', mark('a1')),
        step('a', '1.2.0', 'a3', mark('a3'), { kind: 'migrate' }),
      ],
      { pluginOrder: ['a', 'b'], deployId: 'deploy-1' },
    );
    expect(seen).toEqual(['a1', 'a2', 'a3', 'b1']);
    expect(run).toEqual({ deployId: 'deploy-1', applied: ['a/a1', 'a/a2', 'a/a3', 'b/b1'], refused: [], waiting: [] });
    const rows = await ledger(db);
    expect(rows.map((row) => `${row.plugin}/${row.step_id}`)).toEqual(['a/a1', 'a/a2', 'a/a3', 'b/b1']);
    expect(rows.find((row) => row.step_id === 'a3')).toMatchObject({
      version: '1.2.0',
      kind: 'migrate',
      deploy_id: 'deploy-1',
    });
    expect(Number(rows[0]?.applied_at)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('DATA-24 runs a step once: a second run applies nothing', async () => {
    const db = await connect();
    const steps = [step('a', '1.0.0', 'make', createTable('a_items'))];
    await runPluginMigrations(db, dialect, steps, { pluginOrder: ['a'], deployId: 'one' });
    const again = await runPluginMigrations(db, dialect, steps, { pluginOrder: ['a'], deployId: 'two' });
    expect(again.applied).toEqual([]);
    expect((await ledger(db)).map((row) => row.deploy_id)).toEqual(['one']);
  });

  it('DATA-24 gives the run a deploy id of its own when none is passed', async () => {
    const db = await connect();
    const one = await runPluginMigrations(db, dialect, [], { pluginOrder: [] });
    const two = await runPluginMigrations(db, dialect, [], { pluginOrder: [] });
    expect(one.deployId).toMatch(/^[0-9a-f-]{36}$/);
    expect(one.deployId).not.toBe(two.deployId);
  });

  it('DATA-24 a failed step leaves neither its changes nor a ledger row, and stops the run', async () => {
    const db = await connect();
    await runPluginMigrations(db, dialect, [step('a', '1.0.0', 'make', createTable('a_items'))], {
      pluginOrder: ['a'],
      deployId: 'one',
    });
    const error = await failureOf(() =>
      runPluginMigrations(
        db,
        dialect,
        [
          step('a', '1.0.0', 'make', createTable('a_items')),
          step('a', '1.1.0', 'boom', async (trx) => {
            await sql`insert into a_items (id) values ('x')`.execute(trx);
            throw new Error('disk on fire');
          }),
          step('a', '1.2.0', 'never', createTable('a_never')),
        ],
        { pluginOrder: ['a'], deployId: 'two' },
      ),
    );
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: 'DATA_MIGRATION_STEP_FAILED' });
    expect(messageOf(error)).toContain('a/boom');
    expect(causeOf(error)).toBeInstanceOf(Error);
    const { rows } = await sql`select id from a_items`.execute(db);
    expect(rows).toEqual([]);
    expect((await ledger(db)).map((row) => row.step_id)).toEqual(['make']);
  });

  it('DATA-08 refuses a contract step in the deploy of its expand step, and holds the later steps of that plugin', async () => {
    const db = await connect();
    const steps = [
      step('a', '1.1.0', 'add', createTable('a_new')),
      step('a', '1.2.0', 'drop', async (trx) => void (await sql`drop table a_new`.execute(trx)), {
        kind: 'contract',
        after: 'add',
      }),
      step('a', '1.3.0', 'later', createTable('a_later')),
      step('b', '1.0.0', 'other', createTable('b_other')),
    ];
    const run = await runPluginMigrations(db, dialect, steps, { pluginOrder: ['a', 'b'], deployId: 'deploy-1' });
    expect(run.applied).toEqual(['a/add', 'b/other']);
    expect(run.refused).toEqual([expect.objectContaining({ step: 'a/drop', code: 'PLG_CONTRACT_SAME_DEPLOY' })]);
    expect(run.refused[0]?.message).toContain('a/add');
    expect(run.waiting).toEqual(['a/later']);
    expect((await ledger(db)).map((row) => row.step_id)).toEqual(['add', 'other']);
  });

  it('DATA-08 runs the contract step in a later deploy, with the steps that waited', async () => {
    const db = await connect();
    const steps = [
      step('a', '1.1.0', 'add', createTable('a_new')),
      step('a', '1.2.0', 'drop', async (trx) => void (await sql`drop table a_new`.execute(trx)), {
        kind: 'contract',
        after: 'add',
      }),
      step('a', '1.3.0', 'later', createTable('a_later')),
    ];
    await runPluginMigrations(db, dialect, steps, { pluginOrder: ['a'], deployId: 'deploy-1' });
    const second = await runPluginMigrations(db, dialect, steps, { pluginOrder: ['a'], deployId: 'deploy-2' });
    expect(second).toEqual({ deployId: 'deploy-2', applied: ['a/drop', 'a/later'], refused: [], waiting: [] });
  });

  it('DATA-08 refuses a contract whose expand was skipped into the same deploy, even across several versions', async () => {
    const db = await connect();
    const steps = [
      step('a', '1.1.0', 'add', createTable('a_new')),
      step('a', '1.2.0', 'fill', async () => undefined, { kind: 'migrate' }),
      step('a', '2.0.0', 'drop', async (trx) => void (await sql`drop table a_new`.execute(trx)), {
        kind: 'contract',
        after: 'add',
      }),
    ];
    const run = await runPluginMigrations(db, dialect, steps, { pluginOrder: ['a'], deployId: 'jump' });
    expect(run.applied).toEqual(['a/add', 'a/fill']);
    expect(run.refused.map((r) => r.code)).toEqual(['PLG_CONTRACT_SAME_DEPLOY']);
  });

  it('DATA-24 refuses a deploy id that does not fit the ledger', async () => {
    const db = await connect();
    const error = await failureOf(() =>
      runPluginMigrations(db, dialect, [], { pluginOrder: [], deployId: 'x'.repeat(41) }),
    );
    expect(error).toMatchObject({ code: 'DATA_MIGRATION_STEP_INVALID' });
  });

  it('DATA-24 refuses steps that are not valid before it touches the database', async () => {
    const db = await connect();
    const error = await failureOf(() =>
      runPluginMigrations(
        db,
        dialect,
        [step('a', '1.0.0', 'x', createTable('t')), step('a', '1.0.0', 'x', createTable('u'))],
        { pluginOrder: ['a'] },
      ),
    );
    expect(error).toMatchObject({ code: 'DATA_MIGRATION_STEP_INVALID' });
    expect(await failureOf(() => sql`select 1 from bieberkit_plugin_migrations`.execute(db))).toBeDefined();
  });

  it('DATA-27 a table rebuild does not delete the rows of the tables that point at it', async () => {
    const db = await connect();
    const parents = step(
      'a',
      '1.0.0',
      'parents',
      async (trx) => void (await sql`create table parents (id varchar(36) primary key, name varchar(50))`.execute(trx)),
    );
    const children = step(
      'a',
      '1.0.1',
      'children',
      async (trx) =>
        void (await sql`create table children (id varchar(36) primary key, parent_id varchar(36) not null references parents (id) on delete cascade)`.execute(
          trx,
        )),
    );
    const rows = step(
      'a',
      '1.0.2',
      'rows',
      async (trx) => {
        await sql`insert into parents (id, name) values ('p1', 'one')`.execute(trx);
        await sql`insert into children (id, parent_id) values ('c1', 'p1')`.execute(trx);
      },
      { kind: 'migrate' },
    );
    const require = step(
      'a',
      '1.1.0',
      'require',
      async (trx, d) => setNotNull(trx, d, 'parents', 'name', 'varchar(50)'),
      { kind: 'contract', after: 'parents' },
    );
    await runPluginMigrations(db, dialect, [parents, children, rows, require], { pluginOrder: ['a'], deployId: 'one' });
    const run = await runPluginMigrations(db, dialect, [parents, children, rows, require], {
      pluginOrder: ['a'],
      deployId: 'two',
    });
    expect(run).toMatchObject({ applied: ['a/require'], refused: [] });
    const { rows: kept } = await sql<{ id: string }>`select id from children`.execute(db);
    expect(kept).toEqual([{ id: 'c1' }]);
  });

  it.runIf(dialect === 'sqlite')(
    'DATA-27 a rebuild that breaks a foreign key is rolled back, and foreign keys are on again',
    async () => {
      const db = await connect();
      await runPluginMigrations(
        db,
        dialect,
        [
          step('a', '1.0.0', 'parents', createTable('parents')),
          step(
            'a',
            '1.0.1',
            'children',
            async (trx) =>
              void (await sql`create table children (id varchar(36) primary key, parent_id varchar(36) references parents (id))`.execute(
                trx,
              )),
          ),
        ],
        { pluginOrder: ['a'], deployId: 'one' },
      );
      const error = await failureOf(() =>
        runPluginMigrations(
          db,
          dialect,
          [
            step('a', '1.0.0', 'parents', createTable('parents')),
            step('a', '1.0.1', 'children', createTable('children')),
            step(
              'a',
              '1.1.0',
              'orphan',
              async (trx) =>
                void (await sql`insert into children (id, parent_id) values ('c1', 'missing')`.execute(trx)),
              { kind: 'migrate' },
            ),
          ],
          { pluginOrder: ['a'], deployId: 'two' },
        ),
      );
      expect(error).toMatchObject({ code: 'DATA_MIGRATION_STEP_FAILED' });
      const { rows } = await sql`select id from children`.execute(db);
      expect(rows).toEqual([]);
      const { rows: pragma } = await sql<{ foreign_keys: number }>`pragma foreign_keys`.execute(db);
      expect(pragma[0]?.foreign_keys).toBe(1);
    },
  );
});
