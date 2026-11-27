/**
 * BieberKit
 *
 * @file        packages/testing/src/inline.dialects.test.ts
 * @description The inline collections of a record on the three dialects: the lines of a tenant record are saved, changed and removed with it, and a rollback leaves no line behind (MOD-09, MOD-16).
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

import { expect, it } from 'vitest';
import { defineModule } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { createTestApp, describeDialects } from './index.ts';

const Line: EntityDef<'shop.Line'> = defineEntity({
  name: 'shop.Line',
  table: 'shop_lines',
  tenant: true,
  fields: { id: f.id(), order: f.belongsTo(() => Order).index(), text: f.string({ min: 1, max: 40 }) },
});
const Order: EntityDef<'shop.Order'> = defineEntity({
  name: 'shop.Order',
  table: 'shop_orders',
  tenant: true,
  fields: { id: f.id(), code: f.string({ max: 20 }).unique(), lines: f.hasMany(() => Line).inline() },
  api: { list: true, get: true, create: true, update: true, delete: true },
});
const shop = defineModule({ name: 'shop', entities: [Order, Line] });
const BASE = '/api/v1/shop/orders';

interface Answer {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

const record = (answer: Answer): { id: string; version: number; lines: { id: string; text: string }[] } => {
  const data = Object(answer.body['data']);
  return { id: String(data.id), version: Number(data.version), lines: Array.isArray(data.lines) ? data.lines : [] };
};

describeDialects('MOD-09 the lines of a record on a dialect', ({ open }) => {
  it('MOD-09 are made, changed and removed with the record, and read back in order', { timeout: 60_000 }, async () => {
    const app = await createTestApp({
      modules: [shop],
      open,
      roles: {
        writer: [
          'shop.order.read',
          'shop.order.create',
          'shop.order.update',
          'shop.line.create',
          'shop.line.update',
          'shop.line.delete',
        ],
        noRemove: ['shop.order.read', 'shop.order.create', 'shop.order.update', 'shop.line.create', 'shop.line.update'],
      },
    });
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const made = record(await writer.post(BASE, { code: 'O-1', lines: [{ text: 'one' }, { text: 'two' }] }));
    expect(made.lines.map((line) => line.text)).toEqual(['one', 'two']);

    const [one] = made.lines;
    const changed = record(
      await writer.patch(
        `${BASE}/${made.id}`,
        { lines: [{ id: one?.id, text: 'uno' }, { text: 'three' }] },
        made.version,
      ),
    );
    expect(changed.lines.map((line) => line.text).toSorted()).toEqual(['three', 'uno']);
    expect(changed.version).toBe(2);

    const read = record(await writer.get(`${BASE}/${made.id}`));
    expect(read.lines.map((line) => line.text).toSorted()).toEqual(['three', 'uno']);

    // A caller who may not remove lines cannot leave one out, and nothing of the write stays (one transaction).
    const careful = await app.actingAs(app.newUser(), ['noRemove']);
    const refused = await careful.patch(`${BASE}/${made.id}`, { lines: [] }, changed.version);
    expect(refused.status).toBe(403);
    expect(record(await writer.get(`${BASE}/${made.id}`)).lines).toHaveLength(2);
    await app.close();
  });
});
