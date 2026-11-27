/**
 * BieberKit
 *
 * @file        packages/http/src/entity-routes.test.ts
 * @description Tests of the routes that are generated from an entity: list, get, create, update and delete (spec 13.1, API-08, API-13, PERF-04).
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

import { OutboxEntry, AuditLog, entityOfSchema } from '@bieberkit/data/orm';
import type { OrmSchema } from '@bieberkit/data/orm';
import { describe, expect, it } from 'vitest';
import { entityApp, USER } from './entity-app.ts';
import type { EntityApp } from './entity-app.ts';
import { TENANT } from './testing.ts';

const BASE = '/api/v1/crm/accounts';

interface Body {
  data?: Record<string, unknown> & { id?: string };
  meta?: Record<string, unknown>;
  code?: string;
  current?: Record<string, unknown>;
  errors?: { path: string; code: string }[];
}

function json(body: string): Body {
  return body === '' ? {} : JSON.parse(body);
}

function rows(body: Body): Record<string, unknown>[] {
  const data: unknown = body.data;
  return Array.isArray(data) ? data : [];
}

let seq = 0;
const valid = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: `A${(seq += 1)}`,
  name: `Account ${seq}`,
  ...extra,
});

async function create(
  app: EntityApp,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown> & { id: string }> {
  const response = await app.server.inject({ method: 'POST', url: BASE, payload: valid(extra) });
  expect(response.statusCode).toBe(201);
  const data = json(response.body).data;
  return { ...data, id: String(data?.id) };
}

function noteSchema(app: EntityApp): OrmSchema {
  const found = app.schemas.find((schema) => entityOfSchema(schema).name === 'crm.Note');
  if (found === undefined) throw new Error('No Note schema.');
  return found;
}

async function seedNote(app: EntityApp): Promise<string> {
  const em = app.db.fork();
  const note = em.create(noteSchema(app), { text: 'a' });
  await em.flush();
  return String(note['id']);
}

async function ids(app: EntityApp, query: string): Promise<string[]> {
  const response = await app.server.inject({ method: 'GET', url: `${BASE}?${query}` });
  expect(response.statusCode).toBe(200);
  return rows(json(response.body)).map((row) => String(row['code']));
}

describe('13.1 which routes an entity gets', () => {
  it('13.1 has the routes that its api options turn on, under /api/v1/<module>/<resource>', async () => {
    const app = await entityApp();
    const has = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string): Promise<boolean> =>
      (await app.server.inject({ method, url })).statusCode !== 404 ||
      // A 404 can be the answer of a route that did not find the row. A route that does not exist has code HTTP_NOT_FOUND.
      json((await app.server.inject({ method, url })).body).code === 'DATA_RECORD_NOT_FOUND';
    const id = '0190f6b2-7c4e-7000-8000-0000000000ff';
    expect(await has('GET', BASE)).toBe(true);
    expect(await has('GET', `${BASE}/${id}`)).toBe(true);
    expect(await has('DELETE', `/api/v1/crm/notes/${id}`)).toBe(true);
    expect(await has('POST', '/api/v1/crm/notes')).toBe(false);
    expect(await has('GET', '/api/v1/crm/hidden')).toBe(false);
    expect(await has('PATCH', '/api/v1/crm/people/' + id)).toBe(false);
  });

  it('13.1 asks for the permission of the entity, and a default name when it has none', async () => {
    const app = await entityApp();
    const id = '0190f6b2-7c4e-7000-8000-0000000000ff';
    await app.server.inject({ method: 'GET', url: BASE });
    await app.server.inject({ method: 'GET', url: '/api/v1/crm/notes' });
    await app.server.inject({ method: 'POST', url: BASE, payload: valid() });
    await app.server.inject({ method: 'DELETE', url: `/api/v1/crm/notes/${id}`, headers: { 'if-match': '1' } });
    expect(app.asked).toEqual(['crm.account.read', 'crm.note.read', 'crm.account.create', 'crm.note.delete']);
  });

  it('API-02 a caller that is not signed in is refused', async () => {
    const app = await entityApp({ authenticator: { authenticate: async () => undefined } });
    expect((await app.server.inject({ method: 'GET', url: BASE })).statusCode).toBe(401);
    expect((await app.server.inject({ method: 'POST', url: BASE, payload: valid() })).statusCode).toBe(401);
  });

  it('API-02 a caller without the permission is refused', async () => {
    const app = await entityApp({ authorizer: { can: async () => false } });
    expect((await app.server.inject({ method: 'GET', url: BASE })).statusCode).toBe(403);
  });
});

describe('13.1 create', () => {
  it('13.1 answers 201 with the row, a Location and version 1, and the server fills what it owns', async () => {
    const app = await entityApp();
    const response = await app.server.inject({
      method: 'POST',
      url: BASE,
      payload: valid({ balance: { amount: '12500' }, tier: 'gold' }),
    });
    expect(response.statusCode).toBe(201);
    const row = json(response.body).data;
    expect(row).toMatchObject({
      version: 1,
      tier: 'gold',
      visits: 0,
      active: true,
      status: 'new',
      number: 'ACC-0001',
      balance: { amount: '12500', currency: 'VND' },
    });
    expect(response.headers['location']).toBe(`${BASE}/${row?.id}`);
    expect(row?.['createdBy']).toBe(USER.id);
  });

  it('13.1 never writes the tenant, the delete token or a shadow column', async () => {
    const app = await entityApp();
    const response = await app.server.inject({ method: 'POST', url: BASE, payload: valid() });
    expect(response.body).not.toMatch(/tenant|deletedToken|nameCmp|name_cmp/i);
  });

  it('SEC-04 refuses a field that the server owns, an unknown field and a bad value, and lists them', async () => {
    const app = await entityApp();
    const response = await app.server.inject({
      method: 'POST',
      url: BASE,
      payload: { name: '', tier: 'platinum', status: 'open', number: 'X', nope: 1 },
    });
    expect(response.statusCode).toBe(400);
    const errors = json(response.body).errors ?? [];
    expect(errors.map((issue) => issue.path).toSorted((a, b) => a.localeCompare(b))).toEqual(
      expect.arrayContaining(['body.code', 'body.name', 'body.tier', 'body.status', 'body.number', 'body.nope']),
    );
  });

  it('SCH-05 counts decomposed text as composed text, and saves it composed', async () => {
    const app = await entityApp();
    const decomposed = 'ế'.normalize('NFD').repeat(100);
    const response = await app.server.inject({ method: 'POST', url: BASE, payload: valid({ name: decomposed }) });
    expect(response.statusCode).toBe(201);
    expect(json(response.body).data?.['name']).toBe('ế'.repeat(100));
  });

  it('API-13 a duplicate unique value is a conflict the client can read', async () => {
    const app = await entityApp();
    const first = await create(app);
    const again = await app.server.inject({
      method: 'POST',
      url: BASE,
      payload: { code: String(first['code']), name: 'x' },
    });
    expect(again.statusCode).toBeGreaterThanOrEqual(400);
    expect(again.statusCode).toBeLessThan(500);
  });

  it('7.5 writes the event and the audit entry with the row, in one transaction', async () => {
    const app = await entityApp();
    const row = await create(app);
    const events = await app.db.fork().find(OutboxEntry, {});
    expect(events.map((event) => event.event)).toEqual(['crm.account.created']);
    expect(events[0]).toMatchObject({ entity: 'crm.Account', recordId: row.id, recordVersion: 1, tenant: TENANT });
    const audit = await app.db.fork().find(AuditLog, {});
    expect(audit[0]).toMatchObject({ action: 'crm.Account.create', recordId: row.id, actorId: USER.id });
  });
});

describe('13.1 get', () => {
  it('API-08 answers the row with an ETag that is its version', async () => {
    const app = await entityApp();
    const row = await create(app);
    const response = await app.server.inject({ method: 'GET', url: `${BASE}/${row.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers['etag']).toBe('W/"1"');
    expect(json(response.body).data).toMatchObject({ id: row.id, code: row['code'] });
  });

  it('API-08 answers 304 with no body when If-None-Match is the ETag, and a new body after a change', async () => {
    const app = await entityApp();
    const row = await create(app);
    const cached = await app.server.inject({
      method: 'GET',
      url: `${BASE}/${row.id}`,
      headers: { 'if-none-match': 'W/"1"' },
    });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe('');
    await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': 'W/"1"' },
      payload: { note: 'changed' },
    });
    const fresh = await app.server.inject({
      method: 'GET',
      url: `${BASE}/${row.id}`,
      headers: { 'if-none-match': 'W/"1"' },
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.headers['etag']).toBe('W/"2"');
  });

  it('13.1 a GET is not cached by shared caches unless the route says so', async () => {
    const app = await entityApp();
    const row = await create(app);
    expect((await app.server.inject({ method: 'GET', url: `${BASE}/${row.id}` })).headers['cache-control']).toBe(
      'private, no-cache',
    );
  });

  it('13.1 a row that does not exist, and an id that is not a UUID, are 404 and 400', async () => {
    const app = await entityApp();
    const missing = await app.server.inject({ method: 'GET', url: `${BASE}/0190f6b2-7c4e-7000-8000-0000000000ff` });
    expect(missing.statusCode).toBe(404);
    expect(json(missing.body).code).toBe('DATA_RECORD_NOT_FOUND');
    expect((await app.server.inject({ method: 'GET', url: `${BASE}/not-an-id` })).statusCode).toBe(400);
  });

  it('DATA-09 a row of another tenant is a 404', async () => {
    const app = await entityApp();
    const row = await create(app);
    const other = await entityAppOtherTenant(app);
    expect((await other.inject({ method: 'GET', url: `${BASE}/${row.id}` })).statusCode).toBe(404);
  });
});

/** A second server over the same database, whose caller belongs to another tenant. */
async function entityAppOtherTenant(app: EntityApp) {
  const { createHttpServer } = await import('./server.ts');
  const { registerEntityRoutes } = await import('./entity-routes.ts');
  const { TEST_ENV, OTHER_TENANT } = await import('./testing.ts');
  const server = createHttpServer(TEST_ENV, {
    authenticator: { authenticate: async () => USER },
    tenantResolver: { resolve: async () => OTHER_TENANT },
    authorizer: { can: async () => true },
  });
  registerEntityRoutes(server, app.schemas, { db: app.db });
  return server;
}

async function seeded(count = 12) {
  const app = await entityApp();
  const created: Record<string, unknown>[] = [];
  for (let n = 0; n < count; n += 1) {
    created.push(
      await create(app, {
        code: `K${String(n).padStart(2, '0')}`,
        name: n % 2 === 0 ? `Đường ${n}` : `Duong ${n}`,
        tier: (['basic', 'gold', 'vip'] as const)[n % 3],
        visits: n,
      }),
    );
  }
  return { app, created };
}

describe('13.1 list', () => {
  it('13.1 has data and meta, 25 rows to a page by default', async () => {
    const { app } = await seeded(30);
    const body = json((await app.server.inject({ method: 'GET', url: BASE })).body);
    expect(rows(body)).toHaveLength(25);
    expect(body.meta).toMatchObject({ pageSize: 25 });
    expect(typeof body.meta?.['nextCursor']).toBe('string');
    expect(body.meta).not.toHaveProperty('total');
  });

  it('DATA-06 takes pageSize, clamps it to 100, and walks the pages with the cursor', async () => {
    const { app } = await seeded(12);
    const first = json((await app.server.inject({ method: 'GET', url: `${BASE}?pageSize=5&sort=code` })).body);
    expect(rows(first).map((row) => row['code'])).toEqual(['K00', 'K01', 'K02', 'K03', 'K04']);
    const second = json(
      (
        await app.server.inject({
          method: 'GET',
          url: `${BASE}?pageSize=5&sort=code&cursor=${encodeURIComponent(String(first.meta?.['nextCursor']))}`,
        })
      ).body,
    );
    expect(rows(second).map((row) => row['code'])).toEqual(['K05', 'K06', 'K07', 'K08', 'K09']);
    const big = json((await app.server.inject({ method: 'GET', url: `${BASE}?pageSize=500` })).body);
    expect(big.meta?.['pageSize']).toBe(100);
  });

  it('13.1 takes a page number, and says which page it is', async () => {
    const { app } = await seeded(12);
    const body = json((await app.server.inject({ method: 'GET', url: `${BASE}?page=2&pageSize=5&sort=code` })).body);
    expect(rows(body).map((row) => row['code'])).toEqual(['K05', 'K06', 'K07', 'K08', 'K09']);
    expect(body.meta).toMatchObject({ page: 2, pageSize: 5 });
  });

  it('13.1 refuses a page that is too deep, and a page together with a cursor', async () => {
    const { app } = await seeded(3);
    const deep = await app.server.inject({ method: 'GET', url: `${BASE}?page=101&pageSize=100` });
    expect(deep.statusCode).toBe(400);
    expect(json(deep.body).code).toBe('HTTP_PAGE_TOO_DEEP');
    expect((await app.server.inject({ method: 'GET', url: `${BASE}?page=2&cursor=abc` })).statusCode).toBe(400);
  });

  it('DATA-11 counts the rows only when asked', async () => {
    const { app } = await seeded(12);
    expect(
      json((await app.server.inject({ method: 'GET', url: `${BASE}?pageSize=5&withTotal=true` })).body).meta,
    ).toMatchObject({ total: 12 });
  });

  it('13.1 sorts by several fields, a minus meaning descending', async () => {
    const { app } = await seeded(6);
    expect(await ids(app, 'sort=-visits')).toEqual(['K05', 'K04', 'K03', 'K02', 'K01', 'K00']);
    expect((await ids(app, 'sort=tier,-visits')).slice(0, 2)).toEqual(['K03', 'K00']);
  });

  it('13.1 filters with eq, ne, in, lt, lte, gt, gte and null', async () => {
    const { app } = await seeded(9);
    expect(await ids(app, 'filter[tier][eq]=gold&sort=code')).toEqual(['K01', 'K04', 'K07']);
    expect((await ids(app, 'filter[tier][ne]=gold&sort=code')).length).toBe(6);
    expect(await ids(app, 'filter[tier][in]=gold,vip&filter[visits][lt]=3&sort=code')).toEqual(['K01', 'K02']);
    expect(await ids(app, 'filter[visits][gte]=7&sort=code')).toEqual(['K07', 'K08']);
    expect(await ids(app, 'filter[visits][gt]=7&filter[visits][lte]=8')).toEqual(['K08']);
    expect((await ids(app, 'filter[email][null]=true')).length).toBe(9);
    expect(await ids(app, 'filter[email][null]=false')).toEqual([]);
  });

  it('DATA-21 filters a compared field without regard to case and accents', async () => {
    const { app } = await seeded(6);
    expect(await ids(app, `filter[name][eq]=${encodeURIComponent('DUONG 1')}`)).toEqual(['K01']);
    expect(await ids(app, `filter[name][eq]=${encodeURIComponent('đường 2')}`)).toEqual(['K02']);
  });

  it('DATA-07 a field without an index cannot be filtered or sorted by', async () => {
    const { app } = await seeded(3);
    const filtered = await app.server.inject({ method: 'GET', url: `${BASE}?filter[note][eq]=x` });
    expect(filtered.statusCode).toBe(400);
    expect(json(filtered.body).code).toBe('DATA_FIELD_NOT_INDEXED');
    expect((await app.server.inject({ method: 'GET', url: `${BASE}?sort=note` })).statusCode).toBe(400);
  });

  it('SEC-04 an operator or a parameter that does not exist is a validation error', async () => {
    const { app } = await seeded(3);
    for (const query of ['filter[tier][like]=a', 'filter[tier]=gold', 'qq=text', 'nope=1', 'pageSize=0', 'page=0']) {
      const response = await app.server.inject({ method: 'GET', url: `${BASE}?${query}` });
      expect([query, response.statusCode]).toEqual([query, 400]);
    }
  });

  it('13.1 reads a number and a boolean as what the field is, and refuses a value that is not one', async () => {
    const { app } = await seeded(3);
    expect(await ids(app, 'filter[visits][eq]=1')).toEqual(['K01']);
    expect((await app.server.inject({ method: 'GET', url: `${BASE}?filter[visits][eq]=abc` })).statusCode).toBe(400);
  });

  it('13.1 returns only the fields that were asked for, with id and version always', async () => {
    const { app } = await seeded(3);
    const body = json((await app.server.inject({ method: 'GET', url: `${BASE}?fields=code,tier` })).body);
    expect(Object.keys(rows(body)[0] ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'code',
      'id',
      'tier',
      'version',
    ]);
    expect((await app.server.inject({ method: 'GET', url: `${BASE}?fields=code,passwordHash` })).statusCode).toBe(400);
    expect(json((await app.server.inject({ method: 'GET', url: `${BASE}?fields=nope` })).body).code).toBe(
      'HTTP_FIELDS_INVALID',
    );
  });

  it('13.1 includes a to-one relation with the read shape of its row', async () => {
    const app = await entityApp();
    const person = json(
      (await app.server.inject({ method: 'POST', url: '/api/v1/crm/people', payload: { name: 'Ann' } })).body,
    ).data;
    await create(app, { ownerId: person?.id });
    const body = json((await app.server.inject({ method: 'GET', url: `${BASE}?include=owner` })).body);
    expect(rows(body)[0]?.['owner']).toMatchObject({ id: person?.id, name: 'Ann', version: 1 });
    expect(rows(body)[0]?.['ownerId']).toBe(person?.id);
    expect((await app.server.inject({ method: 'GET', url: `${BASE}?include=code` })).statusCode).toBe(400);
  });

  it('13.1 a relation that is included comes whole when the list asks for some fields only (UI-11)', async () => {
    const app = await entityApp();
    const person = json(
      (await app.server.inject({ method: 'POST', url: '/api/v1/crm/people', payload: { name: 'Ann' } })).body,
    ).data;
    await create(app, { ownerId: person?.id });
    const reply = await app.server.inject({ method: 'GET', url: `${BASE}?include=owner&fields=name,ownerId` });
    expect(`${String(reply.statusCode)} ${reply.body.slice(0, 200)}`).toMatch(/^200 /);
    const row = rows(json(reply.body))[0];
    expect(row).toMatchObject({ name: expect.any(String), ownerId: person?.id });
    expect(row?.['owner']).toMatchObject({ id: person?.id, name: 'Ann', version: 1 });
    expect(row).not.toHaveProperty('code');
  });

  it('PERF-04 the number of queries does not depend on the number of rows', async () => {
    const few = await queriesFor(5);
    const many = await queriesFor(40);
    expect(many).toBe(few);
    expect(many).toBeLessThanOrEqual(3);
  });

  it('API-08 a list has an ETag too, and answers 304 when it did not change', async () => {
    const { app } = await seeded(3);
    const first = await app.server.inject({ method: 'GET', url: BASE });
    const etag = String(first.headers['etag']);
    expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect((await app.server.inject({ method: 'GET', url: BASE, headers: { 'if-none-match': etag } })).statusCode).toBe(
      304,
    );
    expect(
      (await app.server.inject({ method: 'GET', url: BASE, headers: { 'if-none-match': 'W/"other", *' } })).statusCode,
    ).toBe(304);
    await create(app);
    expect((await app.server.inject({ method: 'GET', url: BASE, headers: { 'if-none-match': etag } })).statusCode).toBe(
      200,
    );
  });

  it('DATA-16 does not list a soft deleted row', async () => {
    const { app, created } = await seeded(3);
    await app.server.inject({
      method: 'DELETE',
      url: `${BASE}/${String(created[0]?.['id'])}`,
      headers: { 'if-match': '1' },
    });
    expect((await ids(app, 'sort=code')).length).toBe(2);
  });
});

async function queriesFor(count: number): Promise<number> {
  const app = await entityApp();
  const person = json(
    (await app.server.inject({ method: 'POST', url: '/api/v1/crm/people', payload: { name: 'Ann' } })).body,
  ).data;
  for (let n = 0; n < count; n += 1) await create(app, { ownerId: person?.id });
  app.queries.length = 0;
  const response = await app.server.inject({ method: 'GET', url: `${BASE}?include=owner&pageSize=100` });
  expect(rows(json(response.body))).toHaveLength(count);
  return app.queries.length;
}

describe('13.1 update', () => {
  it('API-13 changes the fields that were sent and raises the version, with If-Match', async () => {
    const app = await entityApp();
    const row = await create(app, { visits: 3 });
    const response = await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': 'W/"1"' },
      payload: { visits: 4, note: 'hello' },
    });
    expect(response.statusCode).toBe(200);
    expect(json(response.body).data).toMatchObject({ version: 2, visits: 4, note: 'hello', code: row['code'] });
    const events = await app.db.fork().find(OutboxEntry, { event: 'crm.account.updated' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ recordVersion: 2 });
  });

  it('API-13 accepts the version as the ETag with or without W/ and quotes, and as a bare number', async () => {
    const app = await entityApp();
    const row = await create(app);
    for (const [index, header] of ['W/"1"', '"2"', '3'].entries()) {
      const response = await app.server.inject({
        method: 'PATCH',
        url: `${BASE}/${row.id}`,
        headers: { 'if-match': header },
        payload: { visits: index + 1 },
      });
      expect([header, response.statusCode]).toEqual([header, 200]);
    }
  });

  it('API-13 refuses an update without If-Match: 428', async () => {
    const app = await entityApp();
    const row = await create(app);
    const response = await app.server.inject({ method: 'PATCH', url: `${BASE}/${row.id}`, payload: { visits: 1 } });
    expect(response.statusCode).toBe(428);
    expect(json(response.body).code).toBe('HTTP_PRECONDITION_REQUIRED');
  });

  it('API-13 a stale version is 412 with the current row in the problem, and nothing changes', async () => {
    const app = await entityApp();
    const row = await create(app);
    await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': '1' },
      payload: { visits: 9 },
    });
    const stale = await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': '1' },
      payload: { visits: 1 },
    });
    expect(stale.statusCode).toBe(412);
    const problem = json(stale.body);
    expect(problem.code).toBe('DATA_VERSION_STALE');
    expect(problem.current).toMatchObject({ id: row.id, version: 2, visits: 9 });
    expect((await app.server.inject({ method: 'GET', url: `${BASE}/${row.id}` })).headers['etag']).toBe('W/"2"');
  });

  it('API-13 a value that is not a version is 400', async () => {
    const app = await entityApp();
    const row = await create(app);
    const response = await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': 'abc' },
      payload: { visits: 1 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('SEC-04 an empty update, a field that the server owns and a state are refused', async () => {
    const app = await entityApp();
    const row = await create(app);
    for (const payload of [{}, { status: 'open' }, { number: 'X' }, { id: row.id }]) {
      const response = await app.server.inject({
        method: 'PATCH',
        url: `${BASE}/${row.id}`,
        headers: { 'if-match': '1' },
        payload,
      });
      expect([JSON.stringify(payload), response.statusCode]).toEqual([JSON.stringify(payload), 400]);
    }
  });

  it('13.1 an update of a row that does not exist is 404, and of another tenant too', async () => {
    const app = await entityApp();
    const row = await create(app);
    const missing = await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/0190f6b2-7c4e-7000-8000-0000000000ff`,
      headers: { 'if-match': '1' },
      payload: { visits: 1 },
    });
    expect(missing.statusCode).toBe(404);
    const other = await entityAppOtherTenant(app);
    expect(
      (
        await other.inject({
          method: 'PATCH',
          url: `${BASE}/${row.id}`,
          headers: { 'if-match': '1' },
          payload: { visits: 1 },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('DATA-21 a rename updates the folded column, so a filter finds the new name', async () => {
    const app = await entityApp();
    const row = await create(app, { name: 'Old' });
    await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': '1' },
      payload: { name: 'Đổi Tên' },
    });
    expect((await ids(app, `filter[name][eq]=${encodeURIComponent('doi ten')}`)).length).toBe(1);
  });
});

describe('13.1 delete', () => {
  it('DATA-16 a delete of an entity with soft delete answers 204 and hides the row', async () => {
    const app = await entityApp();
    const row = await create(app);
    const response = await app.server.inject({
      method: 'DELETE',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': '1' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await app.server.inject({ method: 'GET', url: `${BASE}/${row.id}` })).statusCode).toBe(404);
    expect((await app.db.fork().find(OutboxEntry, { event: 'crm.account.deleted' })).length).toBe(1);
  });

  it('13.1 a delete of an entity without soft delete removes the row', async () => {
    const app = await entityApp();
    const id = await seedNote(app);
    const response = await app.server.inject({
      method: 'DELETE',
      url: `/api/v1/crm/notes/${id}`,
      headers: { 'if-match': '1' },
    });
    expect(response.statusCode).toBe(204);
    expect((await app.server.inject({ method: 'GET', url: `/api/v1/crm/notes/${id}` })).statusCode).toBe(404);
    expect(await app.db.fork().count(noteSchema(app))).toBe(0);
  });

  it('API-13 a delete without If-Match is 428, and with a stale version 412', async () => {
    const app = await entityApp();
    const row = await create(app);
    expect((await app.server.inject({ method: 'DELETE', url: `${BASE}/${row.id}` })).statusCode).toBe(428);
    await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${row.id}`,
      headers: { 'if-match': '1' },
      payload: { visits: 1 },
    });
    expect(
      (await app.server.inject({ method: 'DELETE', url: `${BASE}/${row.id}`, headers: { 'if-match': '1' } }))
        .statusCode,
    ).toBe(412);
  });

  it('13.1 a delete of a row that does not exist is 404', async () => {
    const app = await entityApp();
    const response = await app.server.inject({
      method: 'DELETE',
      url: `${BASE}/0190f6b2-7c4e-7000-8000-0000000000ff`,
      headers: { 'if-match': '1' },
    });
    expect(response.statusCode).toBe(404);
  });
});
