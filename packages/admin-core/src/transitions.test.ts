/**
 * BieberKit
 *
 * @file        packages/admin-core/src/transitions.test.ts
 * @description Tests of the moves of a state field: which a row may take, what they ask for and the row as it will be (UI-03, UI-13).
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
  commonTransitions,
  inputFieldsOf,
  patchRow,
  stateKeyOf,
  transitionPatch,
  transitionsFor,
} from './transitions.ts';
import type { MetaEntity, MetaTransition } from './types.ts';

const field = (key: string, kind = 'string') => ({
  key,
  kind,
  widget: kind === 'state' ? 'readonly' : 'text',
  required: false,
  readOnly: kind === 'state',
  filterable: false,
  sortable: false,
});

const move = (
  name: string,
  from: string[],
  to: string,
  allowed = true,
  input?: Record<string, unknown>,
): MetaTransition => ({
  name,
  from,
  to,
  permission: `crm.${name}`,
  allowed,
  path: `/api/v1/crm/accounts/{id}/actions/${name}`,
  ...(input === undefined ? {} : { input }),
});

const ENTITY: MetaEntity = {
  name: 'crm.Account',
  path: '/api/v1/crm/accounts',
  label: { en: 'Account' },
  operations: { list: true, get: true, create: true, update: true, delete: true },
  can: { read: true, create: true, update: true, delete: true },
  softDelete: false,
  tenant: false,
  list: ['name', 'status'],
  form: ['name'],
  fields: [field('name'), field('status', 'state')],
  transitions: [
    move('open', ['new'], 'open'),
    move('close', ['open'], 'closed'),
    move('reopen', ['closed'], 'open', false),
    move('archive', ['new', 'open'], 'archived'),
  ],
};

describe('UI-03 the moves of a row', () => {
  it('UI-03 finds the state field, and none for an entity without one', () => {
    expect(stateKeyOf(ENTITY)).toBe('status');
    expect(stateKeyOf({ ...ENTITY, fields: [field('name')] })).toBeUndefined();
    expect(transitionsFor({ ...ENTITY, fields: [field('name')] }, { id: '1' })).toEqual([]);
  });

  it('UI-03 a row may take the moves that leave its state, and only the ones that the user has the permission for', () => {
    expect(transitionsFor(ENTITY, { id: '1', status: 'new' }).map((item) => item.name)).toEqual(['open', 'archive']);
    expect(transitionsFor(ENTITY, { id: '1', status: 'open' }).map((item) => item.name)).toEqual(['close', 'archive']);
    expect(transitionsFor(ENTITY, { id: '1', status: 'closed' })).toEqual([]);
    expect(transitionsFor(ENTITY, { id: '1' })).toEqual([]);
  });

  it('UI-03 rows that are selected offer the moves that all of them may take', () => {
    const rows = [
      { id: '1', status: 'new' },
      { id: '2', status: 'open' },
    ];
    expect(commonTransitions(ENTITY, rows).map((item) => item.name)).toEqual(['archive']);
    expect(commonTransitions(ENTITY, [])).toEqual([]);
    expect(commonTransitions(ENTITY, [{ id: '1', status: 'new' }]).map((item) => item.name)).toEqual([
      'open',
      'archive',
    ]);
  });
});

describe('UI-03 what a move asks for', () => {
  it('UI-03 draws the fields of the input from its JSON Schema, with what is required, the choices and the type', () => {
    const fields = inputFieldsOf({
      type: 'object',
      properties: {
        reason: { type: 'string', minLength: 3 },
        severity: { type: 'string', enum: ['low', 'high'] },
        days: { type: 'integer' },
        notify: { type: 'boolean' },
        details: { type: 'string', maxLength: 2000 },
      },
      required: ['reason'],
    });
    expect(fields.map((item) => [item.key, item.widget, item.required])).toEqual([
      ['reason', 'text', true],
      ['severity', 'select', false],
      ['days', 'number', false],
      ['notify', 'switch', false],
      ['details', 'textarea', false],
    ]);
    expect(fields[1]?.values).toEqual(['low', 'high']);
    expect(fields[2]?.kind).toBe('int');
  });

  it('UI-03 a move with no input, or an input that is not an object, asks for nothing', () => {
    expect(inputFieldsOf(undefined)).toEqual([]);
    expect(inputFieldsOf({ type: 'string' })).toEqual([]);
  });
});

describe('UI-13 the row as it will be', () => {
  it('UI-13 a move shows the new state and the next version at once, and changes no other row', () => {
    const rows = [
      { id: '1', status: 'open', version: 3 },
      { id: '2', status: 'open', version: 1 },
    ];
    const close = move('close', ['open'], 'closed');
    const next = patchRow(rows, '1', transitionPatch(ENTITY, close, rows[0] ?? {}));
    expect(next).toEqual([
      { id: '1', status: 'closed', version: 4 },
      { id: '2', status: 'open', version: 1 },
    ]);
    expect(next[1]).toBe(rows[1]);
    expect(rows[0]).toEqual({ id: '1', status: 'open', version: 3 });
  });
});
