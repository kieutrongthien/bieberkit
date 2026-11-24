/**
 * BieberKit
 *
 * @file        packages/admin-core/src/screens.test.ts
 * @description Tests of the generic screens over metadata: the columns, the fields of the form, the initial values, the body of a save and the permission of an action (UI-03, UI-15).
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
import { allows, bodyOf, columnsOf, formFieldsOf, initialValues, labelOf, listFields } from './screens.ts';
import type { MetaEntity, MetaField } from './types.ts';

const field = (key: string, extra: Partial<MetaField> = {}): MetaField => ({
  key,
  kind: 'string',
  widget: 'text',
  required: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  ...extra,
});

const ENTITY: MetaEntity = {
  name: 'notes.Note',
  path: '/api/v1/notes/notes',
  label: { en: 'Note', vi: 'Ghi chú' },
  operations: { list: true, get: true, create: true, update: true, delete: false },
  can: { read: true, create: true, update: false, delete: true },
  softDelete: false,
  tenant: false,
  list: ['title', 'ghost'],
  form: [],
  fields: [
    field('id', { readOnly: true }),
    field('title', { required: true, default: 'untitled' }),
    field('body'),
    field('secret', { pii: true }),
    field('createdAt', { readOnly: true }),
  ],
};

describe('UI-03 generic screens from the metadata', () => {
  it('names an entity in the language of the person, then in English, then by its name', () => {
    expect(labelOf(ENTITY, 'vi')).toBe('Ghi chú');
    expect(labelOf(ENTITY, 'zh')).toBe('Note');
    expect(labelOf({ ...ENTITY, label: {} }, 'en')).toBe('Note');
  });

  it('takes the columns of the list in the order that the entity gave, and skips a key that is not a field', () => {
    expect(columnsOf(ENTITY).map((column) => column.key)).toEqual(['title']);
  });

  it('shows every field but the private ones when the entity gave no list, and asks the API for those only, never for id and version, which it sends itself (UI-15)', () => {
    const bare = { ...ENTITY, list: [] };
    expect(columnsOf(bare).map((column) => column.key)).toEqual(['id', 'title', 'body', 'createdAt']);
    expect(listFields(ENTITY)).toEqual(['title']);
    expect(listFields({ ...ENTITY, list: ['id', 'title', 'version'] })).toEqual(['title']);
  });

  it('puts in the form the fields that a person fills in and none that the server fills in', () => {
    expect(formFieldsOf(ENTITY).map((item) => item.key)).toEqual(['title', 'body', 'secret']);
    expect(formFieldsOf({ ...ENTITY, form: ['body', 'id', 'title'] }).map((item) => item.key)).toEqual([
      'body',
      'title',
    ]);
  });

  it('starts a new form from the defaults and an edit from the row', () => {
    expect(initialValues(ENTITY)).toEqual({ title: 'untitled', body: undefined, secret: undefined });
    expect(initialValues(ENTITY, { id: '1', title: 'Hi', body: 'Text' })).toMatchObject({ title: 'Hi', body: 'Text' });
  });

  it('sends the fields that have a value, and clears an optional one with null only when it is an update', () => {
    const values = { title: 'Hi', body: '', secret: undefined };
    expect(bodyOf(ENTITY, values, false)).toEqual({ title: 'Hi' });
    expect(bodyOf(ENTITY, values, true)).toEqual({ title: 'Hi', body: null, secret: null });
    expect(bodyOf(ENTITY, { title: '' }, true)).not.toHaveProperty('title');
  });

  it('allows an action when the entity has it and the user may do it', () => {
    expect(allows(ENTITY, 'create')).toBe(true);
    expect(allows(ENTITY, 'update')).toBe(false);
    expect(allows(ENTITY, 'delete')).toBe(false);
  });
});
