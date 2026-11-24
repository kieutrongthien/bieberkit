/**
 * BieberKit
 *
 * @file        packages/auth/src/check-conditions.test.ts
 * @description Tests of the build-time check of conditions: every way to write a condition that the language refuses, and the ones that it takes (AUTHZ-06, ADR 0013).
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
import { explainCondition } from './ability.ts';
import type { ScopedPermission } from './ability.ts';
import { checkScopedPermissions } from './check-conditions.ts';
import { Deal, Plain, SCOPED } from './testing/sample.ts';

const entities = [Deal, Plain];
const subject = Deal.name;

const scoped = (
  when: ScopedPermission['when'],
  overrides: Partial<ScopedPermission> = {},
): Record<string, ScopedPermission> => ({
  'crm.deal.read-own': { subject, action: 'read', when, ...overrides },
});

describe('AUTHZ-06 explainCondition', () => {
  const properties = new Set(['id', 'assignee', 'amount', 'stage']);

  it('AUTHZ-06 takes a plain value, an operator and a list', () => {
    for (const condition of [
      { assignee: 'u1' },
      { amount: { $gt: 100 } },
      { stage: { $in: ['open', 'won'] } },
      { assignee: null },
    ]) {
      expect(explainCondition(condition, properties)).toBeUndefined();
    }
  });

  it('AUTHZ-06 says why a condition is refused, for each way that it can be wrong', () => {
    expect(explainCondition('assignee', properties)).toMatch(/object/);
    expect(explainCondition({}, properties)).toMatch(/empty/);
    expect(explainCondition({ $or: [{ assignee: 'u1' }] }, properties)).toMatch(/\$or is not allowed/);
    expect(explainCondition({ $and: [] }, properties)).toMatch(/\$and is not allowed/);
    expect(explainCondition({ $not: {} }, properties)).toMatch(/\$not is not allowed/);
    expect(explainCondition({ 'owner.name': 'x' }, properties)).toMatch(/path/);
    expect(explainCondition({ nothing: 'x' }, properties)).toMatch(/not a property/);
    expect(explainCondition({ amount: {} }, properties)).toMatch(/no operator/);
    expect(explainCondition({ amount: { $regex: 'x' } }, properties)).toMatch(/not an operator/);
    expect(explainCondition({ amount: { $gt: { deep: 1 } } }, properties)).toMatch(/plain value/);
    expect(explainCondition({ stage: { $in: 'open' } }, properties)).toMatch(/list/);
    expect(explainCondition({ stage: { $in: [{}] } }, properties)).toMatch(/list/);
    expect(explainCondition({ amount: { $gt: { deep: { a: 1 } } } }, properties)).toBeDefined();
  });

  it('AUTHZ-06 a range is taken at run time and refused when it is declared: one operator for each field', () => {
    const range = { amount: { $gte: 1, $lte: 9 } };
    expect(explainCondition(range, properties)).toBeUndefined();
    expect(explainCondition(range, properties, { oneOperator: true })).toMatch(/2 operators/);
  });
});

describe('AUTHZ-06 checkScopedPermissions', () => {
  it('AUTHZ-06 of the sample project, the check finds exactly the three conditions that fail closed at run time', () => {
    expect(checkScopedPermissions(SCOPED, entities).map((finding) => finding.permission)).toEqual([
      'crm.deal.read-regex',
      'crm.deal.read-dotted',
      'crm.deal.read-unknown',
    ]);
  });

  it('AUTHZ-06 a condition in the language is no finding, whatever the user', () => {
    expect(
      checkScopedPermissions(
        scoped((user) => ({ assignee: user.id })),
        entities,
      ),
    ).toEqual([]);
    expect(
      checkScopedPermissions(
        scoped((user) => ({ assignee: { $eq: user.id } })),
        entities,
      ),
    ).toEqual([]);
  });

  it('AUTHZ-06 refuses or, and, not, a path, an unknown property, a range, an operator that does not exist, and an empty condition', () => {
    const cases: [string, ScopedPermission['when']][] = [
      ['or', () => ({ $or: [{ assignee: 'a' }, { assignee: 'b' }] })],
      ['and', () => ({ $and: [{ assignee: 'a' }] })],
      ['not', () => ({ $not: { assignee: 'a' } })],
      ['path', () => ({ 'assignee.name': 'a' })],
      ['unknown', () => ({ nobody: 'a' })],
      ['range', () => ({ id: { $gte: 'a', $lte: 'z' } })],
      ['operator', () => ({ assignee: { $regex: 'a' } })],
      ['empty', () => ({})],
    ];
    for (const [name, when] of cases) {
      const findings = checkScopedPermissions(scoped(when), entities);
      expect(findings.map((finding) => `${name}:${finding.code}`)).toEqual([`${name}:CONDITION_NOT_ALLOWED`]);
      expect(findings[0]).toMatchObject({ permission: 'crm.deal.read-own', code: 'CONDITION_NOT_ALLOWED' });
      expect(findings[0]?.fix).toContain('ADR 0013');
    }
  });

  it('AUTHZ-06 finds a condition that is only wrong for some users', () => {
    const findings = checkScopedPermissions(
      scoped((user) => (user.tenantId === undefined ? { $or: [{ assignee: user.id }] } : { assignee: user.id })),
      entities,
    );
    expect(findings).toHaveLength(1);
  });

  it('AUTHZ-06 a condition that throws is a finding that says it, also for a user with no tenant', () => {
    const findings = checkScopedPermissions(
      scoped((user) => {
        if (user.tenantId === undefined) throw new Error('no tenant');
        return { assignee: user.id };
      }),
      entities,
    );
    expect(findings[0]).toMatchObject({ code: 'CONDITION_THROWS' });
    expect(findings[0]?.message).toContain('no tenant');
  });

  it('AUTHZ-06 an entity that does not exist and an action that does not exist are findings', () => {
    expect(
      checkScopedPermissions(
        scoped(() => ({ id: 'a' }), { subject: 'crm.Ghost' }),
        entities,
      )[0],
    ).toMatchObject({
      code: 'SUBJECT_UNKNOWN',
    });
    // The test names an action that the types forbid, on purpose.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const wrongAction = { action: 'fly' as never };
    expect(
      checkScopedPermissions(
        scoped(() => ({ id: 'a' }), wrongAction),
        entities,
      )[0],
    ).toMatchObject({
      code: 'ACTION_INVALID',
    });
    expect(
      checkScopedPermissions(
        scoped(() => ({ id: 'a' }), { action: 'transition:close' }),
        entities,
      ),
    ).toEqual([]);
  });

  it('AUTHZ-06 reports every permission with a problem, and none that is fine', () => {
    const findings = checkScopedPermissions(
      {
        'crm.deal.read-own': { subject, action: 'read', when: (user) => ({ id: user.id }) },
        'crm.deal.update-bad': { subject, action: 'update', when: () => ({ $or: [] }) },
        'crm.deal.delete-bad': { subject, action: 'delete', when: () => ({}) },
      },
      entities,
    );
    expect(findings.map((finding) => finding.permission)).toEqual(['crm.deal.update-bad', 'crm.deal.delete-bad']);
  });
});
