/**
 * BieberKit
 *
 * @file        packages/auth/src/ability.test.ts
 * @description Tests of the ability of one request: default deny, field masks, the condition language and the scope that it gives (AUTHZ-01 to AUTHZ-06, ADR 0013).
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
import { buildAbility } from './ability.ts';
import type { EntityShape, ScopedPermission } from './ability.ts';
import { buildPermissionRegistry } from './registry.ts';
import { Deal, SCOPED } from './testing/sample.ts';

const registry = buildPermissionRegistry([Deal]);
const SHAPE: EntityShape = {
  name: 'crm.Deal',
  properties: new Set([
    'id',
    'code',
    'title',
    'stage',
    'amount',
    'assignee',
    'margin',
    'status',
    'createdAt',
    'updatedAt',
    'version',
  ]),
  fields: ['code', 'title', 'stage', 'amount', 'assignee', 'margin', 'status'],
};
const USER = { id: 'user-1', tenantId: 'tenant-1' };

const ability = (granted: string[], scoped: Readonly<Record<string, ScopedPermission>> = SCOPED) =>
  buildAbility({ registry, granted: new Set(granted), scoped, user: USER });

describe('AUTHZ-04 default deny', () => {
  it('AUTHZ-04 a caller with no grant may do nothing', () => {
    const none = ability([]);
    for (const action of ['read', 'create', 'update', 'delete', 'transition:close'] as const) {
      expect(none.access(SHAPE, action)).toEqual({ allowed: false, reason: 'no-permission' });
    }
  });

  it('AUTHZ-04 a permission allows its own action and no other', () => {
    const reader = ability(['crm.deal.read']);
    expect(reader.access(SHAPE, 'read').allowed).toBe(true);
    for (const action of ['create', 'update', 'delete', 'transition:close'] as const) {
      expect(reader.access(SHAPE, action).allowed).toBe(false);
    }
  });

  it('MOD-06 a transition needs the permission of that transition, and update does not give it', () => {
    expect(ability(['crm.deal.close']).access(SHAPE, 'transition:close').allowed).toBe(true);
    expect(ability(['crm.deal.update']).access(SHAPE, 'transition:close').allowed).toBe(false);
    expect(ability(['crm.deal.close']).access(SHAPE, 'update').allowed).toBe(false);
  });

  it('AUTHZ-04 a permission of another entity grants nothing here', () => {
    expect(ability(['crm.plain.read']).access(SHAPE, 'read').allowed).toBe(false);
  });

  it('AUTHZ-01 has() answers a plain capability by its name, and ignores a string that nothing knows', () => {
    const granted = ability(['system.api-docs', 'crm.deal.read']);
    expect(granted.has('system.api-docs')).toBe(true);
    expect(granted.has('crm.deal.read')).toBe(true);
    expect(granted.has('crm.deal.update')).toBe(false);
    expect(ability(['nonsense']).access(SHAPE, 'read').allowed).toBe(false);
  });
});

describe('AUTHZ-03 field masks', () => {
  it('AUTHZ-03 hides a masked field from a read without its permission, and shows the others', () => {
    const answer = ability(['crm.deal.read']).access(SHAPE, 'read');
    expect([...(answer.readable ?? [])].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'amount',
      'assignee',
      'code',
      'stage',
      'status',
      'title',
    ]);
  });

  it('AUTHZ-03 shows the masked field to a caller who has the permission of the field', () => {
    const answer = ability(['crm.deal.read', 'crm.deal.read-margin']).access(SHAPE, 'read');
    expect(answer.readable?.has('margin')).toBe(true);
  });

  it('AUTHZ-03 the permission of a field alone does not allow a read', () => {
    expect(ability(['crm.deal.read-margin']).access(SHAPE, 'read').allowed).toBe(false);
  });

  it('AUTHZ-03 a write may not touch a masked field without the update permission of the field, and read is not enough', () => {
    const plain = ability(['crm.deal.update']).access(SHAPE, 'update');
    expect(plain.writable?.has('margin')).toBe(false);
    expect(plain.writable?.has('title')).toBe(true);
    expect(ability(['crm.deal.update', 'crm.deal.read-margin']).access(SHAPE, 'update').writable?.has('margin')).toBe(
      false,
    );
    expect(ability(['crm.deal.update', 'crm.deal.edit-margin']).access(SHAPE, 'update').writable?.has('margin')).toBe(
      true,
    );
  });

  it('AUTHZ-03 create is masked like update', () => {
    expect(ability(['crm.deal.create']).access(SHAPE, 'create').writable?.has('margin')).toBe(false);
    expect(ability(['crm.deal.create', 'crm.deal.edit-margin']).access(SHAPE, 'create').writable?.has('margin')).toBe(
      true,
    );
  });
});

describe('AUTHZ-02 the scope of a condition', () => {
  it('AUTHZ-02 gives no scope when nothing limits the rows', () => {
    const answer = ability(['crm.deal.read']).access(SHAPE, 'read');
    expect(answer.allowed).toBe(true);
    expect(answer.scope).toBeUndefined();
  });

  it('AUTHZ-02 gives the condition of a scoped permission, with the user filled in', () => {
    expect(ability(['crm.deal.read-own']).access(SHAPE, 'read').scope).toEqual({ assignee: 'user-1' });
  });

  it('AUTHZ-02 a caller with the permission for every row and the one for his own rows sees every row', () => {
    expect(ability(['crm.deal.read', 'crm.deal.read-own']).access(SHAPE, 'read').scope).toBeUndefined();
  });

  it('AUTHZ-02 two conditions give the rows of either one', () => {
    const scope = ability(['crm.deal.read-own', 'crm.deal.read-big']).access(SHAPE, 'read').scope;
    expect(scope).toEqual({ $or: expect.arrayContaining([{ assignee: 'user-1' }, { amount: { $gte: 1000 } }]) });
  });

  it('AUTHZ-02 a scoped permission is for its own action only', () => {
    const owner = ability(['crm.deal.read-own']);
    expect(owner.access(SHAPE, 'update').allowed).toBe(false);
    expect(ability(['crm.deal.update-own']).access(SHAPE, 'update').scope).toEqual({ assignee: 'user-1' });
  });

  it('AUTHZ-02 a field with several operators gives them together, and in, ne and null work', () => {
    const scoped: Record<string, ScopedPermission> = {
      many: {
        subject: 'crm.Deal',
        action: 'read',
        when: () => ({ amount: { $gt: 1, $lte: 9 }, stage: { $nin: ['lost'] }, assignee: null }),
      },
      neq: { subject: 'crm.Deal', action: 'read', when: () => ({ assignee: { $ne: null } }) },
      lt: { subject: 'crm.Deal', action: 'read', when: () => ({ amount: { $lt: 5 }, code: { $eq: 'A' } }) },
    };
    expect(ability(['many'], scoped).access(SHAPE, 'read').scope).toEqual({
      amount: { $gt: 1, $lte: 9 },
      stage: { $nin: ['lost'] },
      assignee: null,
    });
    expect(ability(['neq'], scoped).access(SHAPE, 'read').scope).toEqual({ assignee: { $ne: null } });
    expect(ability(['lt'], scoped).access(SHAPE, 'read').scope).toEqual({ amount: { $lt: 5 }, code: 'A' });
    expect(ability(['crm.deal.read-open']).access(SHAPE, 'read').scope).toEqual({
      stage: { $in: ['lead'] },
      amount: { $ne: null },
    });
  });

  it('AUTHZ-02 the function of a condition receives the user of the request', () => {
    const seen: unknown[] = [];
    const scoped = {
      s: { subject: 'crm.Deal', action: 'read', when: (user: unknown) => (seen.push(user), { assignee: 'x' }) },
    } as const;
    ability(['s'], scoped).access(SHAPE, 'read');
    expect(seen).toEqual([USER]);
  });
});

describe('AUTHZ-06 the language fails closed', () => {
  it.each([
    ['a regular expression', 'crm.deal.read-regex'],
    ['a dotted path', 'crm.deal.read-dotted'],
    ['a field that the entity does not have', 'crm.deal.read-unknown'],
  ])('AUTHZ-06 %s denies, and says why', (_name, permission) => {
    expect(ability([permission]).access(SHAPE, 'read')).toEqual({ allowed: false, reason: 'unsupported-condition' });
  });

  it.each([
    ['$exists', { assignee: { $exists: true } }],
    ['$all', { assignee: { $all: ['a'] } }],
    ['$size', { assignee: { $size: 1 } }],
    ['$elemMatch', { assignee: { $elemMatch: { a: 1 } } }],
    ['$or inside a condition', { $or: [{ amount: 1 }, { amount: 2 }] }],
    ['$and inside a condition', { $and: [{ amount: 1 }] }],
    ['$not inside a condition', { $not: { amount: 1 } }],
    ['$mod', { amount: { $mod: [2, 0] } }],
    ['$where', { $where: 'true' }],
  ])('AUTHZ-06 %s denies, and does not widen', (_name, condition) => {
    const scoped = { s: { subject: 'crm.Deal', action: 'read', when: () => condition } } as const;
    expect(ability(['s'], scoped).access(SHAPE, 'read')).toEqual({ allowed: false, reason: 'unsupported-condition' });
  });

  it('AUTHZ-06 a bad condition next to a good one does not widen: the whole answer is a denial', () => {
    expect(ability(['crm.deal.read-own', 'crm.deal.read-regex']).access(SHAPE, 'read')).toEqual({
      allowed: false,
      reason: 'unsupported-condition',
    });
  });

  it('AUTHZ-06 a bad condition does not matter when a permission for every row is also granted', () => {
    expect(ability(['crm.deal.read', 'crm.deal.read-regex']).access(SHAPE, 'read')).toMatchObject({ allowed: true });
  });

  it('AUTHZ-06 a condition that throws is a denial, not a crash', () => {
    const scoped = {
      s: {
        subject: 'crm.Deal',
        action: 'read',
        when: () => {
          throw new Error('boom');
        },
      },
    } as const;
    expect(ability(['s'], scoped).access(SHAPE, 'read')).toEqual({ allowed: false, reason: 'unsupported-condition' });
  });

  it('AUTHZ-06 a scoped permission that disagrees with the entity that declares the same string is refused when the ability is built', () => {
    const conflicting = { 'crm.deal.read': { subject: 'crm.Deal', action: 'update', when: () => ({}) } } as const;
    expect(() => ability(['crm.deal.read'], conflicting)).toThrow(
      expect.objectContaining({ code: 'AUTHZ_PERMISSION_CONFLICT' }),
    );
  });
});

describe('AUTHZ-02 a row in memory', () => {
  it('AUTHZ-02 allows a create or an update that the conditions accept, and refuses what they do not', () => {
    const owner = ability(['crm.deal.create-own', 'crm.deal.update-own']);
    expect(owner.allows(SHAPE, 'create', { assignee: 'user-1', title: 'x' })).toBe(true);
    expect(owner.allows(SHAPE, 'create', { assignee: 'user-2' })).toBe(false);
    expect(owner.allows(SHAPE, 'create', { title: 'no assignee' })).toBe(false);
    expect(owner.allows(SHAPE, 'update', { assignee: 'user-1' })).toBe(true);
    expect(owner.allows(SHAPE, 'update', { assignee: 'user-2' })).toBe(false);
  });

  it('AUTHZ-02 allows any row when the permission has no condition, and no row without a permission', () => {
    expect(ability(['crm.deal.create']).allows(SHAPE, 'create', { assignee: 'someone' })).toBe(true);
    expect(ability([]).allows(SHAPE, 'create', { assignee: 'user-1' })).toBe(false);
  });

  it('AUTHZ-02 compares with the same operators as the scope', () => {
    const big = ability(['crm.deal.read-big']);
    expect(big.allows(SHAPE, 'read', { amount: 1000 })).toBe(true);
    expect(big.allows(SHAPE, 'read', { amount: 999 })).toBe(false);
  });

  it('AUTHZ-06 refuses a row when the condition is not in the language', () => {
    expect(ability(['crm.deal.read-regex']).allows(SHAPE, 'read', { title: 'abc' })).toBe(false);
  });
});
