/**
 * BieberKit
 *
 * @file        packages/data/src/orm/compile.test.ts
 * @description Tests for the compiler from EntityDef to MikroORM schemas, without a database (DATA-15, DATA-16, DATA-18, DATA-20, DATA-26, CFG-11).
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

import { EntitySchema } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { defineEntity, f, snake, tableConstraints } from '../schema/index.ts';
import { Contact, Customer, User } from '../testing/sample-entities.ts';
import { compileEntities } from './compile.ts';

interface Meta {
  readonly className: string;
  readonly tableName: string;
  readonly properties: Record<string, Record<string, unknown>>;
  readonly uniques: readonly { readonly name?: string; readonly properties: readonly string[] }[];
  readonly indexes: readonly { readonly name?: string; readonly properties: readonly string[] }[];
  readonly filters: Record<string, unknown>;
}

/** The metadata of a schema before MikroORM has discovered it. */
function metaOf(schema: EntitySchema): Meta {
  const meta: unknown = Reflect.get(schema, 'meta');
  if (typeof meta !== 'object' || meta === null) throw new Error('A schema must have metadata.');
  // The shape is the part of MikroORM's EntityMetadata that these tests read.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return meta as Meta;
}

function failure(run: () => unknown): DataError {
  try {
    run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

function compiled(...defs: Parameters<typeof compileEntities>[0][number][]) {
  return compileEntities(defs).map(metaOf);
}

/** Column names in a constraint to the property names of the compiled schema, which is what MikroORM wants. */
const PROPERTY: Readonly<Record<string, string>> = {
  tenant_id: 'tenantId',
  deleted_token: 'deletedToken',
  email_cmp: 'emailCmp',
  name_cmp: 'nameCmp',
  full_name_cmp: 'fullNameCmp',
};
const toProperties = (columns: readonly string[]): string[] =>
  columns.map((column) => PROPERTY[column] ?? column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()));

describe('compileEntities result', () => {
  it('gives one schema per definition, in the same order, named and tabled like the definition', () => {
    const schemas = compileEntities([User, Customer, Contact]);
    expect(schemas).toHaveLength(3);
    expect(schemas.map((schema) => metaOf(schema).className)).toEqual(['users.User', 'crm.Customer', 'crm.Contact']);
    expect(schemas.map((schema) => metaOf(schema).tableName)).toEqual(['users', 'crm_customers', 'crm_contacts']);
  });

  it('appends hand written schemas unchanged, after the generated ones', () => {
    const raw = new EntitySchema({
      name: 'legacy.Tag',
      tableName: 'legacy_tags',
      properties: { id: { type: 'string', primary: true } },
    });
    const schemas = compileEntities([User], { raw: [raw] });
    expect(schemas).toHaveLength(2);
    expect(schemas[1]).toBe(raw);
  });

  it('works for definitions that refer to each other', () => {
    const A = defineEntity({
      name: 'cyc.A',
      table: 'cyc_a',
      fields: { id: f.id(), other: f.belongsTo(() => B).optional() },
    });
    const B = defineEntity({
      name: 'cyc.B',
      table: 'cyc_b',
      fields: { id: f.id(), other: f.belongsTo(() => A).optional() },
    });
    expect(() => compileEntities([A, B])).not.toThrow();
  });

  it('refuses a relation to an entity that is not in the list', () => {
    const error = failure(() => compileEntities([Contact]));
    expect(error.code).toBe('DATA_ENTITY_INVALID');
    expect(error.message).toContain('crm.Customer');
  });

  it('refuses two entities with the same name', () => {
    expect(failure(() => compileEntities([User, User])).code).toBe('DATA_ENTITY_INVALID');
  });
});

describe('DATA-18 standard columns', () => {
  const [user, customer] = compiled(User, Customer);

  it('every entity has id, version, createdAt, updatedAt, createdBy and updatedBy', () => {
    for (const meta of [user, customer]) {
      for (const name of ['id', 'version', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'])
        expect(Object.keys(meta?.properties ?? {})).toContain(name);
    }
  });

  it('tenant and softDelete add their columns, and only then', () => {
    expect(Object.keys(user?.properties ?? {})).not.toEqual(expect.arrayContaining(['tenantId']));
    expect(Object.keys(user?.properties ?? {})).not.toEqual(expect.arrayContaining(['deletedAt']));
    expect(Object.keys(customer?.properties ?? {})).toEqual(
      expect.arrayContaining(['tenantId', 'deletedAt', 'deletedToken']),
    );
  });

  it('version is the versioned property, and id is the primary key', () => {
    expect(customer?.properties['version']).toMatchObject({ version: true });
    expect(customer?.properties['id']).toMatchObject({ primary: true });
  });

  it('the shadow column of a compared field exists, is hidden, and has a name next to its field', () => {
    expect(customer?.properties['nameCmp']).toMatchObject({ hidden: true });
    expect(customer?.properties['emailCmp']).toMatchObject({ hidden: true });
    expect(Object.keys(customer?.properties ?? {})).not.toContain('codeCmp');
  });
});

describe('mapping of the field kinds', () => {
  const [, customer] = compiled(User, Customer);
  const names = Object.keys(customer?.properties ?? {});

  it('a decimal is a scaled column, money is an amount and a currency, a relation keeps its name', () => {
    expect(names).toEqual(expect.arrayContaining(['creditScaled', 'balanceMinor', 'balanceCurrency', 'owner']));
    expect(names).not.toEqual(expect.arrayContaining(['credit', 'balance']));
  });

  it('a computed field that is not stored has no column, a stored one has', () => {
    expect(names).not.toContain('score');
    const Invoice = defineEntity({
      name: 'sales.Invoice',
      table: 'sales_invoices',
      fields: { id: f.id(), qty: f.int(), price: f.int(), total: f.int().computed(() => 0, { stored: true }) },
    });
    expect(Object.keys(compiled(Invoice)[0]?.properties ?? {})).toContain('total');
  });

  it('state and sequence are plain columns, and a sequence may be empty until the server numbers it', () => {
    expect(customer?.properties['status']).toBeDefined();
    expect(customer?.properties['number']).toMatchObject({ nullable: true });
  });

  it('an optional field is nullable, a required one is not', () => {
    expect(customer?.properties['email']).toMatchObject({ nullable: true });
    expect(customer?.properties['code']).not.toMatchObject({ nullable: true });
  });

  it('a custom field keeps the column type of its definition', () => {
    const Asset = defineEntity({
      name: 'inv.Asset',
      table: 'inv_assets',
      fields: {
        id: f.id(),
        tag: f.custom({
          column: { type: 'varchar', length: 8 },
          jsonSchema: { type: 'string' },
          zod: { _zod: {} },
          tsType: 'string',
        }),
      },
    });
    expect(compiled(Asset)[0]?.properties['tag']).toMatchObject({ type: 'varchar', length: 8 });
  });

  it('the orm override adds indexes and merges property metadata, after everything else', () => {
    const Legacy = defineEntity({
      name: 'old.Thing',
      table: 'old_things',
      fields: { id: f.id(), code: f.string({ max: 10 }), tier: f.string({ max: 10 }) },
      orm: {
        indexes: [{ name: 'old_things_code_tier_idx', properties: ['code', 'tier'] }],
        properties: { code: { comment: 'legacy code' } },
      },
    });
    const [meta] = compiled(Legacy);
    expect(meta?.indexes.map((index) => index.name)).toContain('old_things_code_tier_idx');
    expect(meta?.properties['code']).toMatchObject({ comment: 'legacy code' });
  });
});

describe('DATA-15, DATA-16, DATA-26 constraints', () => {
  const [, customer, contact] = compiled(User, Customer, Contact);

  it('the unique constraints and indexes are those of tableConstraints, with property names', () => {
    const expected = tableConstraints(Customer);
    expect(customer?.uniques.map((unique) => ({ name: unique.name, properties: [...unique.properties] }))).toEqual(
      expected.uniques.map((unique) => ({ name: unique.name, properties: toProperties(unique.columns) })),
    );
    expect(customer?.indexes.map((index) => ({ name: index.name, properties: [...index.properties] }))).toEqual(
      expected.indexes.map((index) => ({ name: index.name, properties: toProperties(index.columns) })),
    );
  });

  it('a tenant entity has UNIQUE (tenant_id, id), and every unique field has tenant_id first and deleted_token last', () => {
    expect(customer?.uniques[0]?.properties).toEqual(['tenantId', 'id']);
    const code = customer?.uniques.find((unique) => unique.properties.includes('code'));
    expect(code?.properties).toEqual(['tenantId', 'code', 'deletedToken']);
  });

  it('a compared field is constrained on its shadow column', () => {
    expect(customer?.uniques.some((unique) => unique.properties.includes('emailCmp'))).toBe(true);
    expect(customer?.uniques.some((unique) => unique.properties.includes('email'))).toBe(false);
    expect(contact?.indexes.some((index) => index.properties.includes('fullNameCmp'))).toBe(true);
  });
});

describe('DATA-20 relations', () => {
  it('between two tenant entities the relation is a composite foreign key onto (tenant_id, id)', () => {
    const [, , contact] = compiled(User, Customer, Contact);
    expect(contact?.properties['customer']).toMatchObject({
      kind: 'm:1',
      joinColumns: ['tenant_id', 'customer_id'],
      referencedColumnNames: ['tenant_id', 'id'],
    });
  });

  it('from a tenant entity to a global one it is a plain foreign key on one column', () => {
    const [, customer] = compiled(User, Customer);
    expect(customer?.properties['owner']).toMatchObject({ kind: 'm:1', fieldName: 'owner_id' });
    expect(customer?.properties['owner']).not.toHaveProperty('referencedColumnNames');
  });

  it('a global entity that references a tenant entity is refused', () => {
    const Note = defineEntity({
      name: 'crm.Note',
      table: 'crm_notes',
      fields: { id: f.id(), customer: f.belongsTo(() => Customer) },
    });
    const error = failure(() => compileEntities([User, Customer, Note]));
    expect(error.code).toBe('DATA_ENTITY_INVALID');
    expect(error.message).toContain('crm.Note');
    expect(error.message.toLowerCase()).toContain('tenant');
  });

  it('hasMany and hasOne point at the only relation of the target that points back', () => {
    const Order = defineEntity({
      name: 'shop.Order',
      table: 'shop_orders',
      tenant: true,
      fields: { id: f.id(), lines: f.hasMany(() => Line) },
    });
    const Line = defineEntity({
      name: 'shop.Line',
      table: 'shop_lines',
      tenant: true,
      fields: { id: f.id(), order: f.belongsTo(() => Order) },
    });
    const [order] = compiled(Order, Line);
    expect(order?.properties['lines']).toMatchObject({ kind: '1:m', mappedBy: 'order' });

    const Account = defineEntity({
      name: 'acc.Account',
      table: 'acc_accounts',
      fields: { id: f.id(), profile: f.hasOne(() => Profile) },
    });
    const Profile = defineEntity({
      name: 'acc.Profile',
      table: 'acc_profiles',
      fields: { id: f.id(), account: f.belongsTo(() => Account).unique() },
    });
    expect(compiled(Account, Profile)[0]?.properties['profile']).toMatchObject({ kind: '1:1', mappedBy: 'account' });
  });

  it('a relation back that is missing, or that is ambiguous, is refused with the names of the entities', () => {
    const Parent = defineEntity({
      name: 'p.Parent',
      table: 'p_parents',
      fields: { id: f.id(), kids: f.hasMany(() => Kid) },
    });
    const Kid = defineEntity({ name: 'p.Kid', table: 'p_kids', fields: { id: f.id(), name: f.string({ max: 5 }) } });
    expect(failure(() => compileEntities([Parent, Kid])).message).toContain('p.Kid');

    const Twin = defineEntity({
      name: 'p.Twin',
      table: 'p_twins',
      fields: { id: f.id(), a: f.belongsTo(() => Parent2), b: f.belongsTo(() => Parent2) },
    });
    const Parent2 = defineEntity({
      name: 'p.Parent2',
      table: 'p_parents2',
      fields: { id: f.id(), twins: f.hasMany(() => Twin) },
    });
    const error = failure(() => compileEntities([Parent2, Twin]));
    expect(error.code).toBe('DATA_ENTITY_INVALID');
    expect(error.message).toContain('a');
    expect(error.message).toContain('b');
  });
});

describe('DATA-09 filters', () => {
  it('a tenant entity has the tenant filter, a soft delete entity the soft delete filter, and a plain one none', () => {
    const [user, customer, contact] = compiled(User, Customer, Contact);
    expect(Object.keys(customer?.filters ?? {}).toSorted()).toEqual(['softDelete', 'tenant']);
    expect(Object.keys(contact?.filters ?? {})).toEqual(['tenant']);
    expect(Object.keys(user?.filters ?? {})).toEqual([]);
  });

  it('both filters are on by default', () => {
    const [, customer] = compiled(User, Customer);
    expect(customer?.filters['tenant']).toMatchObject({ default: true });
    expect(customer?.filters['softDelete']).toMatchObject({ default: true });
  });
});

describe('CFG-11 tenancy: single', () => {
  const single = compileEntities([User, Customer, Contact], { tenancy: 'single' }).map(metaOf);
  const [, customer, contact] = single;

  it('has no tenant column, no tenant filter and no UNIQUE (tenant_id, id)', () => {
    expect(Object.keys(customer?.properties ?? {})).not.toContain('tenantId');
    expect(Object.keys(customer?.filters ?? {})).toEqual(['softDelete']);
    expect(Object.keys(contact?.filters ?? {})).toEqual([]);
    expect(customer?.uniques.every((unique) => !unique.properties.includes('tenantId'))).toBe(true);
    expect(customer?.uniques.some((unique) => unique.properties.join() === 'id')).toBe(false);
  });

  it('relations are plain foreign keys, because there is no tenant to include', () => {
    expect(contact?.properties['customer']).toMatchObject({ kind: 'm:1', fieldName: 'customer_id' });
    expect(contact?.properties['customer']).not.toHaveProperty('referencedColumnNames');
  });

  it('a global entity may then reference a former tenant entity', () => {
    const Note = defineEntity({
      name: 'crm.Note',
      table: 'crm_notes',
      fields: { id: f.id(), customer: f.belongsTo(() => Customer) },
    });
    expect(() => compileEntities([User, Customer, Note], { tenancy: 'single' })).not.toThrow();
  });

  it('the default is shared-schema', () => {
    const [, shared] = compileEntities([User, Customer]).map(metaOf);
    expect(Object.keys(shared?.properties ?? {})).toContain('tenantId');
  });
});

describe('column names', () => {
  it('snake turns a property name into its column name', () => {
    expect(snake('createdAt')).toBe('created_at');
    expect(snake('deletedToken')).toBe('deleted_token');
  });
});
