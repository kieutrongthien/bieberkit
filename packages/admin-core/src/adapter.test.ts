/**
 * BieberKit
 *
 * @file        packages/admin-core/src/adapter.test.ts
 * @description The second adapter: a text adapter that draws every generic screen with the public functions of admin-core alone, against an in-memory API, to prove that the contract of the adapters is not Ant Design (UI-10, spec section 26).
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
import { TextAdmin } from './fixtures/text-adapter.ts';
import { defineAdminPlugin } from './part.ts';
import type { DraftStorage } from './drafts.ts';
import type { Meta, MetaEntity, MetaField, Row } from './types.ts';

const field = (key: string, kind: string, extra: Partial<MetaField> = {}): MetaField => ({
  key,
  kind,
  widget: kind === 'oneOf' ? 'select' : kind === 'state' ? 'readonly' : 'text',
  required: false,
  readOnly: kind === 'state',
  filterable: false,
  sortable: false,
  ...extra,
});

const TICKET: MetaEntity = {
  name: 'crm.Ticket',
  path: '/api/v1/crm/tickets',
  label: { en: 'Ticket', vi: 'Phiếu' },
  operations: { list: true, get: true, create: true, update: true, delete: true },
  can: { read: true, create: true, update: true, delete: true },
  features: [],
  softDelete: false,
  tenant: false,
  title: 'title',
  list: ['title', 'priority', 'status'],
  form: ['title', 'priority'],
  fields: [
    field('title', 'string', {
      required: true,
      filterable: true,
      sortable: true,
      validation: { type: 'string', minLength: 3 },
    }),
    field('priority', 'oneOf', { filterable: true, values: ['low', 'high'] }),
    field('status', 'state', { filterable: true }),
  ],
  transitions: [
    {
      name: 'close',
      from: ['open'],
      to: 'closed',
      permission: 'crm.close',
      allowed: true,
      path: '/x/{id}/actions/close',
      input: { type: 'object', properties: { reason: { type: 'string', minLength: 3 } }, required: ['reason'] },
    },
    {
      name: 'reopen',
      from: ['closed'],
      to: 'open',
      permission: 'crm.close',
      allowed: true,
      path: '/x/{id}/actions/reopen',
    },
  ],
};

const META: Meta = {
  schemaVersion: 2,
  entities: [TICKET],
  permissions: [],
};

const reply = (status: number, body: unknown): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const stale = (row: Row, header: string | undefined): boolean => String(row['version']) !== header;

/** The API of a few rows in memory: the list with filters, sort and paging, the writes with `If-Match`, the moves and the bulk call. */
function memoryApi(initial: readonly Row[]): typeof fetch {
  const rows = new Map(initial.map((row) => [String(row['id']), { ...row }]));
  let next = rows.size;
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://x.test',
    );
    const method = init?.method ?? 'GET';
    const headers = Object.fromEntries(
      Object.entries(Object(init?.headers)).map(([key, value]) => [key.toLowerCase(), String(value)]),
    );
    const body: Record<string, unknown> = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (url.pathname === '/api/v1/_meta') return reply(200, META);
    if (method === 'GET' && url.pathname === TICKET.path) {
      let found = [...rows.values()];
      for (const [name, value] of url.searchParams) {
        const match = /^filter\[(\w+)\]\[(\w+)\]$/.exec(name);
        if (match === null) continue;
        const [, key = '', op = ''] = match;
        found = found.filter((row) =>
          op === 'in'
            ? value.split(',').includes(String(row[key]))
            : op === 'ne'
              ? String(row[key]) !== value
              : String(row[key]) === value,
        );
      }
      const sort = url.searchParams.get('sort');
      if (sort !== null) {
        const key = sort.replace(/^-/, '');
        found.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (sort.startsWith('-') ? -1 : 1));
      }
      const size = Number(url.searchParams.get('pageSize') ?? 25);
      const page = Number(url.searchParams.get('page') ?? 1);
      return reply(200, {
        data: found.slice((page - 1) * size, page * size),
        meta: { page, pageSize: size, total: found.length },
      });
    }
    if (method === 'POST' && url.pathname === TICKET.path) {
      next += 1;
      const row = { id: `t${String(next)}`, version: 1, status: 'open', ...body };
      rows.set(row.id, row);
      return reply(201, { data: row });
    }
    if (method === 'POST' && url.pathname === `${TICKET.path}/bulk`) {
      const items = Array.isArray(body['items']) ? body['items'] : [];
      const outcomes = items.map((item: { id: string; version: number }) => {
        const row = rows.get(item.id);
        if (row === undefined) return { id: item.id, status: 'not_found' };
        if (stale(row, String(item.version)))
          return {
            id: item.id,
            status: 'conflict',
            error: { code: 'DATA_VERSION_STALE', message: 'Changed by someone else.' },
          };
        if (body['operation'] === 'delete') rows.delete(item.id);
        else if (body['operation'] === 'update')
          Object.assign(row, body['data'], { version: Number(row['version']) + 1 });
        else
          Object.assign(row, {
            status: body['transition'] === 'close' ? 'closed' : 'open',
            version: Number(row['version']) + 1,
          });
        return { id: item.id, status: 'ok' };
      });
      return reply(200, { data: outcomes });
    }
    const action = /^\/api\/v1\/crm\/tickets\/([^/]+)\/actions\/(\w+)$/.exec(url.pathname);
    if (method === 'POST' && action !== null) {
      const row = rows.get(action[1] ?? '');
      if (row === undefined) return reply(404, { code: 'NOT_FOUND' });
      row['status'] = action[2] === 'close' ? 'closed' : 'open';
      row['version'] = Number(row['version']) + 1;
      return reply(200, { data: row });
    }
    const one = new RegExp(`^${TICKET.path}/([^/]+)$`).exec(url.pathname);
    if (method === 'PATCH' && one !== null) {
      const row = rows.get(one[1] ?? '');
      if (row === undefined) return reply(404, { code: 'NOT_FOUND' });
      if (stale(row, headers['if-match']))
        return reply(412, { code: 'DATA_VERSION_STALE', detail: 'Changed.', current: row });
      Object.assign(row, body, { version: Number(row['version']) + 1 });
      return reply(200, { data: row });
    }
    return reply(404, { code: 'NOT_FOUND' });
  };
}

const memoryStorage = (): DraftStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

const ROWS: Row[] = [
  { id: 't1', version: 1, title: 'Printer', priority: 'low', status: 'open' },
  { id: 't2', version: 1, title: 'Network', priority: 'high', status: 'open' },
  { id: 't3', version: 1, title: 'Account', priority: 'high', status: 'closed' },
];

async function admin(locale: 'en' | 'vi' = 'en'): Promise<TextAdmin> {
  const one = TextAdmin.over(memoryApi(ROWS), memoryStorage());
  await one.start(locale);
  return one;
}

/** A component of this adapter: a name that it writes. */
const load = async (): Promise<{ default: string }> => ({ default: 'drawn as text' });

describe('UI-10 a second adapter over admin-core alone', () => {
  it('UI-10 draws the menu, the list, the filters, the sort and the page from the metadata, in the language', async () => {
    const one = await admin();
    expect(one.menu()).toEqual(['Ticket']);
    expect(one.say('list.new')).toBe('New');
    const ticket = one.entity('crm.Ticket');
    expect(await one.list(ticket)).toBe(
      [
        '# Ticket',
        'title | priority | status',
        '[ ] Printer | low | open [close]',
        '[ ] Network | high | open [close]',
        '[ ] Account | high | closed [reopen]',
        'page 1 of 1',
      ].join('\n'),
    );
    expect(one.addFilter(ticket, { field: 'priority', op: 'eq', value: 'high' })).toBeUndefined();
    one.sort = '-title';
    expect(await one.list(ticket)).toContain('[ ] Network | high | open [close]\n[ ] Account | high | closed [reopen]');
    expect(await one.list(ticket)).toContain('filters: priority is high');
    expect(one.paramsOf(ticket)).toEqual({ 'filter[priority][eq]': 'high' });
  });

  it('UI-10, UI-35 reads what the admin parts of plugins add through admin-core alone: pages, blocks, a replaced screen and a control', async () => {
    const one = await admin();
    const problems = one.use([
      defineAdminPlugin<string>({
        name: 'bieberkit-plugin-reports',
        signIn: { load },
        pages: [
          { path: '/sales', title: 'reports.sales', load },
          { path: '/secret', title: 'reports.secret', permission: 'reports.secret', load },
        ],
        homeBlocks: [{ id: 'stats', title: 'reports.stats', load }],
        fields: [{ id: 'stars', widget: 'rating', load }],
        screens: [{ id: 'tickets', replace: 'list:crm.Ticket', load }],
      }),
    ]);
    expect(problems).toEqual([]);
    expect(one.pluginMenu()).toEqual(['reports.sales -> /sales']);
    expect(one.homeBlocks()).toEqual(['stats']);
    expect(one.replacedBy('list', 'crm.Ticket')).toBe('tickets');
    expect(one.replacedBy('form', 'crm.Ticket')).toBeUndefined();
    expect(one.fieldWidget('rating')).toBe('stars');
  });

  it('UI-10 refuses a filter that the API would refuse, and says why, before any call', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    expect(one.addFilter(ticket, { field: 'priority', op: 'eq', value: 'urgent' })).toContain('priority');
    expect(one.addFilter(ticket, { field: 'title', op: 'gt', value: 'a' })).toContain('gt');
    expect(one.filters).toEqual([]);
  });

  it('UI-10 speaks the language that was chosen, from a dictionary that is read on request', async () => {
    const one = await admin('vi');
    expect(one.say('list.new')).toBe('Thêm mới');
    expect(one.menu()).toEqual(['Phiếu']);
  });

  it('UI-03, UI-13 a move is shown as it will be before the answer, then saved, and the list shows the saved row', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    await one.list(ticket);
    const done = await one.move(ticket, 't1', 'close', { reason: 'fixed' });
    expect(done.shown).toMatchObject({ status: 'closed', version: 2 });
    expect(done.saved).toMatchObject({ status: 'closed', version: 2 });
    expect(await one.list(ticket)).toContain('Printer | low | closed [reopen]');
  });

  it('UI-03 a selection takes the moves that all of its rows may take, with what each asks for, and a bulk change reports each row', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    await one.list(ticket);
    one.select('t1', 't2');
    expect(one.bulkMoves(ticket)).toEqual([{ name: 'close', asks: ['reason'] }]);
    one.select('t1', 't3');
    expect(one.bulkMoves(ticket)).toEqual([]);
    one.select('t1', 't2');
    expect(await one.bulk(ticket, { operation: 'update', data: { priority: 'low' } })).toBe('2 done');
    // t2 is changed by someone else, so a second call with what was read is a conflict for it.
    expect(await one.bulk(ticket, { operation: 'delete' })).toBe(
      '0 done; t1: Changed by someone else.; t2: Changed by someone else.',
    );
  });

  it('IO-04 the export is the CSV of the filtered list, in the order of the columns, in pages', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    one.addFilter(ticket, { field: 'status', op: 'ne', value: 'closed' });
    expect(await one.exportCsv(ticket)).toBe('title,priority,status\r\nPrinter,low,open\r\nNetwork,high,open\r\n');
  });

  it('UI-03 saved views rest in the storage of the browser for one user and one entity', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    one.addFilter(ticket, { field: 'priority', op: 'eq', value: 'high' });
    one.saveView(ticket, 'u1', 'High');
    expect(one.views(ticket, 'u1')).toEqual([
      { name: 'High', filters: [{ field: 'priority', op: 'eq', value: 'high' }] },
    ]);
    expect(one.views(ticket, 'u2')).toEqual([]);
  });

  it('UI-03 the form shows the fields in order, marks what is required, and says what is wrong with a value in the language', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    expect(one.form(ticket)).toEqual(['title* (text):  !This field is required', 'priority (select): ']);
    expect(one.form(ticket, undefined, { title: 'ab' })[0]).toBe('title* (text): ab !At least 3 characters');
    expect(one.form(ticket, undefined, { title: '' })[0]).toBe('title* (text):  !This field is required');
  });

  it('UI-18 a save of a row that someone else changed gives the three-way merge, and a save of a current row is saved', async () => {
    const one = await admin();
    const ticket = one.entity('crm.Ticket');
    await one.list(ticket);
    const row = one.last.rows[0] ?? {};
    // Someone else changes the title; the person changed the priority.
    await one.client.update(ticket, 't1', { title: 'Printer 2' }, 1);
    const { merged, saved } = await one.save(ticket, row, { title: 'Printer', priority: 'high' });
    expect(saved).toBeUndefined();
    expect(merged?.values).toEqual({ title: 'Printer 2', priority: 'high' });
    expect(merged?.conflicts).toEqual([]);

    const created = await one.save(ticket, undefined, { title: 'Scanner', priority: 'low' });
    expect(created.saved).toMatchObject({ title: 'Scanner', status: 'open' });
  });
});
