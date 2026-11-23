/**
 * BieberKit
 *
 * @file        packages/data/src/schema/pii.test.ts
 * @description Tests of the inventory of personal data and of the redaction of its values (PDP-01, SEC-09, PDP-06).
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
import { defineEntity } from './define-entity.ts';
import { f } from './fields.ts';
import { piiFields, redactPii } from './pii.ts';

const Owner = defineEntity({
  name: 'crm.Owner',
  table: 'crm_owners',
  fields: { id: f.id(), name: f.string({ max: 20 }) },
});
const Customer = defineEntity({
  name: 'crm.Customer',
  table: 'crm_customers',
  fields: {
    id: f.id(),
    code: f.string({ max: 10 }),
    email: f.email().pii(),
    taxId: f.string({ max: 20 }).optional().encrypted().pii(),
    note: f.text().optional().encrypted(),
    birthday: f.date().optional().pii(),
    owner: f.belongsTo(() => Owner).pii(),
  },
});
const Plain = defineEntity({
  name: 'crm.Plain',
  table: 'crm_plain',
  fields: { id: f.id(), title: f.string({ max: 5 }) },
});

describe('PDP-01 the inventory of personal data', () => {
  it('PDP-01 lists each field that holds personal data, with its entity, the key of the API and whether it is encrypted', () => {
    expect(piiFields([Customer, Plain])).toEqual([
      { entity: 'crm.Customer', field: 'email', key: 'email', encrypted: false },
      { entity: 'crm.Customer', field: 'taxId', key: 'taxId', encrypted: true },
      { entity: 'crm.Customer', field: 'birthday', key: 'birthday', encrypted: false },
      { entity: 'crm.Customer', field: 'owner', key: 'ownerId', encrypted: false },
    ]);
  });

  it('PDP-01 is in the same order whatever the order of the entities, and empty for entities with no personal data', () => {
    expect(piiFields([Plain, Customer])).toEqual(piiFields([Customer, Plain]));
    expect(piiFields([Plain])).toEqual([]);
  });

  it('SEC-08 an encrypted field that is not personal data is not in the inventory', () => {
    expect(piiFields([Customer]).some((item) => item.field === 'note')).toBe(false);
  });
});

describe('PDP-06 the redaction of personal data', () => {
  it('PDP-06 replaces the value of a field of personal data, by its name and by its key of the API, and keeps the rest', () => {
    const out = redactPii(Customer, {
      code: 'C1',
      email: 'a@b.vn',
      taxId: '123',
      ownerId: 'u-1',
      owner: 'u-1',
      note: 'kept',
      fields: ['email'],
    });
    expect(out).toEqual({
      code: 'C1',
      email: '[redacted]',
      taxId: '[redacted]',
      ownerId: '[redacted]',
      owner: '[redacted]',
      note: 'kept',
      fields: ['email'],
    });
  });

  it('PDP-06 leaves empty values empty, so a field that was not set is not a field that was hidden', () => {
    expect(redactPii(Customer, { email: null, taxId: undefined, birthday: '' })).toEqual({
      email: null,
      taxId: undefined,
      birthday: '[redacted]',
    });
  });

  it('PDP-06 goes into nested data and lists, and does not change what it was given', () => {
    const input = { before: { email: 'a@b.vn' }, rows: [{ taxId: '1' }, { code: 'x' }], count: 2 };
    const out = redactPii(Customer, input);
    expect(out).toEqual({ before: { email: '[redacted]' }, rows: [{ taxId: '[redacted]' }, { code: 'x' }], count: 2 });
    expect(input.before.email).toBe('a@b.vn');
  });

  it('PDP-06 passes data that is not an object through as it is', () => {
    expect(redactPii(Customer, 'text')).toBe('text');
    expect(redactPii(Customer, null)).toBeNull();
    expect(redactPii(Customer, [1, 2])).toEqual([1, 2]);
  });
});
