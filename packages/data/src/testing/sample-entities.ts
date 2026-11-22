/**
 * BieberKit
 *
 * @file        packages/data/src/testing/sample-entities.ts
 * @description Entities shared by the tests of the field DSL, the schema compilers and the contract suite.
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

import * as z from 'zod/mini';
import { defineEntity, f } from '../schema/index.ts';
import type { EntityDef } from '../schema/index.ts';

export const User: EntityDef<'users.User'> = defineEntity({
  name: 'users.User',
  table: 'users',
  fields: {
    id: f.id(),
    name: f.string({ min: 1, max: 100 }),
  },
});

/** The entity of spec 10.1, with one field of every kind that the schemas must handle. */
export const Customer: EntityDef<'crm.Customer'> = defineEntity({
  name: 'crm.Customer',
  table: 'crm_customers',
  tenant: true,
  softDelete: true,
  fields: {
    id: f.id(),
    code: f.string({ max: 32 }).unique(),
    name: f.string({ min: 1, max: 200, compare: 'ci_ai' }).searchable().index(),
    email: f.email().optional().unique(),
    tier: f.oneOf(['standard', 'gold', 'vip']).default('standard').index().aggregatable(),
    credit: f.decimal({ precision: 12, scale: 2 }).optional().aggregatable(),
    balance: f.money({ currency: 'VND' }).optional(),
    note: f.text({ max: 1000 }).optional(),
    active: f.boolean().default(true).aggregatable(),
    since: f.date().optional(),
    lastSeen: f.dateTime().optional(),
    visits: f.int({ min: 0 }).default(0).aggregatable(),
    number: f.sequence({ pattern: 'CUS-{seq:5}' }),
    status: f.state({
      initial: 'new',
      transitions: { qualify: { from: ['new'], to: 'qualified', permission: 'crm.customer.qualify' } },
    }),
    score: f.int().computed((row) => Number(row['visits'] ?? 0) * 2),
    owner: f.belongsTo(() => User).aggregatable(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'crm.customer.read',
    create: 'crm.customer.create',
    update: 'crm.customer.update',
    delete: 'crm.customer.delete',
    fields: { email: { read: 'crm.customer.read-pii' } },
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
  admin: { title: 'name', list: ['code', 'name', 'tier', 'owner'], icon: 'users' },
  label: { en: 'Customer', vi: 'Khách hàng' },
});

/** An entity with a custom field kind, whose `zod` is a schema value (SCH-07). */
export const Asset: EntityDef<'inventory.Asset'> = defineEntity({
  name: 'inventory.Asset',
  table: 'inventory_assets',
  fields: {
    id: f.id(),
    tag: f.custom({
      column: { type: 'varchar', length: 8 },
      jsonSchema: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
      zod: z.string().check(z.regex(/^[A-Z]{3}-\d{4}$/)),
      tsType: 'string',
    }),
    label: f.string({ max: 50 }).optional(),
  },
});

/** A tenant entity that points at another one, so the composite foreign key `(tenant_id, customer_id)` is exercised (DATA-20). */
export const Contact: EntityDef<'crm.Contact'> = defineEntity({
  name: 'crm.Contact',
  table: 'crm_contacts',
  tenant: true,
  fields: {
    id: f.id(),
    fullName: f.string({ min: 1, max: 100, compare: 'ci_ai' }).index(),
    customer: f.belongsTo(() => Customer),
  },
});

/** An entity with localized fields, so the translation table is exercised (DATA-17). */
export const Page: EntityDef<'cms.Page'> = defineEntity({
  name: 'cms.Page',
  table: 'cms_pages',
  tenant: true,
  fields: {
    id: f.id(),
    slug: f.string({ max: 100 }).unique(),
    title: f.string({ max: 200 }).localized(),
    body: f.text({ max: 5000 }).optional().localized(),
  },
});
