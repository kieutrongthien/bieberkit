/**
 * BieberKit
 *
 * @file        packages/admin-core/src/inline.test.ts
 * @description Tests of the lines of a record that its form edits (MOD-09, UI-11).
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
import { editableInline, initialLines, lineProblems, linesBody, linesChanged, newLine } from './inline.ts';
import type { MetaEntity, MetaField, MetaInline } from './types.ts';

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

const NOTES: MetaInline = {
  name: 'notes',
  entity: 'crm.AccountNote',
  label: { en: 'Note' },
  fields: [
    field('text', { required: true, validation: { type: 'string', maxLength: 5 } }),
    field('position', { kind: 'int', default: 0 }),
  ],
  form: ['text', 'position'],
  can: { create: true, update: true, delete: true },
};

const ENTITY: MetaEntity = {
  name: 'crm.Account',
  path: '/api/v1/crm/accounts',
  label: { en: 'Account' },
  operations: { list: true, get: true, create: true, update: true, delete: true },
  can: { read: true, create: true, update: true, delete: true },
  softDelete: false,
  tenant: false,
  list: [],
  form: [],
  fields: [],
  inline: [NOTES],
};

describe('MOD-09 the lines that a form starts from', () => {
  it('MOD-09 are the lines of the row with their ids, and none for a new record or a row that has none', () => {
    const row = { id: 'a', notes: [{ id: 'n1', text: 'x', accountId: 'a' }, 'junk', null] };
    expect(initialLines(ENTITY, row)).toEqual({ notes: [{ id: 'n1', text: 'x', accountId: 'a' }] });
    expect(initialLines(ENTITY)).toEqual({ notes: [] });
    expect(initialLines(ENTITY, { id: 'a' })).toEqual({ notes: [] });
    expect(initialLines((({ inline: _inline, ...rest }) => rest)(ENTITY))).toEqual({});
  });

  it('MOD-09 a new line starts with the defaults of its fields', () => {
    expect(newLine(NOTES)).toEqual({ position: 0 });
  });
});

describe('MOD-09 the lines in the body of a save', () => {
  it('MOD-09 carry the id of a line that exists, the fields that have a value, and null for a field of an old line that was cleared', () => {
    const body = linesBody(
      ENTITY,
      {
        notes: [
          { id: 'n1', text: 'a', position: '' },
          { text: 'b', position: 3 },
          { text: 'c', position: undefined },
        ],
      },
      new Set(['notes']),
    );
    expect(body).toEqual({
      notes: [{ id: 'n1', text: 'a', position: null }, { text: 'b', position: 3 }, { text: 'c' }],
    });
  });

  it('MOD-09 a collection that was not changed is not sent, so that a save of the other fields leaves the lines alone', () => {
    expect(linesBody(ENTITY, { notes: [{ id: 'n1', text: 'a' }] }, new Set())).toEqual({});
  });

  it('MOD-09 a collection that the user may not change at all is never sent', () => {
    const closed = { ...ENTITY, inline: [{ ...NOTES, can: { create: false, update: false, delete: false } }] };
    expect(editableInline(closed)).toEqual([]);
    expect(linesBody(closed, { notes: [{ text: 'a' }] }, new Set(['notes']))).toEqual({});
  });
});

describe('MOD-09 what is wrong with a line, and whether the lines changed', () => {
  it('MOD-09 names the field and the problem, in the order of the fields', () => {
    expect(lineProblems(NOTES, { text: '' }).map((item) => [item.key, item.problem.code])).toEqual([
      ['text', 'required'],
    ]);
    expect(lineProblems(NOTES, { text: 'too long' }).map((item) => [item.key, item.problem.code])).toEqual([
      ['text', 'tooLong'],
    ]);
    expect(lineProblems(NOTES, { text: 'ok' })).toEqual([]);
  });

  it('MOD-09 a collection is changed by another count, another id or another value, and an empty value is the same as none', () => {
    const start = [{ id: 'n1', text: 'a', position: null }];
    expect(linesChanged(NOTES, start, [{ id: 'n1', text: 'a', position: undefined }])).toBe(false);
    expect(linesChanged(NOTES, start, [{ id: 'n1', text: 'b' }])).toBe(true);
    expect(linesChanged(NOTES, start, [])).toBe(true);
    expect(linesChanged(NOTES, start, [{ id: 'n2', text: 'a' }])).toBe(true);
    expect(linesChanged(NOTES, [], [{ text: 'new' }])).toBe(true);
  });
});
