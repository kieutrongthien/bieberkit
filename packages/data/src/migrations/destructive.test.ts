/**
 * BieberKit
 *
 * @file        packages/data/src/migrations/destructive.test.ts
 * @description Tests of the detection of destructive statements and of reading the up() of a migration file (DATA-08).
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

import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { detectDestructive, upStatementsOfMigration } from './destructive.ts';

function kinds(...statements: string[]): string[] {
  return detectDestructive(statements).map((finding) => finding.kind);
}

describe('detectDestructive', () => {
  it('DATA-08 finds a dropped column and a dropped table', () => {
    expect(kinds('alter table `customers` drop column `legacy`;')).toEqual(['drop-column']);
    expect(kinds('alter table "customers" drop column "legacy";')).toEqual(['drop-column']);
    expect(kinds('drop table if exists `customers`;')).toEqual(['drop-table']);
    expect(kinds('DROP TABLE "customers" CASCADE;')).toEqual(['drop-table']);
  });

  it('DATA-08 finds a rename of a column, of a table and of a table by name', () => {
    expect(kinds('alter table "a" rename column "x" to "y";')).toEqual(['rename']);
    expect(kinds('alter table `a` rename to `b`;')).toEqual(['rename']);
    expect(kinds('rename table `a` to `b`;')).toEqual(['rename']);
  });

  it('DATA-08 finds a change of the type of a column on each dialect', () => {
    expect(kinds('alter table "a" alter column "x" type varchar(10) using "x"::varchar;')).toEqual(['alter-type']);
    expect(kinds('alter table `a` modify `x` varchar(10) null;')).toEqual(['alter-type']);
    expect(kinds('alter table `a` modify column `x` varchar(10);')).toEqual(['alter-type']);
    expect(kinds('alter table `a` change `x` `y` varchar(10);')).toEqual(['alter-type']);
  });

  it('DATA-08 finds a new column that is not null and has no default', () => {
    expect(kinds('alter table `a` add column `x` text not null;')).toEqual(['not-null-without-default']);
    expect(kinds('alter table "a" add column "x" int NOT NULL;')).toEqual(['not-null-without-default']);
  });

  it('DATA-08 accepts what is safe in an expand release', () => {
    expect(
      kinds(
        'create table `a` (`id` text not null primary key, `x` text not null);',
        'alter table `a` add column `x` text null;',
        'alter table `a` add column `x` text;',
        "alter table `a` add column `x` text not null default 'n';",
        'alter table `a` add column `x` int not null default 0;',
        'create index `a_x_index` on `a` (`x`);',
        'alter table `a` add constraint `a_x_unique` unique (`x`);',
        'alter table "a" alter column "x" set not null;',
        'drop index `a_x_index`;',
      ),
    ).toEqual([]);
  });

  it('DATA-08 splits a statement into its clauses and keeps the whole statement in the finding', () => {
    const statement = 'alter table "a" add column "x" int null, drop column "y", add column "z" int not null;';
    expect(detectDestructive([statement])).toEqual([
      { kind: 'drop-column', statement },
      { kind: 'not-null-without-default', statement },
    ]);
  });

  it('DATA-08 does not read a comma inside parentheses or text as a clause', () => {
    expect(kinds('alter table "a" add column "x" numeric(10,2) null;')).toEqual([]);
    expect(kinds('alter table "a" add column "x" text not null default \'a, drop column b\';')).toEqual([]);
  });

  it('DATA-08 reads several statements in one string', () => {
    expect(kinds('create table `a` (`id` text); drop table `b`; alter table `a` drop column `x`;')).toEqual([
      'drop-table',
      'drop-column',
    ]);
  });

  it('DATA-08 is not fooled by case or by the words inside a name', () => {
    expect(kinds('ALTER TABLE `a` DROP COLUMN `x`')).toEqual(['drop-column']);
    expect(kinds('alter table `dropped_things` add column `renamed` text null;')).toEqual([]);
  });
});

const GENERATED = `import { Migration } from '@mikro-orm/migrations';

export class Migration20261122103000 extends Migration {

  override async up(): Promise<void> {
    this.addSql('alter table \`crm_customers\` add column \`x\` text not null;');
    this.addSql(\`drop table "o'brien"\`);
    this.addSql('insert into t values (\\'a\\');');
  }

  override async down(): Promise<void> {
    this.addSql('drop table \`crm_customers\`;');
  }

}
`;

describe('upStatementsOfMigration', () => {
  it('DATA-08 returns the statements of up() and none of down()', () => {
    expect(upStatementsOfMigration(GENERATED)).toEqual([
      'alter table `crm_customers` add column `x` text not null;',
      `drop table "o'brien"`,
      "insert into t values ('a');",
    ]);
  });

  it('DATA-08 does not stop at a brace inside a statement', () => {
    const source = `export class M { async up() { this.addSql("update t set a = '{}' where b = 1;"); if (x) { this.addSql('drop table \`t\`;'); } } async down() { this.addSql('drop table \`z\`;'); } }`;
    expect(upStatementsOfMigration(source)).toEqual(["update t set a = '{}' where b = 1;", 'drop table `t`;']);
  });

  it('DATA-08 refuses a file that has no up()', () => {
    let caught: unknown;
    try {
      upStatementsOfMigration('export const x = 1;');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DataError);
    expect(caught).toMatchObject({ code: 'DATA_MIGRATION_UNREADABLE' });
  });
});
