/**
 * BieberKit
 *
 * @file        packages/testing/src/when.contract.test.ts
 * @description The evaluator of the conditions of a form in the admin and the one of the data package give the same answer for every condition of a table, so that the browser and the server cannot disagree about what is shown or required (UI-11).
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

import { evaluateWhen as inTheAdmin } from '@bieberkit/admin-core';
import type { When } from '@bieberkit/admin-core';
import { evaluateWhen as onTheServer } from '@bieberkit/data/schema';
import { describe, expect, it } from 'vitest';

const VALUES = { tier: 'gold', active: true, note: '', visits: 0, owner: null, flag: false, list: [] as string[] };

const CASES: readonly When[] = [
  { field: 'tier', eq: 'gold' },
  { field: 'tier', eq: 'vip' },
  { field: 'tier', ne: 'gold' },
  { field: 'tier', ne: 'vip' },
  { field: 'tier', in: ['gold', 'vip'] },
  { field: 'tier', in: ['basic'] },
  { field: 'owner', eq: null },
  { field: 'absent', eq: null },
  { field: 'note', eq: null },
  { field: 'note', set: true },
  { field: 'note', set: false },
  { field: 'visits', set: true },
  { field: 'flag', set: true },
  { field: 'list', set: true },
  { field: 'visits', eq: 0 },
  { field: 'flag', eq: false },
  { field: 'owner', ne: null },
  {
    all: [
      { field: 'tier', eq: 'gold' },
      { field: 'active', eq: true },
    ],
  },
  { all: [] },
  { any: [] },
  { any: [{ field: 'tier', eq: 'x' }, { not: { field: 'active', eq: false } }] },
  {
    not: {
      all: [
        { field: 'tier', in: ['gold'] },
        { field: 'note', set: false },
      ],
    },
  },
];

describe('UI-11 the evaluator of the admin is the one of the data package', () => {
  it('UI-11 gives the same answer for every condition of the table, over the same values', () => {
    for (const when of CASES) {
      expect(`${JSON.stringify(when)} ${String(inTheAdmin(when, VALUES))}`).toBe(
        `${JSON.stringify(when)} ${String(onTheServer(when, VALUES))}`,
      );
    }
  });
});
