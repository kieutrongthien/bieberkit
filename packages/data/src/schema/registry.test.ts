/**
 * BieberKit
 *
 * @file        packages/data/src/schema/registry.test.ts
 * @description Tests for the generated EntityRegistry types and the Row, CreateInput and UpdateInput helpers (SCH-04, ADR 0009).
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
import { Asset, Customer, User } from '../testing/sample-entities.ts';
import { defineEntity } from './define-entity.ts';
import { f } from './fields.ts';
import { generateRegistrySource } from './registry.ts';
import type { CreateInput, Row, UpdateInput } from './registry.ts';

const HEADER = '/* generated header */\n';

const Thing = defineEntity({
  name: 'test.Thing',
  table: 'test_things',
  softDelete: true,
  fields: {
    id: f.id(),
    name: f.string({ max: 10 }),
    nick: f.string({ max: 10 }).optional(),
    kind: f.oneOf(['a', 'b']).default('a'),
    price: f.money({ currency: 'USD' }),
    total: f.decimal({ precision: 6, scale: 2 }).optional(),
    count: f.int().default(0),
    owner: f.belongsTo(() => User),
    createdAt: f.createdAt(),
  },
});

const GOLDEN = `${HEADER}declare module '@bieberkit/data' {
  interface EntityRegistry {
    'test.Thing': {
      row: {
        id: string;
        version: number;
        createdAt: string;
        updatedAt: string;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: string | null;
        name: string;
        nick: string | null;
        kind: 'a' | 'b';
        price: { amount: string; currency: 'USD' };
        total: string | null;
        count: number;
        ownerId: string;
      };
      create: {
        name: string;
        nick?: string | null;
        kind?: 'a' | 'b';
        price: { amount: string; currency?: 'USD' };
        total?: string | null;
        count?: number;
        ownerId: string;
      };
      update: {
        name?: string;
        nick?: string | null;
        kind?: 'a' | 'b';
        price?: { amount: string; currency?: 'USD' };
        total?: string | null;
        count?: number;
        ownerId?: string;
      };
    };
  }
}

export {};
`;

describe('SCH-04 generateRegistrySource', () => {
  it('writes the row, create and update types of an entity exactly as the golden text says', () => {
    expect(generateRegistrySource([Thing], { header: HEADER })).toBe(GOLDEN);
  });

  it('starts with the header it was given, so the caller marks the file @generated (HDR-05)', () => {
    expect(generateRegistrySource([Thing], { header: HEADER }).startsWith(HEADER)).toBe(true);
  });

  it('is deterministic, and sorts the entities by name, whatever order they come in', () => {
    const forward = generateRegistrySource([Customer, User, Asset], { header: HEADER });
    expect(generateRegistrySource([Asset, User, Customer], { header: HEADER })).toBe(forward);
    const names = [...forward.matchAll(/^ {4}'([^']+)': \{$/gm)].map((match) => match[1]);
    expect(names).toEqual(['crm.Customer', 'inventory.Asset', 'users.User']);
  });

  it('maps every kind to the type of its API shape', () => {
    const source = generateRegistrySource([Customer], { header: HEADER });
    for (const line of [
      "tier: 'standard' | 'gold' | 'vip';",
      'credit: string | null;',
      "balance: { amount: string; currency: 'VND' } | null;",
      'note: string | null;',
      'active: boolean;',
      'since: string | null;',
      'lastSeen: string | null;',
      'visits: number;',
      'number: string;',
      "status: 'new' | 'qualified';",
      'score: number;',
      'ownerId: string;',
    ]) {
      expect(source).toContain(line);
    }
  });

  it('a custom field uses its tsType', () => {
    const source = generateRegistrySource([Asset], { header: HEADER });
    expect(source).toContain('tag: string;');
  });

  it('keeps the server fields out of create and update', () => {
    const source = generateRegistrySource([Customer], { header: HEADER });
    const create = source.slice(source.indexOf('create: {'), source.indexOf('update: {'));
    for (const name of ['id:', 'version:', 'number:', 'status:', 'score:', 'tenantId', 'createdAt'])
      expect(create).not.toContain(name);
  });

  it('can name another module to augment', () => {
    expect(generateRegistrySource([Thing], { header: HEADER, module: '@acme/data' })).toContain(
      "declare module '@acme/data' {",
    );
  });

  it('an empty list still gives a valid file', () => {
    const source = generateRegistrySource([], { header: HEADER });
    expect(source).toContain('interface EntityRegistry {');
    expect(source).toContain('export {};');
  });

  it('quotes a name or a value that holds a quote, so the output is always valid TypeScript', () => {
    const odd = defineEntity({
      name: 'test.Odd',
      table: 'test_odd',
      fields: { id: f.id(), mood: f.oneOf(["it's", 'plain']) },
    });
    expect(generateRegistrySource([odd], { header: HEADER })).toContain("mood: 'it\\'s' | 'plain';");
  });
});

// The same text as the golden above, written by hand, so that the type helpers are tested against what the generator writes.
declare module '../index.ts' {
  interface EntityRegistry {
    'test.Thing': {
      row: {
        id: string;
        version: number;
        createdAt: string;
        updatedAt: string;
        createdBy: string | null;
        updatedBy: string | null;
        deletedAt: string | null;
        name: string;
        nick: string | null;
        kind: 'a' | 'b';
        price: { amount: string; currency: 'USD' };
        total: string | null;
        count: number;
        ownerId: string;
      };
      create: {
        name: string;
        nick?: string | null;
        kind?: 'a' | 'b';
        price: { amount: string; currency?: 'USD' };
        total?: string | null;
        count?: number;
        ownerId: string;
      };
      update: {
        name?: string;
        nick?: string | null;
        kind?: 'a' | 'b';
        price?: { amount: string; currency?: 'USD' };
        total?: string | null;
        count?: number;
        ownerId?: string;
      };
    };
  }
}

// @ts-expect-error nothing is registered under this name
const probeMissing = (_value: Row<'nope.Nope'>): void => undefined;

describe('SCH-04 Row, CreateInput and UpdateInput read from the registry', () => {
  const owner = '0190f6b2-7c4e-7000-8000-0123456789ab';

  it('Row is the read shape of the API', () => {
    const row: Row<'test.Thing'> = {
      id: owner,
      version: 1,
      createdAt: '2026-11-22T10:00:00Z',
      updatedAt: '2026-11-22T10:00:00Z',
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      name: 'x',
      nick: null,
      kind: 'a',
      price: { amount: '1.00', currency: 'USD' },
      total: null,
      count: 0,
      ownerId: owner,
    };
    expect(row.kind).toBe('a');
    // @ts-expect-error kind is a union of the listed values
    const wrongKind: Row<'test.Thing'> = { ...row, kind: 'c' };
    // @ts-expect-error a required field of the row cannot be left out
    const missing: Row<'test.Thing'> = { id: owner };
    expect([wrongKind, missing]).toHaveLength(2);
  });

  it('CreateInput needs the required fields, and accepts null or nothing for an optional one', () => {
    const input: CreateInput<'test.Thing'> = { name: 'x', price: { amount: '1.00' }, ownerId: owner };
    const withNull: CreateInput<'test.Thing'> = { ...input, nick: null, total: null };
    // @ts-expect-error name is required
    const noName: CreateInput<'test.Thing'> = { price: { amount: '1.00' }, ownerId: owner };
    // @ts-expect-error the server writes the id
    const withId: CreateInput<'test.Thing'> = { ...input, id: owner };
    expect([withNull, noName, withId]).toHaveLength(3);
  });

  it('UpdateInput makes every field optional and refuses a field that does not exist', () => {
    const empty: UpdateInput<'test.Thing'> = {};
    const some: UpdateInput<'test.Thing'> = { name: 'y', nick: null };
    // @ts-expect-error not a field of this entity
    const unknown: UpdateInput<'test.Thing'> = { nope: 1 };
    expect([empty, some, unknown]).toHaveLength(3);
  });

  it('refuses an entity that is not in the registry', () => {
    expect(probeMissing).toBeTypeOf('function');
  });
});
