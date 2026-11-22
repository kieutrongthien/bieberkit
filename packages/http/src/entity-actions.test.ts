/**
 * BieberKit
 *
 * @file        packages/http/src/entity-actions.test.ts
 * @description Tests of the transition routes and the bulk route of an entity (MOD-06, API-13, API-14, API-17).
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

import { AuditLog, OutboxEntry } from '@bieberkit/data/orm';
import { describe, expect, it } from 'vitest';
import { entityApp } from './entity-app.ts';
import type { EntityApp } from './entity-app.ts';

const BASE = '/api/v1/crm/accounts';

interface Body {
  data?: unknown;
  meta?: Record<string, unknown>;
  code?: string;
  current?: Record<string, unknown>;
}

const json = (body: string): Body => (body === '' ? {} : JSON.parse(body));

interface Result {
  id: string;
  status: string;
  version?: number;
  error?: { code: string };
}

const results = (response: { body: string }): Result[] => {
  const data: unknown = json(response.body).data;
  return Array.isArray(data) ? data : [];
};

let seq = 0;
async function create(app: EntityApp): Promise<{ id: string }> {
  seq += 1;
  const response = await app.server.inject({
    method: 'POST',
    url: BASE,
    payload: { code: `T${seq}`, name: `Acc ${seq}` },
  });
  const data = json(response.body).data;
  return { id: String(Reflect.get(Object(data), 'id')) };
}

const act = (
  app: EntityApp,
  id: string,
  name: string,
  headers: Record<string, string> = { 'if-match': '1' },
  payload?: object,
) =>
  app.server.inject({
    method: 'POST',
    url: `${BASE}/${id}/actions/${name}`,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });

const bulk = (app: EntityApp, payload: object) => app.server.inject({ method: 'POST', url: `${BASE}/bulk`, payload });

describe('MOD-06 transition routes', () => {
  it('MOD-06 moves the row along the transition and answers the row, with the event and the audit entry', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    const response = await act(app, id, 'open');
    expect(response.statusCode).toBe(200);
    expect(json(response.body).data).toMatchObject({ id, status: 'open', version: 2 });
    const events = await app.db.fork().find(OutboxEntry, { event: 'crm.account.open' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ recordId: id, recordVersion: 2 });
    expect((await app.db.fork().find(AuditLog, { action: 'crm.Account.open' })).length).toBe(1);
  });

  it('API-13 needs If-Match: 428 without it, and 412 with the current row when it is stale', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    expect((await act(app, id, 'open', {})).statusCode).toBe(428);
    await act(app, id, 'open');
    const stale = await act(app, id, 'open', { 'if-match': '1' });
    expect(stale.statusCode).toBe(412);
    expect(json(stale.body).current).toMatchObject({ id, version: 2, status: 'open' });
  });

  it('MOD-07 a transition that does not start from the state of the row is 409', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    const response = await act(app, id, 'close', { 'if-match': '1' }, { reason: 'finished' });
    expect(response.statusCode).toBe(409);
    expect(json(response.body).code).toBe('DATA_TRANSITION_NOT_ALLOWED');
  });

  it('MOD-06 checks the input of the transition: 422 when it is not valid, and kept in the event when it is', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    await act(app, id, 'open');
    const bad = await act(app, id, 'close', { 'if-match': '2' }, { reason: 'x' });
    expect(bad.statusCode).toBe(422);
    expect(json(bad.body).code).toBe('DATA_TRANSITION_INPUT_INVALID');
    const good = await act(app, id, 'close', { 'if-match': '2' }, { reason: 'all done' });
    expect(good.statusCode).toBe(200);
    expect(json(good.body).data).toMatchObject({ status: 'closed' });
    const [event] = await app.db.fork().find(OutboxEntry, { event: 'crm.account.close' });
    expect(JSON.parse(String(event?.payload))).toMatchObject({ input: { reason: 'all done' } });
  });

  it('MOD-06 input for a transition that takes none is 422, and an empty body is no input', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    expect((await act(app, id, 'open', { 'if-match': '1' }, { note: 'x' })).statusCode).toBe(422);
    expect((await act(app, id, 'open', { 'if-match': '1' }, {})).statusCode).toBe(200);
  });

  it('MOD-06 asks for the permission of the transition, and for update when it has none', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    app.asked.length = 0;
    await act(app, id, 'open');
    await act(app, id, 'close', { 'if-match': '2' }, { reason: 'done!' });
    expect(app.asked).toEqual(['crm.account.update', 'crm.account.close']);
  });

  it('MOD-06 a caller without the permission of the transition is 403', async () => {
    const app = await entityApp({ authorizer: { can: async (_p, permission) => permission !== 'crm.account.close' } });
    const { id } = await create(app);
    await act(app, id, 'open');
    expect((await act(app, id, 'close', { 'if-match': '2' }, { reason: 'done!' })).statusCode).toBe(403);
  });

  it('MOD-06 a row of another tenant, or that does not exist, is 404', async () => {
    const app = await entityApp();
    expect((await act(app, '0190f6b2-7c4e-7000-8000-0000000000ff', 'open')).statusCode).toBe(404);
  });

  it('MOD-06 an entity without a state, and a transition that does not exist, have no such route', async () => {
    const app = await entityApp();
    const { id } = await create(app);
    expect((await act(app, id, 'nope')).statusCode).toBe(404);
    expect(
      (
        await app.server.inject({
          method: 'POST',
          url: `/api/v1/crm/notes/${id}/actions/open`,
          headers: { 'if-match': '1' },
        })
      ).statusCode,
    ).toBe(404);
  });
});

async function made(app: EntityApp, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 0; n < count; n += 1) ids.push((await create(app)).id);
  return ids;
}

const items = (ids: string[], version = 1) => ids.map((id) => ({ id, version }));

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `0190f6b2-7c4e-7000-8000-${String(i).padStart(12, '0')}`, version: 1 }));

describe('API-14 the bulk route', () => {
  it('API-14 updates the rows with one patch, and reports each row with its new version', async () => {
    const app = await entityApp();
    const ids = await made(app, 3);
    const response = await bulk(app, { operation: 'update', items: items(ids), data: { tier: 'gold' } });
    expect(response.statusCode).toBe(200);
    expect(results(response)).toEqual(ids.map((id) => ({ id, status: 'ok', version: 2 })));
    expect(json(response.body).meta).toEqual({ requested: 3, succeeded: 3, failed: 0 });
    const list = json((await app.server.inject({ method: 'GET', url: `${BASE}?filter[tier][eq]=gold` })).body);
    expect(Array.isArray(list.data) ? list.data.length : 0).toBe(3);
    expect((await app.db.fork().find(OutboxEntry, { event: 'crm.account.updated' })).length).toBe(3);
  });

  it('API-17 a row with a stale version is a conflict that names the current version, and the others are saved', async () => {
    const app = await entityApp();
    const ids = await made(app, 3);
    await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${ids[1]}`,
      headers: { 'if-match': '1' },
      payload: { visits: 5 },
    });
    const response = await bulk(app, { operation: 'update', items: items(ids), data: { tier: 'vip' } });
    const out = results(response);
    expect(out.map((row) => row.status)).toEqual(['ok', 'conflict', 'ok']);
    expect(out[1]).toMatchObject({ id: ids[1], version: 2, error: { code: 'DATA_VERSION_STALE' } });
    expect(json(response.body).meta).toEqual({ requested: 3, succeeded: 2, failed: 1 });
    const row = json((await app.server.inject({ method: 'GET', url: `${BASE}/${ids[1]}` })).body).data;
    expect(row).toMatchObject({ tier: 'basic', visits: 5 });
  });

  it('API-14 a row that does not exist is not_found, and the rest go on', async () => {
    const app = await entityApp();
    const [id = ''] = await made(app, 1);
    const response = await bulk(app, {
      operation: 'update',
      items: [
        { id, version: 1 },
        { id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 },
      ],
      data: { tier: 'gold' },
    });
    expect(results(response).map((row) => row.status)).toEqual(['ok', 'not_found']);
  });

  it('API-14 deletes the rows, soft, and the list does not show them', async () => {
    const app = await entityApp();
    const ids = await made(app, 3);
    const response = await bulk(app, { operation: 'delete', items: items(ids.slice(0, 2)) });
    expect(results(response).map((row) => row.status)).toEqual(['ok', 'ok']);
    const list = json((await app.server.inject({ method: 'GET', url: BASE })).body);
    expect(Array.isArray(list.data) ? list.data.length : 0).toBe(1);
    expect((await app.db.fork().find(OutboxEntry, { event: 'crm.account.deleted' })).length).toBe(2);
  });

  it('API-14 runs a transition on every row, and a row that is not in the right state is invalid', async () => {
    const app = await entityApp();
    const ids = await made(app, 2);
    await act(app, ids[0] ?? '', 'open');
    const response = await bulk(app, {
      operation: 'transition',
      transition: 'open',
      items: [
        { id: ids[0] ?? '', version: 2 },
        { id: ids[1] ?? '', version: 1 },
      ],
    });
    const out = results(response);
    expect(out.map((row) => row.status)).toEqual(['invalid', 'ok']);
    expect(out[0]?.error?.code).toBe('DATA_TRANSITION_NOT_ALLOWED');
    expect(out[1]).toMatchObject({ version: 2 });
  });

  it('API-14 checks the permission of the operation, which is not the permission of the route', async () => {
    const other = await entityApp({
      authorizer: { can: async (_p, permission) => permission !== 'crm.account.delete' },
    });
    const [id = ''] = await made(other, 1);
    const denied = await bulk(other, { operation: 'delete', items: items([id]) });
    expect(denied.statusCode).toBe(403);
    expect((await bulk(other, { operation: 'update', items: items([id]), data: { tier: 'gold' } })).statusCode).toBe(
      200,
    );
    expect((await other.server.inject({ method: 'GET', url: `${BASE}/${id}` })).statusCode).toBe(200);
  });

  it.each([
    ['no items', { operation: 'delete', items: [] }],
    [
      'an operation that does not exist',
      { operation: 'merge', items: [{ id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 }] },
    ],
    ['an item without a version', { operation: 'delete', items: [{ id: '0190f6b2-7c4e-7000-8000-0000000000ff' }] }],
    [
      'an update without data',
      { operation: 'update', items: [{ id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 }] },
    ],
    [
      'a transition without a name',
      { operation: 'transition', items: [{ id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 }] },
    ],
    [
      'data that is not valid for the entity',
      {
        operation: 'update',
        items: [{ id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 }],
        data: { status: 'open' },
      },
    ],
    [
      'the same id twice',
      {
        operation: 'delete',
        items: [
          { id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 },
          { id: '0190f6b2-7c4e-7000-8000-0000000000ff', version: 1 },
        ],
      },
    ],
  ])('API-14 refuses %s', async (_name, payload) => {
    const app = await entityApp();
    expect((await bulk(app, payload)).statusCode).toBe(400);
  });

  it('API-14 up to 500 items are accepted by the schema, and above 100 they wait for the queue: 422', async () => {
    const app = await entityApp();
    const big = await bulk(app, { operation: 'delete', items: many(101) });
    expect(big.statusCode).toBe(422);
    expect(json(big.body).code).toBe('HTTP_BULK_TOO_LARGE');
    expect((await bulk(app, { operation: 'delete', items: many(501) })).statusCode).toBe(400);
    expect((await bulk(app, { operation: 'delete', items: many(100) })).statusCode).toBe(200);
  });

  it('7.5 a failure of the database stops the whole request and saves nothing', async () => {
    const app = await entityApp();
    const ids = await made(app, 2);
    const [first = '', second = ''] = ids;
    const one = json((await app.server.inject({ method: 'GET', url: `${BASE}/${first}` })).body).data;
    const response = await bulk(app, {
      operation: 'update',
      items: items(ids),
      data: { code: String(Reflect.get(Object(one), 'code')) },
    });
    expect(response.statusCode).toBe(409);
    expect(json(response.body).code).toBe('HTTP_CONFLICT');
    const row = json((await app.server.inject({ method: 'GET', url: `${BASE}/${second}` })).body).data;
    expect(row).toMatchObject({ version: 1 });
    expect(await app.db.fork().count(OutboxEntry, { event: 'crm.account.updated' })).toBe(0);
  });

  it('API-14 an entity that cannot be updated or deleted has no bulk route', async () => {
    const app = await entityApp();
    expect(
      (
        await app.server.inject({
          method: 'POST',
          url: '/api/v1/crm/people/bulk',
          payload: { operation: 'delete', items: [] },
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('13.1 create is idempotent', () => {
  it('13.1 the same Idempotency-Key makes one account', async () => {
    const app = await entityApp();
    const send = () =>
      app.server.inject({
        method: 'POST',
        url: BASE,
        headers: { 'idempotency-key': 'abc' },
        payload: { code: 'ONCE', name: 'Once' },
      });
    const first = await send();
    const again = await send();
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.body).toBe(first.body);
    const list = json((await app.server.inject({ method: 'GET', url: `${BASE}?filter[code][eq]=ONCE` })).body);
    expect(Array.isArray(list.data) ? list.data.length : 0).toBe(1);
  });
});
