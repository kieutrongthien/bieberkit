/**
 * BieberKit
 *
 * @file        packages/http/src/entity-inline.test.ts
 * @description Tests of the inline collections of an entity (`f.hasMany(...).inline()`): the lines are in the body of the record and in its answer, they are saved with it in one transaction, and each is checked as the child entity says (MOD-09, UI-11).
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

interface Note {
  id?: string;
  text: string;
  position?: number;
  accountId?: string;
}
interface Body {
  data?: Record<string, unknown> & { id?: string; version?: number; notes?: Note[] };
  errors?: { path: string; code: string }[];
  code?: string;
}

const json = (text: string): Body => (text === '' ? {} : JSON.parse(text));

let seq = 0;
const valid = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: `N${(seq += 1)}`,
  name: `Inline ${seq}`,
  ...extra,
});

const create = (app: EntityApp, extra: Record<string, unknown> = {}) =>
  app.server.inject({ method: 'POST', url: BASE, payload: valid(extra) });

const read = async (app: EntityApp, id: string): Promise<Body> =>
  json((await app.server.inject({ method: 'GET', url: `${BASE}/${id}` })).body);

const patch = (app: EntityApp, row: { id?: string; version?: number }, payload: Record<string, unknown>) =>
  app.server.inject({
    method: 'PATCH',
    url: `${BASE}/${String(row.id)}`,
    headers: { 'if-match': String(row.version) },
    payload,
  });

const texts = (notes: Note[] | undefined): string[] => (notes ?? []).map((note) => note.text);

describe('MOD-09 the lines of a record are saved with it and come back with it', () => {
  it('MOD-09 a create takes the lines, answers them with their ids, and a read gives them in the order that they were made', async () => {
    const app = await entityApp();
    const made = await create(app, { notes: [{ text: 'first' }, { text: 'second', position: 2 }] });
    expect(`${String(made.statusCode)} ${made.body.slice(0, 200)}`).toMatch(/^201 /);
    const data = json(made.body).data;
    expect(texts(data?.notes)).toEqual(['first', 'second']);
    expect(data?.notes?.[0]?.id).toEqual(expect.any(String));
    expect(data?.notes?.[0]?.accountId).toBe(data?.id);
    expect(texts((await read(app, String(data?.id))).data?.notes)).toEqual(['first', 'second']);
  });

  it('MOD-09 a record with no lines has an empty list, and a list of records does not carry the lines', async () => {
    const app = await entityApp();
    const data = json((await create(app)).body).data;
    expect((await read(app, String(data?.id))).data?.notes).toEqual([]);
    await create(app, { notes: [{ text: 'x' }] });
    const list = json((await app.server.inject({ method: 'GET', url: BASE })).body);
    expect(JSON.stringify(list)).not.toContain('"notes"');
  });

  it('MOD-09 an update with lines keeps the ones that name an id, adds the ones that do not, and removes the ones that are missing', async () => {
    const app = await entityApp();
    const made = json((await create(app, { notes: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] })).body).data;
    const [a, , c] = made?.notes ?? [];
    const done = await patch(app, made ?? {}, {
      notes: [{ id: a?.id, text: 'a2' }, { id: c?.id, text: 'c' }, { text: 'd' }],
    });
    expect(`${String(done.statusCode)} ${done.body.slice(0, 200)}`).toMatch(/^200 /);
    const data = json(done.body).data;
    expect(texts(data?.notes).toSorted()).toEqual(['a2', 'c', 'd']);
    expect(data?.notes?.find((note) => note.text === 'a2')?.id).toBe(a?.id);
    expect(data?.version).toBe(2);
    expect(texts((await read(app, String(made?.id))).data?.notes).toSorted()).toEqual(['a2', 'c', 'd']);
  });

  it('MOD-09 an update that has no lines key leaves the lines as they are, and an empty list removes them all', async () => {
    const app = await entityApp();
    const made = json((await create(app, { notes: [{ text: 'a' }] })).body).data;
    const renamed = json((await patch(app, made ?? {}, { name: 'Renamed' })).body).data;
    expect(texts(renamed?.notes)).toEqual(['a']);
    const emptied = json((await patch(app, renamed ?? {}, { notes: [] })).body).data;
    expect(emptied?.notes).toEqual([]);
  });

  it('MOD-09 a change of a line with the same other fields sent is still a change of the record: its version moves', async () => {
    const app = await entityApp();
    const made = json((await create(app, { notes: [{ text: 'a' }] })).body).data;
    const after = json(
      (await patch(app, made ?? {}, { name: made?.['name'], notes: [{ id: made?.notes?.[0]?.id, text: 'b' }] })).body,
    ).data;
    expect(after?.version).toBe(2);
  });

  it('MOD-09 a change of the lines alone is a change of the record: its version moves', async () => {
    const app = await entityApp();
    const made = json((await create(app, { notes: [{ text: 'a' }] })).body).data;
    const after = json((await patch(app, made ?? {}, { notes: [{ id: made?.notes?.[0]?.id, text: 'b' }] })).body).data;
    expect(after?.version).toBe(2);
    // The old version is stale now, so a second editor is told (API-13).
    expect((await patch(app, made ?? {}, { name: 'Late' })).statusCode).toBe(412);
  });
});

describe('MOD-09 what a line may not be', () => {
  it('MOD-09 a line is checked as the child entity says: a missing field and a text that is too long are refused', async () => {
    const app = await entityApp();
    expect((await create(app, { notes: [{}] })).statusCode).toBe(400);
    expect((await create(app, { notes: [{ text: 'x'.repeat(51) }] })).statusCode).toBe(400);
    expect((await create(app, { notes: [{ text: 'ok', accountId: 'x' }] })).statusCode).toBe(400);
  });

  it('MOD-09 an id that is not a line of this record is refused at the field, and nothing is changed', async () => {
    const app = await entityApp();
    const made = json((await create(app, { notes: [{ text: 'a' }] })).body).data;
    const other = json((await create(app, { notes: [{ text: 'z' }] })).body).data;
    const refused = await patch(app, made ?? {}, { notes: [{ id: other?.notes?.[0]?.id, text: 'stolen' }] });
    expect(refused.statusCode).toBe(400);
    expect(json(refused.body).errors?.[0]?.path).toBe('body.notes');
    expect(texts((await read(app, String(other?.id))).data?.notes)).toEqual(['z']);
  });

  it('MOD-09 more than 200 lines are refused', async () => {
    const app = await entityApp();
    const notes = Array.from({ length: 201 }, (_, n) => ({ text: `n${String(n)}` }));
    expect((await create(app, { notes })).statusCode).toBe(400);
  });

  it('MOD-09 a person who may not create the lines may not create the record with them, and no record is made', async () => {
    const app = await entityApp({
      authorizer: { can: async (_principal, permission) => permission !== 'crm.account_note.create' },
    });
    const refused = await create(app, { notes: [{ text: 'a' }] });
    expect(refused.statusCode).toBe(403);
    const list = json((await app.server.inject({ method: 'GET', url: BASE })).body);
    expect(list.data).toEqual([]);
  });

  it('MOD-09 a person who may not remove the lines may not leave them out of an update', async () => {
    const app = await entityApp({
      authorizer: { can: async (_principal, permission) => permission !== 'crm.account_note.delete' },
    });
    const made = json((await create(app, { notes: [{ text: 'a' }] })).body).data;
    const refused = await patch(app, made ?? {}, { notes: [] });
    expect(refused.statusCode).toBe(403);
    expect(texts((await read(app, String(made?.id))).data?.notes)).toEqual(['a']);
  });
});
