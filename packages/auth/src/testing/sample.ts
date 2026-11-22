/**
 * BieberKit
 *
 * @file        packages/auth/src/testing/sample.ts
 * @description The sample entity and the scoped permissions of the tests of @bieberkit/auth: a Deal with a masked field, a state and conditions (section 14.2).
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

import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import type { ScopedPermission } from '../ability.ts';

/** A deal of a tenant. `margin` is masked, `assignee` is what the conditions look at. */
export const Deal: EntityDef<'crm.Deal'> = defineEntity({
  name: 'crm.Deal',
  table: 'crm_deals',
  tenant: true,
  softDelete: true,
  fields: {
    id: f.id(),
    code: f.string({ max: 20 }).unique(),
    title: f.string({ min: 1, max: 100 }),
    stage: f.oneOf(['lead', 'won', 'lost']).default('lead').index().aggregatable(),
    amount: f.int({ min: 0 }).default(0).index(),
    assignee: f.string({ max: 36 }).optional().index(),
    margin: f.int().optional(),
    status: f.state({
      initial: 'open',
      transitions: { close: { from: ['open'], to: 'closed', permission: 'crm.deal.close' } },
    }),
  },
  permissions: {
    read: 'crm.deal.read',
    create: 'crm.deal.create',
    update: 'crm.deal.update',
    delete: 'crm.deal.delete',
    fields: { margin: { read: 'crm.deal.read-margin', update: 'crm.deal.edit-margin' } },
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
});

/** An entity that declares no permissions: the names are the defaults. */
export const Plain: EntityDef<'crm.Plain'> = defineEntity({
  name: 'crm.Plain',
  table: 'crm_plain',
  fields: { id: f.id(), title: f.string({ max: 20 }) },
  api: { list: true },
});

/** The permissions that carry a condition. The last three are wrong on purpose, and must fail closed. */
export const SCOPED: Readonly<Record<string, ScopedPermission>> = {
  'crm.deal.read-own': { subject: 'crm.Deal', action: 'read', when: (user) => ({ assignee: user.id }) },
  'crm.deal.update-own': { subject: 'crm.Deal', action: 'update', when: (user) => ({ assignee: user.id }) },
  'crm.deal.delete-own': { subject: 'crm.Deal', action: 'delete', when: (user) => ({ assignee: user.id }) },
  'crm.deal.create-own': { subject: 'crm.Deal', action: 'create', when: (user) => ({ assignee: user.id }) },
  'crm.deal.read-big': { subject: 'crm.Deal', action: 'read', when: () => ({ amount: { $gte: 1000 } }) },
  'crm.deal.read-open': {
    subject: 'crm.Deal',
    action: 'read',
    when: () => ({ stage: { $in: ['lead'] }, amount: { $ne: null } }),
  },
  'crm.deal.read-regex': { subject: 'crm.Deal', action: 'read', when: () => ({ title: { $regex: '^a' } }) },
  'crm.deal.read-dotted': { subject: 'crm.Deal', action: 'read', when: () => ({ 'owner.id': 'x' }) },
  'crm.deal.read-unknown': { subject: 'crm.Deal', action: 'read', when: () => ({ nope: 1 }) },
};
