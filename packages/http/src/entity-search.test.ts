/**
 * BieberKit
 *
 * @file        packages/http/src/entity-search.test.ts
 * @description Tests of the search of a list, `q`: a prefix of a searchable field, in the folded form of the field, so that case and diacritics do not matter, and a refusal for an entity that has nothing to search (UI-11, SR-01).
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
import { entityApp } from './entity-app.ts';
import type { EntityApp } from './entity-app.ts';

const BASE = '/api/v1/crm/accounts';

let seq = 0;
async function make(app: EntityApp, name: string): Promise<void> {
  const response = await app.server.inject({ method: 'POST', url: BASE, payload: { code: `S${(seq += 1)}`, name } });
  expect(response.statusCode).toBe(201);
}

async function names(app: EntityApp, query: string): Promise<string[]> {
  const response = await app.server.inject({ method: 'GET', url: `${BASE}?${query}&sort=name` });
  expect(`${String(response.statusCode)} ${response.body.slice(0, 200)}`).toMatch(/^200 /);
  const body: { data: { name: string }[] } = JSON.parse(response.body);
  return body.data.map((row) => row.name);
}

async function seeded(): Promise<EntityApp> {
  const app = await entityApp();
  for (const name of ['Nguyễn Lan', 'Nguyen Minh', 'Trần An', 'Acme Corp', 'Đỗ Hùng', '100% Pure', 'a_b'])
    await make(app, name);
  return app;
}

describe('UI-11 the search of a list', () => {
  // A list is sorted by the folded text of the field, so the order below is the one of `nguyen lan` and `nguyen minh`.
  it('UI-11 finds the rows that start with the text, whatever the case and the diacritics', async () => {
    const app = await seeded();
    expect(await names(app, 'q=nguyen')).toEqual(['Nguyễn Lan', 'Nguyen Minh']);
    expect(await names(app, 'q=NGUYỄN')).toEqual(['Nguyễn Lan', 'Nguyen Minh']);
    expect(await names(app, 'q=tran')).toEqual(['Trần An']);
    expect(await names(app, 'q=do%20h')).toEqual(['Đỗ Hùng']);
    expect(await names(app, 'q=acme')).toEqual(['Acme Corp']);
  });

  it('UI-11 the whole text is a prefix, with its spaces, and a text that nothing starts with finds nothing', async () => {
    const app = await seeded();
    expect(await names(app, 'q=nguyen%20l')).toEqual(['Nguyễn Lan']);
    expect(await names(app, 'q=nguyen%20%20%20l')).toEqual(['Nguyễn Lan']);
    expect(await names(app, 'q=lan')).toEqual([]);
    expect(await names(app, 'q=zzz')).toEqual([]);
  });

  it('UI-11 the signs of a pattern are left out of the text, so a person cannot make a pattern, and a text of only signs is no search', async () => {
    const app = await seeded();
    expect((await names(app, 'q=%25')).length).toBe(7);
    expect(await names(app, 'q=a_')).toEqual(['a_b', 'Acme Corp']);
    expect(await names(app, 'q=%25acme')).toEqual(['Acme Corp']);
  });

  it('UI-11 goes with the filters, the sort and the page of a list', async () => {
    const app = await seeded();
    expect(await names(app, 'q=n&filter[tier][eq]=basic')).toEqual(['Nguyễn Lan', 'Nguyen Minh']);
    expect(await names(app, 'q=n&filter[tier][eq]=gold')).toEqual([]);
    const page = await app.server.inject({
      method: 'GET',
      url: `${BASE}?q=n&pageSize=1&page=2&sort=name&withTotal=true`,
    });
    const body: { data: { name: string }[]; meta: { total: number } } = JSON.parse(page.body);
    expect(body.data.map((row) => row.name)).toEqual(['Nguyen Minh']);
    expect(body.meta.total).toBe(2);
  });

  it('UI-11 an entity with nothing searchable does not take q, and the refusal says so', async () => {
    const app = await entityApp();
    const response = await app.server.inject({ method: 'GET', url: '/api/v1/crm/notes?q=a' });
    expect(response.statusCode).toBe(400);
  });

  it('UI-11 an empty text is no search, and a text longer than 100 characters is refused', async () => {
    const app = await seeded();
    expect((await names(app, 'q=')).length).toBe(7);
    const long = await app.server.inject({ method: 'GET', url: `${BASE}?q=${'a'.repeat(101)}` });
    expect(long.statusCode).toBe(400);
  });
});
