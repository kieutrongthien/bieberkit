/**
 * BieberKit
 *
 * @file        packages/testing/src/fixtures.ts
 * @description A small CRM module for the tests of this package: entities with the kinds of field a factory must fill, a route, a job and a condition.
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
import { defineModule } from '@bieberkit/core';
import type { ModuleDef } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { defineRoute } from '@bieberkit/http';
import type { RouteDef } from '@bieberkit/http';
import { defineJob } from '@bieberkit/queue';
import type { JobDef } from '@bieberkit/queue';

/** A person, with no tenant: an account points at it, so a factory must make one first. */
export const Person: EntityDef<'crm.Person'> = defineEntity({
  name: 'crm.Person',
  table: 'crm_people',
  fields: { id: f.id(), name: f.string({ min: 1, max: 50 }), email: f.email().unique() },
  api: { list: true, get: true, create: true },
});

/** An account of a tenant, with one field of most kinds. */
export const Account: EntityDef<'crm.Account'> = defineEntity({
  name: 'crm.Account',
  table: 'crm_accounts',
  tenant: true,
  fields: {
    id: f.id(),
    code: f.string({ min: 3, max: 8 }).unique(),
    name: f.string({ min: 1, max: 100 }),
    tier: f.oneOf(['basic', 'gold', 'vip']),
    visits: f.int({ min: 5, max: 9 }),
    active: f.boolean(),
    since: f.date(),
    seen: f.dateTime(),
    credit: f.decimal({ precision: 12, scale: 2 }),
    balance: f.money({ currency: 'VND' }),
    dollars: f.money({ currency: 'USD' }),
    note: f.text({ max: 40 }).optional(),
    rank: f.int({ min: 1 }).default(1),
    number: f.sequence({ pattern: 'ACC-{seq:4}' }),
    owner: f.belongsTo(() => Person),
    backup: f.belongsTo(() => Person).optional(),
  },
  permissions: {
    read: 'crm.account.read',
    create: 'crm.account.create',
    update: 'crm.account.update',
    delete: 'crm.account.delete',
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
});

/** An entity with a field that holds a schema of the project, which a sample cannot fill. */
export const Tagged: EntityDef<'crm.Tagged'> = defineEntity({
  name: 'crm.Tagged',
  table: 'crm_tagged',
  fields: {
    id: f.id(),
    label: f.custom({
      column: { type: 'varchar', length: 20 },
      jsonSchema: { type: 'string', maxLength: 20 },
      zod: z.string(),
      tsType: 'string',
    }),
  },
  api: { list: true, create: true },
});

export const touched: string[] = [];

const touchInput = z.object({ code: z.string() });

export const touchJob: JobDef<{ code: string }> = defineJob({
  name: 'crm.account.touch',
  input: touchInput,
  handler: (input: { code: string }) => void touched.push(input.code),
});

export const pingRoute: RouteDef = defineRoute({
  method: 'GET',
  url: '/api/v1/crm/ping',
  public: true,
  schema: { response: { 200: { type: 'object', properties: { pong: { type: 'boolean' } }, required: ['pong'] } } },
  handler: () => ({ pong: true }),
});

export const crm: ModuleDef = defineModule({
  name: 'crm',
  entities: [Person, Account, Tagged],
  routes: [pingRoute],
  jobs: [touchJob],
  scopedPermissions: {
    'crm.account.read-big': { subject: 'crm.Account', action: 'read', when: () => ({ visits: { $gte: 8 } }) },
  },
});
