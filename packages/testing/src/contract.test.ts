/**
 * BieberKit
 *
 * @file        packages/testing/src/contract.test.ts
 * @description Runs the generated contract tests on the sample module, and checks the cases that they are made from (TST-02, section 21).
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
import type { EntityDef } from '@bieberkit/data';
import { apiFields } from '@bieberkit/data/schema';
import { describeEntityContracts, invalidCasesOf } from './index.ts';
import { Account, crm, Person } from './fixtures.ts';

// The generated tests of the sample module, run on SQLite in memory. A project writes this line and gets the same.
describeEntityContracts({ modules: [crm], values: { 'crm.Tagged': { label: 'tag' } } });

const casesOf = (entity: EntityDef<string>, name: string): string[] =>
  apiFields(entity)
    .filter((field) => field.name === name)
    .flatMap(invalidCasesOf)
    .map((one) => one.name);

describe('TST-02 the cases that the contract is made from', () => {
  it('TST-02 a required string is refused when missing, null, too long, too short and a number', () => {
    expect(casesOf(Account, 'code')).toEqual([
      'code: refuses a body without it',
      'code: refuses null',
      'code: refuses 9 characters, over its maximum',
      'code: refuses 2 characters, under its minimum',
      'code: refuses a number',
    ]);
  });

  it('TST-02 a number with bounds is refused under the minimum, over the maximum, as text and as a fraction', () => {
    expect(casesOf(Account, 'visits')).toEqual([
      'visits: refuses a body without it',
      'visits: refuses null',
      'visits: refuses a value under its minimum',
      'visits: refuses a value over its maximum',
      'visits: refuses text',
      'visits: refuses a fraction',
    ]);
  });

  it('TST-02 an optional or defaulted field may be left out and may not be null where it is not optional, so these cases are not made', () => {
    expect(casesOf(Account, 'note')).toEqual([
      'note: refuses 41 characters, over its maximum',
      'note: refuses a number',
    ]);
    expect(casesOf(Account, 'rank')).toEqual([
      'rank: refuses a value under its minimum',
      'rank: refuses a value over its maximum',
      'rank: refuses text',
      'rank: refuses a fraction',
    ]);
  });

  it('TST-02 what the server fills is a case of its own: the body may not set it', () => {
    expect(casesOf(Account, 'number')).toEqual(['number: refuses a value, because the server fills it']);
  });

  it('TST-02 a value list, an address, a day, an instant, a decimal, money and a relation have a case that fits them', () => {
    expect(casesOf(Account, 'tier')).toContain('tier: refuses a value that is not listed');
    expect(casesOf(Person, 'email')).toContain('email: refuses text that is not an address');
    expect(casesOf(Account, 'since')).toContain('since: refuses a day that does not exist');
    expect(casesOf(Account, 'seen')).toContain('seen: refuses text that is not an instant');
    expect(casesOf(Account, 'credit')).toContain('credit: refuses text that is not a number');
    expect(casesOf(Account, 'balance')).toContain('balance: refuses a bare number');
    expect(casesOf(Account, 'owner')).toContain('owner: refuses text that is not an id');
    expect(casesOf(Account, 'active')).toContain('active: refuses text');
  });
});
