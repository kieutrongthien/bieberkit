/**
 * BieberKit
 *
 * @file        packages/data/src/migrations/steps.test.ts
 * @description Tests of the order and the validation of plugin migration steps and of the static risk rules (DATA-08, DATA-24, DATA-27).
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
import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { findStepRisks, orderSteps, validateSteps } from './steps.ts';
import type { PluginMigrationStep } from './steps.ts';

function step(
  plugin: string,
  version: string,
  id: string,
  rest: Partial<PluginMigrationStep> = {},
): PluginMigrationStep {
  return { plugin, version, id, kind: 'expand', up: async () => undefined, ...rest };
}

function problemOf(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

describe('orderSteps', () => {
  it('DATA-24 orders by plugin boot order, then version, then declaration order', () => {
    const steps = [
      step('b', '1.0.0', 'b1'),
      step('a', '1.10.0', 'a3'),
      step('a', '1.2.0', 'a1'),
      step('a', '1.2.0', 'a2'),
      step('b', '0.9.0', 'b0'),
    ];
    expect(orderSteps(steps, ['a', 'b']).map((s) => s.id)).toEqual(['a1', 'a2', 'a3', 'b0', 'b1']);
    expect(orderSteps(steps, ['b', 'a']).map((s) => s.id)).toEqual(['b0', 'b1', 'a1', 'a2', 'a3']);
  });

  it('DATA-24 compares versions as numbers, not as text', () => {
    const steps = [step('a', '1.10.0', 'late'), step('a', '1.9.0', 'early')];
    expect(orderSteps(steps, ['a']).map((s) => s.id)).toEqual(['early', 'late']);
  });

  it('DATA-24 does not change the list it is given', () => {
    const steps = [step('a', '2.0.0', 'x'), step('a', '1.0.0', 'y')];
    orderSteps(steps, ['a']);
    expect(steps.map((s) => s.id)).toEqual(['x', 'y']);
  });
});

describe('validateSteps', () => {
  it('DATA-24 accepts a plugin that expands and later contracts', () => {
    expect(() =>
      validateSteps(
        [
          step('a', '1.1.0', 'add'),
          step('a', '1.2.0', 'fill', { kind: 'migrate' }),
          step('a', '1.3.0', 'drop', { kind: 'contract', after: 'add' }),
        ],
        ['a'],
      ),
    ).not.toThrow();
  });

  it.each([
    ['a duplicate id in one plugin', [step('a', '1.0.0', 'x'), step('a', '1.1.0', 'x')]],
    ['a plugin that is not in the boot order', [step('zzz', '1.0.0', 'x')]],
    ['a version that is not major.minor.patch', [step('a', '1.0', 'x')]],
    ['a blank id', [step('a', '1.0.0', '')]],
    ['an after on a step that is not a contract', [step('a', '1.0.0', 'x'), step('a', '1.1.0', 'y', { after: 'x' })]],
    ['a contract after a step that does not exist', [step('a', '1.1.0', 'y', { kind: 'contract', after: 'nope' })]],
    [
      'a contract after a step that is not an expand',
      [step('a', '1.0.0', 'x', { kind: 'migrate' }), step('a', '1.1.0', 'y', { kind: 'contract', after: 'x' })],
    ],
    [
      'a contract that is not later than its expand',
      [step('a', '1.1.0', 'x'), step('a', '1.1.0', 'y', { kind: 'contract', after: 'x' })],
    ],
    [
      'a contract after a step of another plugin',
      [step('b', '1.0.0', 'x'), step('a', '1.1.0', 'y', { kind: 'contract', after: 'x' })],
    ],
  ])('DATA-24 refuses %s', (_name, steps) => {
    const error = problemOf(() => validateSteps(steps, ['a', 'b']));
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: 'DATA_MIGRATION_STEP_INVALID' });
  });

  it('DATA-24 names the plugin and the step in the message', () => {
    const error = problemOf(() => validateSteps([step('a', '1.0.0', 'x'), step('a', '1.1.0', 'x')], ['a']));
    expect(messageOf(error)).toContain('a/x');
  });
});

describe('findStepRisks', () => {
  it('DATA-27 flags a step with two DDL statements and no guard', () => {
    const risky = step('a', '1.0.0', 'two', {
      up: async (trx) => {
        await trx.schema.createTable('t1').addColumn('id', 'text').execute();
        await trx.schema.createTable('t2').addColumn('id', 'text').execute();
      },
    });
    expect(findStepRisks([risky])).toEqual([expect.objectContaining({ kind: 'mysql-unguarded-ddl', step: 'a/two' })]);
  });

  it('DATA-27 accepts a step with one DDL statement, or with a guard on each', () => {
    const one = step('a', '1.0.0', 'one', {
      up: async (trx) => {
        await trx.schema.createTable('t1').addColumn('id', 'text').execute();
      },
    });
    const guarded = step('a', '1.0.0', 'guarded', {
      up: async (trx) => {
        await trx.schema.createTable('t1').ifNotExists().addColumn('id', 'text').execute();
        await trx.schema.createTable('t2').ifNotExists().addColumn('id', 'text').execute();
        await sql`create index if not exists i1 on t1 (id)`.execute(trx);
      },
    });
    expect(findStepRisks([one, guarded])).toEqual([]);
  });

  it('DATA-27 does not count data statements as DDL', () => {
    const data = step('a', '1.0.0', 'data', {
      kind: 'migrate',
      up: async (trx) => {
        await trx.updateTable('t').set({ x: 1 }).execute();
        await trx.insertInto('t').values({ x: 2 }).execute();
        await trx.schema.createTable('t3').addColumn('id', 'text').execute();
      },
    });
    expect(findStepRisks([data])).toEqual([]);
  });

  it('DATA-08 flags a drop or a rename in a step that is not a contract', () => {
    const drop = step('a', '1.0.0', 'drop', {
      up: async (trx) => {
        await trx.schema.alterTable('t').dropColumn('c').execute();
      },
    });
    const rename = step('a', '1.0.0', 'rename', {
      kind: 'migrate',
      up: async (trx) => {
        await trx.schema.alterTable('t').renameColumn('c', 'd').execute();
      },
    });
    const contract = step('a', '1.1.0', 'ok', {
      kind: 'contract',
      after: 'drop',
      up: async (trx) => {
        await trx.schema.alterTable('t').dropColumn('c').execute();
      },
    });
    expect(findStepRisks([drop, rename, contract])).toEqual([
      expect.objectContaining({ kind: 'destructive-before-contract', step: 'a/drop' }),
      expect.objectContaining({ kind: 'destructive-before-contract', step: 'a/rename' }),
    ]);
  });

  it('DATA-08 flags a contract step that does not say which expand step it finishes, because the migrate role cannot guard it', () => {
    const lone = step('a', '2.0.0', 'lone', { kind: 'contract', up: async () => undefined });
    const named = step('a', '2.0.0', 'named', { kind: 'contract', after: 'first', up: async () => undefined });
    const first = step('a', '1.0.0', 'first', { up: async () => undefined });
    expect(findStepRisks([first, lone, named])).toEqual([
      expect.objectContaining({ kind: 'contract-without-after', step: 'a/lone' }),
    ]);
  });
});
