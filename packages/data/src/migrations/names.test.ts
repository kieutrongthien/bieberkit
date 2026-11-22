/**
 * BieberKit
 *
 * @file        packages/data/src/migrations/names.test.ts
 * @description Tests of the file names of generated migrations, which must never overwrite an earlier file (DATA-08).
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
import { migrationFileName } from './names.ts';

describe('migrationFileName', () => {
  it('DATA-08 is Migration, the timestamp and the name', () => {
    expect(migrationFileName('20261122103000', undefined, () => false)).toBe('Migration20261122103000');
    expect(migrationFileName('20261122103000', 'add_notes', () => false)).toBe('Migration20261122103000_add_notes');
  });

  it('DATA-08 adds a number when the name is taken, so two files made in one second never overwrite each other', () => {
    const taken = new Set(['Migration20261122103000', 'Migration20261122103000_2']);
    expect(migrationFileName('20261122103000', undefined, (name) => taken.has(name))).toBe('Migration20261122103000_3');
    const named = new Set(['Migration20261122103000_users']);
    expect(migrationFileName('20261122103000', 'users', (name) => named.has(name))).toBe(
      'Migration20261122103000_users_2',
    );
  });

  it('DATA-08 sorts a numbered file after the file it follows', () => {
    const first = 'Migration20261122103000';
    const second = migrationFileName('20261122103000', undefined, (name) => name === first);
    expect([second, first].toSorted()).toEqual([first, second]);
  });

  it.each(['a b', '../x', 'a/b', 'a.b', ''])(
    'DATA-08 refuses the name %j, which would not be a safe file name',
    (name) => {
      expect(() => migrationFileName('20261122103000', name, () => false)).toThrow(/name/i);
    },
  );
});
