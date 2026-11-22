/**
 * BieberKit
 *
 * @file        packages/data/src/schema/define-entity.test.ts
 * @description Tests for defineEntity, the standard columns and the constraint expansion (DATA-07, DATA-15, DATA-16, DATA-18, DATA-20, DATA-26).
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
import { Customer, User } from '../testing/sample-entities.ts';
import { DataError } from '../errors.ts';
import { defineEntity, standardColumns, tableConstraints } from './define-entity.ts';
import type { EntityDef } from './define-entity.ts';
import { f } from './fields.ts';

type Input = Parameters<typeof defineEntity>[0];

function failure(run: () => unknown): DataError {
  try {
    run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

/** A valid entity input with `patch` laid over it, so that a test can break one rule at a time. */
const minimal = (patch: Record<string, unknown> = {}): Input =>
  // The patch may hold anything on purpose, so the result cannot be checked against `Input`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  Object.assign({ name: 'crm.Thing', table: 'crm_things', fields: { id: f.id() } }, patch) as Input;

describe('defineEntity result', () => {
  it('keeps the options, with tenant and softDelete off by default', () => {
    const def = defineEntity(minimal());
    expect(def).toMatchObject({ name: 'crm.Thing', table: 'crm_things', tenant: false, softDelete: false });
    expect(Object.keys(def.fields)).toEqual(['id']);
  });

  it('is deeply frozen, so no plugin can change an entity after the fact', () => {
    expect(Object.isFrozen(Customer)).toBe(true);
    expect(Object.isFrozen(Customer.fields)).toBe(true);
    expect(Object.isFrozen(Customer.fields['code'])).toBe(true);
    expect(Object.isFrozen(Customer.permissions)).toBe(true);
    expect(Object.isFrozen(Customer.label)).toBe(true);
  });

  it('keeps the field order of the declaration', () => {
    expect(Object.keys(Customer.fields).slice(0, 4)).toEqual(['id', 'code', 'name', 'email']);
  });

  it('does not change or keep a reference to its input', () => {
    const fields = { id: f.id(), a: f.string({ max: 5 }) };
    const def = defineEntity({ name: 'crm.Thing', table: 'crm_things', fields });
    // @ts-expect-error adding a field after the fact
    fields.b = f.string({ max: 5 });
    expect(Object.keys(def.fields)).toEqual(['id', 'a']);
    expect(Object.isFrozen(fields)).toBe(false);
  });

  it('passes permissions, api, admin, label and features through', () => {
    expect(Customer.permissions).toMatchObject({
      read: 'crm.customer.read',
      fields: { email: { read: 'crm.customer.read-pii' } },
    });
    expect(Customer.api).toMatchObject({ list: true, delete: true });
    expect(Customer.admin).toMatchObject({ title: 'name', icon: 'users' });
    expect(Customer.label).toEqual({ en: 'Customer', vi: 'Khách hàng' });
    expect(defineEntity(minimal({ features: ['comments', 'tags'] })).features).toEqual(['comments', 'tags']);
  });

  it('is typed by its name, so EntityDef<Name> can be written out (ADR 0009)', () => {
    const typed: EntityDef<'users.User'> = User;
    expect(typed.name).toBe('users.User');
    // @ts-expect-error a different name
    const wrong: EntityDef<'crm.Customer'> = User;
    expect(wrong).toBe(User);
  });
});

describe('defineEntity refuses a bad definition with DATA_ENTITY_INVALID', () => {
  it.each([
    [''],
    ['Customer'],
    ['crm.customer'],
    ['crm.Customer.x'],
    ['CRM.Customer'],
    ['crm-x.Customer'],
    ['crm.Cust omer'],
    ['1crm.Customer'],
  ])('the name %j', (name) => {
    expect(failure(() => defineEntity(minimal({ name }))).code).toBe('DATA_ENTITY_INVALID');
  });

  it.each([['crm-things'], ['Crm'], [''], ['1things'], ['x'.repeat(41)]])('the table %j', (table) => {
    expect(failure(() => defineEntity(minimal({ table }))).code).toBe('DATA_ENTITY_INVALID');
  });

  it('a table of exactly 40 characters', () => {
    expect(defineEntity(minimal({ table: 'a'.repeat(40) })).table).toHaveLength(40);
  });

  it('no id field, or an id that is not named id, or two ids', () => {
    expect(
      failure(() => defineEntity({ name: 'crm.Thing', table: 'crm_things', fields: { code: f.string({ max: 5 }) } }))
        .code,
    ).toBe('DATA_ENTITY_INVALID');
    expect(failure(() => defineEntity({ name: 'crm.Thing', table: 'crm_things', fields: { key: f.id() } })).code).toBe(
      'DATA_ENTITY_INVALID',
    );
    expect(
      failure(() => defineEntity({ name: 'crm.Thing', table: 'crm_things', fields: { id: f.id(), other: f.id() } }))
        .code,
    ).toBe('DATA_ENTITY_INVALID');
  });

  it.each([['Name'], ['first_name'], ['1a'], ['first-name'], ['']])('the field name %j', (name) => {
    expect(failure(() => defineEntity(minimal({ fields: { id: f.id(), [name]: f.string({ max: 5 }) } }))).code).toBe(
      'DATA_ENTITY_INVALID',
    );
  });

  it.each([['tenantId'], ['version'], ['createdBy'], ['updatedBy'], ['deletedAt'], ['deletedToken']])(
    'the reserved field name %s (DATA-18)',
    (name) => {
      const error = failure(() => defineEntity(minimal({ fields: { id: f.id(), [name]: f.string({ max: 5 }) } })));
      expect(error.code).toBe('DATA_ENTITY_INVALID');
      expect(error.message).toContain(name);
      expect(error.fix).toContain('standard column');
    },
  );

  it('createdAt and updatedAt must use their own kind and name', () => {
    expect(failure(() => defineEntity(minimal({ fields: { id: f.id(), createdAt: f.string({ max: 5 }) } }))).code).toBe(
      'DATA_ENTITY_INVALID',
    );
    expect(failure(() => defineEntity(minimal({ fields: { id: f.id(), created: f.createdAt() } }))).code).toBe(
      'DATA_ENTITY_INVALID',
    );
    expect(failure(() => defineEntity(minimal({ fields: { id: f.id(), changed: f.updatedAt() } }))).code).toBe(
      'DATA_ENTITY_INVALID',
    );
    expect(
      defineEntity(minimal({ fields: { id: f.id(), createdAt: f.createdAt(), updatedAt: f.updatedAt() } })).fields,
    ).toHaveProperty('createdAt');
  });

  it.each([
    ['a relation and its key', { owner: () => f.belongsTo(() => User), ownerId: () => f.string({ max: 5 }) }],
    [
      'a compared field and its shadow column',
      { name: () => f.string({ max: 5, compare: 'ci' }), nameCmp: () => f.string({ max: 5 }) },
    ],
    ['a money field and its minor amount', { price: () => f.money({ currency: 'USD' }), priceMinor: () => f.int() }],
    [
      'a money field and its currency',
      { price: () => f.money({ currency: 'USD' }), priceCurrency: () => f.string({ max: 3 }) },
    ],
    [
      'a decimal and its scaled column',
      { total: () => f.decimal({ precision: 5, scale: 2 }), totalScaled: () => f.int() },
    ],
  ])('a collision between %s', (_name, make) => {
    const fields = Object.fromEntries(Object.entries(make).map(([key, build]) => [key, build()]));
    const error = failure(() => defineEntity(minimal({ fields: { id: f.id(), ...fields } })));
    expect(error.code).toBe('DATA_ENTITY_INVALID');
    expect(error.fix).toContain('column');
  });

  it('the message names the entity and the field, and says how to fix it', () => {
    const error = failure(() => defineEntity(minimal({ fields: { id: f.id(), version: f.int() } })));
    expect(error.message).toContain('crm.Thing');
    expect(error.message).toContain('version');
    expect(error.fix).not.toBe('');
  });

  it('references in permissions.fields, admin and features must be valid', () => {
    expect(
      failure(() => defineEntity(minimal({ permissions: { fields: { nope: { read: 'x.read' } } } }))).message,
    ).toContain('nope');
    expect(failure(() => defineEntity(minimal({ admin: { title: 'nope' } }))).code).toBe('DATA_ENTITY_INVALID');
    expect(failure(() => defineEntity(minimal({ admin: { list: ['id', 'nope'] } }))).code).toBe('DATA_ENTITY_INVALID');
    expect(failure(() => defineEntity(minimal({ features: ['comments', 'chat'] }))).code).toBe('DATA_ENTITY_INVALID');
    expect(failure(() => defineEntity(minimal({ features: ['tags', 'tags'] }))).code).toBe('DATA_ENTITY_INVALID');
  });

  it('actions need a function to handle them', () => {
    expect(failure(() => defineEntity(minimal({ actions: { duplicate: { permission: 'x.create' } } }))).code).toBe(
      'DATA_ENTITY_INVALID',
    );
    expect(
      defineEntity(minimal({ actions: { duplicate: { permission: 'x.create', handle: () => undefined } } })).actions,
    ).toHaveProperty('duplicate');
  });

  it('a label is a map of locale to text', () => {
    expect(failure(() => defineEntity(minimal({ label: { en: 5 } }))).code).toBe('DATA_ENTITY_INVALID');
  });

  it('reports every problem together, not one at a time', () => {
    const error = failure(() =>
      defineEntity(minimal({ name: 'bad', table: 'Bad Table', fields: { id: f.id(), version: f.int() } })),
    );
    expect(error.message).toContain('name');
    expect(error.message).toContain('table');
    expect(error.message).toContain('version');
  });
});

describe('standardColumns (DATA-18)', () => {
  const columns = (def: EntityDef<string>): string[] => standardColumns(def).map((column) => column.column);

  it('a plain entity has id, version, created_at, updated_at, created_by and updated_by', () => {
    expect(columns(User)).toEqual(['id', 'version', 'created_at', 'updated_at', 'created_by', 'updated_by']);
  });

  it('tenant adds tenant_id after id', () => {
    expect(columns(defineEntity(minimal({ tenant: true })))).toEqual([
      'id',
      'tenant_id',
      'version',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
    ]);
  });

  it('softDelete adds deleted_at and deleted_token at the end', () => {
    expect(columns(defineEntity(minimal({ softDelete: true })))).toEqual([
      'id',
      'version',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'deleted_at',
      'deleted_token',
    ]);
  });

  it('both options together give the nine columns of DATA-18, in a fixed order', () => {
    expect(columns(Customer)).toEqual([
      'id',
      'tenant_id',
      'version',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'deleted_at',
      'deleted_token',
    ]);
  });

  it('declaring createdAt and updatedAt changes nothing, because the columns exist either way', () => {
    const declared = defineEntity(
      minimal({ fields: { id: f.id(), createdAt: f.createdAt(), updatedAt: f.updatedAt() } }),
    );
    expect(columns(declared)).toEqual(columns(defineEntity(minimal())));
  });

  it('gives the property name and whether the column may be empty', () => {
    const byColumn = Object.fromEntries(standardColumns(Customer).map((column) => [column.column, column]));
    expect(byColumn['tenant_id']).toMatchObject({ property: 'tenantId', nullable: false });
    expect(byColumn['version']).toMatchObject({ property: 'version', nullable: false });
    expect(byColumn['created_by']).toMatchObject({ property: 'createdBy', nullable: true });
    expect(byColumn['deleted_at']).toMatchObject({ property: 'deletedAt', nullable: true });
    expect(byColumn['deleted_token']).toMatchObject({ property: 'deletedToken', nullable: false });
  });
});

describe('tableConstraints (DATA-07, DATA-15, DATA-16, DATA-26)', () => {
  const constraints = tableConstraints(Customer);

  it('a tenant entity gets UNIQUE (tenant_id, id) as the target of composite foreign keys (DATA-26)', () => {
    expect(constraints.uniques[0]).toEqual({ name: 'crm_customers_tenant_id_id_uq', columns: ['tenant_id', 'id'] });
  });

  it('every unique field gets tenant_id first and deleted_token last (DATA-15, DATA-16), in declaration order', () => {
    expect(constraints.uniques.slice(1)).toEqual([
      { name: 'crm_customers_code_uq', columns: ['tenant_id', 'code', 'deleted_token'] },
      { name: 'crm_customers_email_uq', columns: ['tenant_id', 'email_cmp', 'deleted_token'] },
      { name: 'crm_customers_number_uq', columns: ['tenant_id', 'number', 'deleted_token'] },
    ]);
  });

  it('an indexed field gets tenant_id first, and a compared field is indexed on its shadow column (DATA-07, DATA-21)', () => {
    expect(constraints.indexes).toEqual([
      { name: 'crm_customers_name_idx', columns: ['tenant_id', 'name_cmp'] },
      { name: 'crm_customers_tier_idx', columns: ['tenant_id', 'tier'] },
    ]);
  });

  it('an entity without options has bare columns and no tenant pair', () => {
    const plain = defineEntity(
      minimal({ fields: { id: f.id(), code: f.string({ max: 5 }).unique(), owner: f.belongsTo(() => User).index() } }),
    );
    expect(tableConstraints(plain)).toEqual({
      uniques: [{ name: 'crm_things_code_uq', columns: ['code'] }],
      indexes: [{ name: 'crm_things_owner_id_idx', columns: ['owner_id'] }],
    });
  });

  it('softDelete alone adds only deleted_token to uniques, tenant alone adds only tenant_id', () => {
    const fields = { id: f.id(), code: f.string({ max: 5 }).unique() };
    expect(tableConstraints(defineEntity(minimal({ softDelete: true, fields }))).uniques[0]?.columns).toEqual([
      'code',
      'deleted_token',
    ]);
    expect(tableConstraints(defineEntity(minimal({ tenant: true, fields }))).uniques.at(-1)?.columns).toEqual([
      'tenant_id',
      'code',
    ]);
  });

  it('money is indexed on its minor amount, decimal on its scaled column, a relation on its key', () => {
    const def = defineEntity(
      minimal({
        fields: {
          id: f.id(),
          price: f.money({ currency: 'USD' }).index(),
          total: f.decimal({ precision: 8, scale: 2 }).unique(),
          owner: f.belongsTo(() => User).unique(),
        },
      }),
    );
    expect(tableConstraints(def)).toEqual({
      uniques: [
        { name: 'crm_things_total_uq', columns: ['total_scaled'] },
        { name: 'crm_things_owner_id_uq', columns: ['owner_id'] },
      ],
      indexes: [{ name: 'crm_things_price_idx', columns: ['price_minor'] }],
    });
  });

  it('a stored computed field can be indexed', () => {
    const def = defineEntity(
      minimal({
        fields: {
          id: f.id(),
          n: f
            .int()
            .computed(() => 1, { stored: true })
            .index(),
        },
      }),
    );
    expect(tableConstraints(def).indexes).toEqual([{ name: 'crm_things_n_idx', columns: ['n'] }]);
  });

  it('identifiers longer than 63 characters are cut and end with a hash of 8 characters, the same way every time', () => {
    const table = 'a'.repeat(40);
    const make = (field: string) =>
      defineEntity({ name: 'crm.Long', table, fields: { id: f.id(), [field]: f.string({ max: 5 }).unique() } });
    const first = tableConstraints(make(`${'b'.repeat(30)}One`)).uniques[0]?.name ?? '';
    const again = tableConstraints(make(`${'b'.repeat(30)}One`)).uniques[0]?.name ?? '';
    const other = tableConstraints(make(`${'b'.repeat(30)}Two`)).uniques[0]?.name ?? '';
    expect(first.length).toBeLessThanOrEqual(63);
    expect(first).toMatch(/_[0-9a-f]{8}$/);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it('short identifiers are left as they are', () => {
    expect(
      tableConstraints(defineEntity(minimal({ fields: { id: f.id(), a: f.string({ max: 5 }).unique() } }))).uniques[0]
        ?.name,
    ).toBe('crm_things_a_uq');
  });
});
