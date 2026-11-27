/**
 * BieberKit
 *
 * @file        packages/admin-core/src/lists.test.ts
 * @description Tests of the generic list: filters over the query of the API, saved views, the export and the outcome of a bulk call (UI-03).
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
  bulkSummary,
  csvOf,
  deleteView,
  exportPages,
  filterParams,
  filterProblem,
  loadViews,
  operatorsOf,
  saveView,
  viewFromSearch,
  viewToSearch,
} from './lists.ts';
import type { Filter, SavedView } from './lists.ts';
import type { DraftStorage } from './drafts.ts';
import type { MetaEntity, MetaField } from './types.ts';

const field = (key: string, kind: string, extra: Partial<MetaField> = {}): MetaField => ({
  key,
  kind,
  widget: 'text',
  required: false,
  readOnly: false,
  filterable: true,
  sortable: true,
  ...extra,
});

const ENTITY: MetaEntity = {
  name: 'crm.Account',
  path: '/api/v1/crm/accounts',
  label: { en: 'Account' },
  operations: { list: true, get: true, create: true, update: true, delete: true },
  can: { read: true, create: true, update: true, delete: true },
  softDelete: false,
  tenant: false,
  list: ['name'],
  form: ['name'],
  fields: [
    field('name', 'string'),
    field('tier', 'oneOf', { values: ['basic', 'gold'] }),
    field('visits', 'int'),
    field('active', 'boolean'),
    field('since', 'date'),
    field('seen', 'dateTime'),
    field('note', 'text', { filterable: false }),
    field('owner', 'belongsTo'),
  ],
};

const memory = (): DraftStorage & { readonly data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

const problem = (filter: Filter): string | undefined => filterProblem(ENTITY, filter);

describe('UI-03 the filters', () => {
  it('UI-03 each kind of field offers the operators that the API takes for it', () => {
    expect(operatorsOf('string')).toEqual(['eq', 'ne', 'in', 'null']);
    expect(operatorsOf('oneOf')).toEqual(['eq', 'ne', 'in', 'null']);
    expect(operatorsOf('int')).toEqual(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'null']);
    expect(operatorsOf('dateTime')).toContain('gte');
    expect(operatorsOf('boolean')).toEqual(['eq', 'null']);
    expect(operatorsOf('belongsTo')).toEqual(['eq', 'in', 'null']);
  });

  it('UI-03 the filters become the query of the API, one parameter for each', () => {
    const filters: Filter[] = [
      { field: 'tier', op: 'in', value: 'gold,basic' },
      { field: 'visits', op: 'gte', value: '5' },
      { field: 'note2', op: 'eq', value: 'x' },
    ];
    expect(filterParams(ENTITY, filters.slice(0, 2))).toEqual({
      'filter[tier][in]': 'gold,basic',
      'filter[visits][gte]': '5',
    });
    expect(filterParams(ENTITY, [{ field: 'owner', op: 'null', value: 'true' }])).toEqual({
      'filter[owner][null]': 'true',
    });
  });

  it('UI-03 a filter that the API would refuse is not sent: an unknown field, one with no index, a wrong operator, a wrong value', () => {
    expect(problem({ field: 'nope', op: 'eq', value: 'x' })).toContain('nope');
    expect(problem({ field: 'note', op: 'eq', value: 'x' })).toContain('note');
    expect(problem({ field: 'name', op: 'gt', value: 'x' })).toContain('gt');
    expect(problem({ field: 'visits', op: 'gt', value: 'many' })).toContain('visits');
    expect(problem({ field: 'active', op: 'eq', value: 'maybe' })).toContain('active');
    expect(problem({ field: 'since', op: 'eq', value: '05/03/2026' })).toContain('since');
    expect(problem({ field: 'tier', op: 'eq', value: 'platinum' })).toContain('tier');
    expect(problem({ field: 'tier', op: 'in', value: 'gold,platinum' })).toContain('tier');
    expect(problem({ field: 'visits', op: 'eq', value: '5' })).toBeUndefined();
    expect(problem({ field: 'active', op: 'eq', value: 'true' })).toBeUndefined();
    expect(problem({ field: 'since', op: 'gte', value: '2026-03-05' })).toBeUndefined();
    expect(problem({ field: 'seen', op: 'lt', value: '2026-03-05T10:00:00.000Z' })).toBeUndefined();
    expect(problem({ field: 'name', op: 'null', value: 'true' })).toBeUndefined();
    expect(() => filterParams(ENTITY, [{ field: 'nope', op: 'eq', value: 'x' }])).toThrow(/nope/);
  });
});

describe('UI-03 the saved views', () => {
  const key = 'bk-views:user-1:crm.Account';
  const gold: SavedView = { name: 'Gold', filters: [{ field: 'tier', op: 'eq', value: 'gold' }], sort: '-visits' };

  it('UI-03 a view is saved by its name, a second one of the same name replaces it, and the list keeps the order of saving', () => {
    const storage = memory();
    saveView(storage, key, gold);
    saveView(storage, key, { name: 'Active', filters: [{ field: 'active', op: 'eq', value: 'true' }] });
    saveView(storage, key, { ...gold, sort: 'name' });
    expect(loadViews(storage, key).map((view) => [view.name, view.sort])).toEqual([
      ['Gold', 'name'],
      ['Active', undefined],
    ]);
    deleteView(storage, key, 'Gold');
    expect(loadViews(storage, key).map((view) => view.name)).toEqual(['Active']);
  });

  it('UI-03 there are at most twenty views, and a broken storage, a refusing one and a text that is not views are quiet', () => {
    const storage = memory();
    for (let n = 0; n < 25; n += 1) saveView(storage, key, { name: `v${String(n)}`, filters: [] });
    expect(loadViews(storage, key)).toHaveLength(20);
    expect(loadViews(storage, key).at(-1)?.name).toBe('v24');
    storage.data.set(key, '{no');
    expect(loadViews(storage, key)).toEqual([]);
    storage.data.set(key, JSON.stringify([{ name: 3 }, { name: 'ok', filters: [{ field: 1 }] }, gold]));
    expect(loadViews(storage, key)).toEqual([gold]);
    const refusing: DraftStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveView(refusing, key, gold)).not.toThrow();
    expect(loadViews(refusing, key)).toEqual([]);
  });

  it('UI-03 a view goes into the address and comes back out of it, so a link opens the same list', () => {
    const search = viewToSearch(gold);
    expect(viewFromSearch(search)).toEqual({ name: '', filters: gold.filters, sort: '-visits' });
    expect(viewFromSearch({})).toEqual({ name: '', filters: [] });
    expect(viewFromSearch({ filters: 'not a list', sort: 4 })).toEqual({ name: '', filters: [] });
  });
});

describe('UI-03 the export', () => {
  it('UI-03 a CSV has the titles, the rows in the order of the columns, and quotes what needs them', () => {
    const columns = [
      { key: 'name', title: 'Name' },
      { key: 'note', title: 'Note' },
    ];
    expect(csvOf(columns, [{ name: 'Ann', note: 'a, "b"' }, { name: 'Bo', note: 'x\ny' }, { name: 'Cy' }])).toBe(
      'Name,Note\r\nAnn,"a, ""b"""\r\nBo,"x\ny"\r\nCy,\r\n',
    );
  });

  it('UI-03 a cell that a spreadsheet would run as a formula starts with a quote mark (IO-04)', () => {
    const columns = [{ key: 'v', title: 'V' }];
    for (const value of ['=1+1', '+SUM(A1)', '-2', '@x', '\tcmd', '\rcmd'])
      expect(csvOf(columns, [{ v: value }]).split('\r\n')[1]).toContain("'");
    expect(csvOf(columns, [{ v: 'safe' }])).toBe('V\r\nsafe\r\n');
    expect(csvOf(columns, [{ v: -5 }])).toBe('V\r\n-5\r\n');
  });

  it('UI-03 values that are not text are written as the API sends them: a boolean, a number, a null and an object', () => {
    const columns = [{ key: 'v', title: 'V' }];
    expect(csvOf(columns, [{ v: true }, { v: 3 }, { v: null }, { v: { amount: '1.5', currency: 'USD' } }])).toBe(
      'V\r\ntrue\r\n3\r\n\r\n"{""amount"":""1.5"",""currency"":""USD""}"\r\n',
    );
  });

  it('UI-03 the pages of an export stop at the limit, and say that they were cut', () => {
    expect(exportPages(120, 50, 10_000)).toEqual({ pages: 3, truncated: false });
    expect(exportPages(0, 50, 10_000)).toEqual({ pages: 0, truncated: false });
    expect(exportPages(25_000, 100, 10_000)).toEqual({ pages: 100, truncated: true });
  });
});

describe('UI-03 the outcome of a bulk call', () => {
  it('UI-03 counts what worked and lists what did not, with the reason that the API gave', () => {
    const summary = bulkSummary([
      { id: 'a', status: 'ok' },
      { id: 'b', status: 'conflict', error: { code: 'DATA_VERSION_STALE', message: 'Changed by someone else.' } },
      { id: 'c', status: 'not_found' },
      { id: 'd', status: 'invalid', error: { code: 'AUTHZ_DENIED', message: 'Not yours.' } },
    ]);
    expect(summary.ok).toBe(1);
    expect(summary.failed).toEqual([
      { id: 'b', message: 'Changed by someone else.' },
      { id: 'c', message: 'not_found' },
      { id: 'd', message: 'Not yours.' },
    ]);
  });
});
