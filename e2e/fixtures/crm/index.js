/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/index.js
 * @description A fixture plugin of the browser tests: accounts and tickets, with a choice, a number, a date, a flag, a relation and a state machine, so that the generic screens are tried against every control (spec section 21).
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

import { definePlugin } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';
import { z } from 'zod';

export const Account = defineEntity({
  name: 'crm.Account',
  table: 'crm_accounts',
  fields: {
    id: f.id(),
    code: f.string({ min: 1, max: 20 }).unique(),
    name: f.string({ min: 1, max: 100 }).index(),
    tier: f.oneOf(['basic', 'gold', 'vip']).default('basic').index(),
    visits: f.int({ min: 0 }).default(0).index(),
    active: f.boolean().default(true).index(),
    since: f.date().optional().index(),
    note: f.text({ max: 500 }).optional(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'crm.account.read',
    create: 'crm.account.write',
    update: 'crm.account.write',
    delete: 'crm.account.write',
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
  label: { en: 'Account', vi: 'Tài khoản', zh: '账户' },
  admin: { title: 'name', list: ['code', 'name', 'tier', 'visits', 'active'] },
});

export const Ticket = defineEntity({
  name: 'crm.Ticket',
  table: 'crm_tickets',
  fields: {
    id: f.id(),
    title: f.string({ min: 1, max: 200 }).index(),
    account: f
      .belongsTo(() => Account)
      .optional()
      .index(),
    status: f.state({
      initial: 'open',
      transitions: {
        close: {
          from: ['open'],
          to: 'closed',
          permission: 'crm.ticket.close',
          input: z.object({ reason: z.string().min(3) }),
        },
        reopen: { from: ['closed'], to: 'open', permission: 'crm.ticket.close' },
      },
    }),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'crm.ticket.read',
    create: 'crm.ticket.write',
    update: 'crm.ticket.write',
    delete: 'crm.ticket.write',
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
  label: { en: 'Ticket', vi: 'Phiếu', zh: '工单' },
  admin: { title: 'title', list: ['title', 'account', 'status'] },
});

export default definePlugin({
  name: '@bieberkit/plugin-crm',
  version: '0.0.0',
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['crm.account.read', 'crm.account.write', 'crm.ticket.read', 'crm.ticket.write', 'crm.ticket.close'],
  entities: [Account, Ticket],
});
