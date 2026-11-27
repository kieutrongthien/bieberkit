/**
 * BieberKit
 *
 * @file        packages/admin-core/src/related.test.ts
 * @description Tests of the tabs of a detail screen: the child tables, what a new child starts with, and the history of a row (UI-03, UI-11).
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
import {
  historyLine,
  historyOf,
  historyQuery,
  prefillOf,
  readOnlyOf,
  relatedDefaults,
  relatedFilter,
  relatedOf,
} from './related.ts';
import type { Meta, MetaEntity, MetaField } from './types.ts';

const field = (key: string, kind: string, extra: Partial<MetaField> = {}): MetaField => ({
  key,
  kind,
  widget: 'text',
  required: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  ...extra,
});

const entity = (name: string, fields: MetaField[], extra: Partial<MetaEntity> = {}): MetaEntity => ({
  name,
  path: `/api/v1/${name.toLowerCase().replace('.', '/')}s`,
  label: { en: name },
  operations: { list: true, get: true, create: true, update: true, delete: true },
  can: { read: true, create: true, update: true, delete: true },
  softDelete: false,
  tenant: false,
  list: [],
  form: fields.filter((item) => !item.readOnly).map((item) => item.key),
  fields,
  ...extra,
});

const ACCOUNT = entity('crm.Account', [field('name', 'string'), field('number', 'sequence', { readOnly: true })]);
const TICKET = entity('crm.Ticket', [
  field('title', 'string'),
  field('accountId', 'belongsTo', {
    filterable: true,
    target: { entity: 'crm.Account', path: '/api/v1/crm/accounts' },
  }),
]);
const NOTE = entity('crm.Note', [
  field('ownerId', 'belongsTo', { filterable: false, target: { entity: 'crm.Account', path: '/x' } }),
]);
const HIDDEN = entity(
  'crm.Hidden',
  [field('accountId', 'belongsTo', { filterable: true, target: { entity: 'crm.Account', path: '/x' } })],
  {
    can: { read: false, create: false, update: false, delete: false },
  },
);
const META: Meta = { schemaVersion: 1, entities: [ACCOUNT, TICKET, NOTE, HIDDEN], menu: [], permissions: [] };

describe('UI-11 the child tables of a detail screen', () => {
  it('UI-11 are the entities that the user may list and that point at the row by a relation that the API can filter by', () => {
    const related = relatedOf(META, ACCOUNT);
    expect(related.map((item) => [item.entity.name, item.via.key])).toEqual([['crm.Ticket', 'accountId']]);
  });

  it('UI-11 an entity is not its own child table, and an entity that nothing points at has none', () => {
    const tree = entity('crm.Node', [
      field('parentId', 'belongsTo', { filterable: true, target: { entity: 'crm.Node', path: '/n' } }),
    ]);
    expect(relatedOf({ ...META, entities: [tree] }, tree)).toEqual([]);
    expect(relatedOf(META, TICKET)).toEqual([]);
  });

  it('UI-11 finds the rows of a row by the filter of the relation, and a new child starts pointing at it', () => {
    const [related] = relatedOf(META, ACCOUNT);
    if (related === undefined) throw new Error('No related entity.');
    expect(relatedFilter(related, 'a1')).toEqual({ field: 'accountId', op: 'eq', value: 'a1' });
    expect(relatedDefaults(related, 'a1')).toEqual({ accountId: 'a1' });
  });

  it('UI-11 a new row takes from the address only the fields of its form, and only texts', () => {
    const form = [field('title', 'string'), field('accountId', 'belongsTo')];
    expect(prefillOf(form, { accountId: 'a1', title: 't', other: 'x' })).toEqual({ accountId: 'a1', title: 't' });
    expect(prefillOf(form, { accountId: ['a'], title: '' })).toEqual({});
    expect(prefillOf(form, {})).toEqual({});
  });
});

describe('UI-03 the history of a row', () => {
  it('UI-03 asks the audit log for the entity and the record, newest first, with a page size', () => {
    expect(historyQuery('crm.Account', 'a 1')).toBe('?entity=crm.Account&recordId=a%201&pageSize=20');
  });

  it('UI-03 reads the entries of the answer, with the name of the actor, and the fields that changed', () => {
    const entries = historyOf({
      data: [
        {
          id: 'e1',
          at: '2026-03-05T10:00:00.000Z',
          action: 'crm.Account.update',
          actor: { name: 'Ann', email: 'a@x.co' },
          data: { fields: ['name', 'note'] },
        },
        { id: 'e2', at: '2026-03-04T10:00:00.000Z', action: 'crm.Account.create', actor: { email: 'b@x.co' } },
        { id: 'e3', at: '2026-03-03T10:00:00.000Z', action: 'crm.Account.delete', actor: null },
        { nothing: true },
      ],
    });
    expect(entries.map((entry) => [entry.id, entry.who, historyLine(entry)])).toEqual([
      ['e1', 'Ann', 'update (name, note)'],
      ['e2', 'b@x.co', 'create'],
      ['e3', '-', 'delete'],
    ]);
    expect(historyOf(undefined)).toEqual([]);
    expect(historyOf({ data: 'x' })).toEqual([]);
  });
});

describe('UI-11 the fields that the form does not edit', () => {
  it('UI-11 are shown beside the form with their values: the number that the server gives, the state', () => {
    expect(readOnlyOf(ACCOUNT, { id: 'a1', name: 'Acme', number: 'ACC-0001' })).toEqual([
      { key: 'number', value: 'ACC-0001' },
    ]);
  });
});
