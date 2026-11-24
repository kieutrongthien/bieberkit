/**
 * BieberKit
 *
 * @file        packages/http/src/path.test.ts
 * @description Tests of the address of an entity: it comes from the module and the table, and the prefix bk_ of the tables of the framework is not part of it (DATA-28, section 13.1).
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
import { defineEntity, f } from '@bieberkit/data';
import { pathOf } from './entity-routes.ts';

const entity = (name: `${string}.${string}`, table: string) => defineEntity({ name, table, fields: { id: f.id() } });

describe('13.1 the address of an entity', () => {
  it('is the module and the table without the prefix of the module', () => {
    expect(pathOf(entity('crm.Customer', 'crm_customers'))).toBe('/api/v1/crm/customers');
    expect(pathOf(entity('crm.SalesOrder', 'crm_sales_orders'))).toBe('/api/v1/crm/sales-orders');
  });

  it('DATA-28 does not show the prefix bk_ of a table of the framework or of a plugin', () => {
    expect(pathOf(entity('settings.Setting', 'bk_settings'))).toBe('/api/v1/settings/settings');
    expect(pathOf(entity('media.Media', 'bk_media'))).toBe('/api/v1/media/media');
    // A table that carries the module after the prefix gives the same address as before the rename.
    expect(pathOf(entity('crm.Deal', 'bk_crm_deals'))).toBe('/api/v1/crm/deals');
  });
});
