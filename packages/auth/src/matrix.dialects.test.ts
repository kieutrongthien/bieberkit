/**
 * BieberKit
 *
 * @file        packages/auth/src/matrix.dialects.test.ts
 * @description Tests of the generated permission matrix: it passes against the real authorizer and each of the six mutants breaks at least one case (section 21, ADR 0013).
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
import { uuid7 } from '@bieberkit/data';
import { MUTANTS, permissionMatrix } from './testing/index.ts';
import type { MatrixCaller, MatrixHarness } from './testing/index.ts';
import { DEALS, TENANT_A, TENANT_B, authApp } from './testing/app.ts';
import type { AuthApp } from './testing/app.ts';
import { describeDialects } from './testing/dialects.ts';
import { Deal, Plain, SCOPED } from './testing/sample.ts';

const OPTIONS = {
  scoped: SCOPED,
  conditions: [
    {
      permission: 'crm.deal.read-own',
      inside: (userId: string) => ({ assignee: userId }),
      outside: () => ({ assignee: uuid7() }),
    },
    {
      permission: 'crm.deal.update-own',
      inside: (userId: string) => ({ assignee: userId }),
      outside: () => ({ assignee: uuid7() }),
    },
  ],
} as const;

function harnessOf(app: AuthApp): MatrixHarness {
  let counter = 0;
  const callerOf = (client: ReturnType<AuthApp['asId']>, id: string): MatrixCaller => ({
    id,
    ...client,
    inTenant: (tenant) => callerOf(app.asId(id, tenant), id),
  });
  return {
    entity: Deal,
    path: DEALS,
    tenants: [TENANT_A, TENANT_B],
    sample: (extra = {}) => {
      counter += 1;
      return { code: `M${counter}`, title: `Row ${counter}`, ...extra };
    },
    edit: () => ({ title: 'Edited' }),
    valueOf: () => 7,
    caller: async (permissions, options = {}) => {
      const id = options.userId ?? uuid7();
      if (permissions.length > 0)
        await app.grantId(id, permissions, options.tenant === undefined ? {} : { tenant: options.tenant });
      return callerOf(app.asId(id, options.tenant ?? TENANT_A), id);
    },
    seed: async (tenant, rows) => Object.values(await app.seed(tenant, rows)),
    stored: (id, field) => app.stored(id, field),
  };
}

const CASES = permissionMatrix(Deal, OPTIONS);

describe('TST-03 the cases that are generated from the permissions of an entity', () => {
  it('TST-03 are made from the permissions block, the masks and the conditions that were given', () => {
    expect(CASES.map((item) => item.id)).toEqual([
      'default-deny',
      'read-allowed',
      'read-does-not-grant-write',
      'other-permissions-do-not-grant-read',
      'mask-hidden:margin',
      'mask-shown:margin',
      'mask-write-rejected:margin',
      'mask-write-accepted:margin',
      'tenant-isolation-list',
      'tenant-isolation-roles',
      'tenant-isolation-update',
      'update-empty-payload',
      'conditions:crm.deal.read-own',
      'conditions:crm.deal.update-own',
      'unsupported-denies:crm.deal.read-regex',
      'unsupported-denies:crm.deal.read-dotted',
      'unsupported-denies:crm.deal.read-unknown',
    ]);
    expect(new Set(CASES.map((item) => item.title)).size).toBe(CASES.length);
  });

  it('TST-03 an entity with no mask and no condition has the cases that need neither', () => {
    const ids = permissionMatrix(Plain).map((item) => item.id);
    expect(ids).toEqual([
      'default-deny',
      'read-allowed',
      'read-does-not-grant-write',
      'other-permissions-do-not-grant-read',
      'tenant-isolation-list',
      'tenant-isolation-roles',
      'tenant-isolation-update',
      'update-empty-payload',
    ]);
  });

  it('TST-03 six faults are known, with a name each', () => {
    expect(MUTANTS.map((mutant) => mutant.id)).toEqual([
      'ignore-conditions',
      'no-read-mask',
      'no-write-mask',
      'write-checks-read',
      'unsupported-allows-all',
      'tenant-blind-grants',
    ]);
  });
});

describeDialects('TST-03 the matrix against the real authorizer', ({ open }) => {
  for (const item of CASES) {
    it(`TST-03 ${item.title}`, async () => {
      const app = await authApp(open);
      await expect(item.run(harnessOf(app))).resolves.toBeUndefined();
    });
  }
});

describeDialects('TST-03 mutation testing of the authorizer', ({ open }) => {
  for (const mutant of MUTANTS) {
    it(`TST-03 ${mutant.id}: ${mutant.description} is caught by at least one case`, async () => {
      const caught: string[] = [];
      // One database for all the cases: a case judges the rows that it made, so the others do not disturb it.
      const app = await authApp(open, { authorizer: (options, tenants) => mutant.build(options, tenants) });
      const harness = harnessOf(app);
      for (const item of CASES) {
        try {
          await item.run(harness);
        } catch {
          caught.push(item.id);
        }
      }
      expect(caught.length).toBeGreaterThan(0);
    });
  }
});
