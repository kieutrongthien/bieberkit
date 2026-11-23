/**
 * BieberKit
 *
 * @file        packages/data/src/orm/audit-pii.dialects.test.ts
 * @description Tests of the audit entry of an entity that holds personal data: the values of its pii fields are not written (PDP-06, SEC-09).
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
import { defineEntity } from '../schema/define-entity.ts';
import { f } from '../schema/fields.ts';
import { describeDialects } from '../testing/dialects.ts';
import { recordAudit } from './audit.ts';
import { runInUnitOfWork } from './connect.ts';
import { AuditLog } from './framework.ts';

const Customer = defineEntity({
  name: 'crm.Customer',
  table: 'crm_customers',
  fields: {
    id: f.id(),
    code: f.string({ max: 10 }),
    email: f.email().pii(),
    taxId: f.string({ max: 20 }).optional().encrypted().pii(),
  },
});

describeDialects('PDP-06 audit data and personal data', ({ open }) => {
  it('PDP-06 writes the entry with the values of pii fields replaced, when the entity is named', async () => {
    const db = await open([]);
    await runInUnitOfWork(db, async (em) => {
      recordAudit(em, {
        action: 'crm.customer.update',
        entity: 'crm.Customer',
        data: { before: { email: 'a@b.vn', code: 'C1' }, after: { email: 'c@d.vn', code: 'C1', taxId: '123' } },
        piiOf: Customer,
      });
      await em.flush();
    });
    const rows = await runInUnitOfWork(db, (em) => em.find(AuditLog, {}));
    const text = String(rows[0]?.data);
    expect(JSON.parse(text)).toEqual({
      before: { email: '[redacted]', code: 'C1' },
      after: { email: '[redacted]', code: 'C1', taxId: '[redacted]' },
    });
    expect(text).not.toContain('a@b.vn');
    expect(text).not.toContain('123');
  });

  it('PDP-06 writes the data as it is when no entity is named, as before', async () => {
    const db = await open([]);
    await runInUnitOfWork(db, async (em) => {
      recordAudit(em, { action: 'x.y.z', data: { email: 'a@b.vn' } });
      await em.flush();
    });
    const rows = await runInUnitOfWork(db, (em) => em.find(AuditLog, {}));
    expect(JSON.parse(String(rows[0]?.data))).toEqual({ email: 'a@b.vn' });
  });
});
