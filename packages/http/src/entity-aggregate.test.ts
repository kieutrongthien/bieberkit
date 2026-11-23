/**
 * BieberKit
 *
 * @file        packages/http/src/entity-aggregate.test.ts
 * @description Tests of the aggregate route of an entity: groups, counts and sums of the fields that were declared aggregatable (API-15).
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
import { entityApp, USER } from './entity-app.ts';
import type { EntityApp } from './entity-app.ts';
import { createHttpServer } from './server.ts';
import { registerEntityRoutes } from './entity-routes.ts';
import { OTHER_TENANT, TEST_ENV } from './testing.ts';

const BASE = '/api/v1/crm/accounts';

interface Body {
  data?: { group: Record<string, unknown>; count?: number; sum?: Record<string, unknown> }[];
  meta?: Record<string, unknown>;
  code?: string;
}
const json = (text: string): Body => JSON.parse(text);
const oneOf = (text: string): { data: { id: string } } => JSON.parse(text);
const manyOf = (text: string): { data: { id: string }[] } => JSON.parse(text);

let seq = 0;
async function seeded(app: EntityApp, rows: Record<string, unknown>[]): Promise<void> {
  for (const row of rows) {
    seq += 1;
    const response = await app.server.inject({
      method: 'POST',
      url: BASE,
      payload: { code: `AG${seq}`, name: `Acc ${seq}`, ...row },
    });
    expect(response.statusCode).toBe(201);
  }
}

async function demo(): Promise<EntityApp> {
  const app = await entityApp();
  await seeded(app, [
    { tier: 'gold', visits: 3, credit: '10.50' },
    { tier: 'gold', visits: 5, credit: '4.25' },
    { tier: 'vip', visits: 7 },
    { tier: 'basic', visits: 0 },
    { tier: 'basic', visits: 1, credit: '1.00' },
  ]);
  return app;
}

const get = (app: EntityApp, query: string) =>
  app.server.inject({ method: 'GET', url: `${BASE}/aggregate${query === '' ? '' : `?${query}`}` });

describe('API-15 the aggregate route', () => {
  it('API-15 counts all the rows when it gets no parameter', async () => {
    const response = await get(await demo(), '');
    expect(response.statusCode).toBe(200);
    expect(json(response.body).data).toEqual([{ group: {}, count: 5 }]);
  });

  it('API-15 counts by group, in a fixed order', async () => {
    const body = json((await get(await demo(), 'groupBy=tier&count=true')).body);
    expect(body.data).toEqual([
      { group: { tier: 'basic' }, count: 2 },
      { group: { tier: 'gold' }, count: 2 },
      { group: { tier: 'vip' }, count: 1 },
    ]);
    expect(body.meta).toEqual({ groupBy: ['tier'], sum: [], count: true });
  });

  it('API-15 sums an integer and a decimal by group', async () => {
    const body = json((await get(await demo(), 'groupBy=tier&sum=visits,credit')).body);
    expect(body.data).toEqual([
      { group: { tier: 'basic' }, sum: { visits: 1, credit: '1.00' } },
      { group: { tier: 'gold' }, sum: { visits: 8, credit: '14.75' } },
      { group: { tier: 'vip' }, sum: { visits: 7, credit: null } },
    ]);
  });

  it('API-15 groups by a relation with the key of the API, and gives the id', async () => {
    const app = await entityApp();
    const person = oneOf(
      (await app.server.inject({ method: 'POST', url: '/api/v1/crm/people', payload: { name: 'Ann' } })).body,
    );
    await seeded(app, [{ ownerId: person.data.id }, { ownerId: person.data.id }, {}]);
    const body = json((await get(app, 'groupBy=ownerId')).body);
    expect(body.data).toEqual([
      { group: { ownerId: null }, count: 1 },
      { group: { ownerId: person.data.id }, count: 2 },
    ]);
  });

  it('API-15 applies the filters of a list', async () => {
    const body = json((await get(await demo(), 'groupBy=tier&filter[tier][in]=gold,vip&filter[visits][gte]=5')).body);
    expect(body.data).toEqual([
      { group: { tier: 'gold' }, count: 1 },
      { group: { tier: 'vip' }, count: 1 },
    ]);
    expect((await get(await demo(), 'filter[note][eq]=x')).statusCode).toBe(400);
  });

  it('API-15 refuses a field that is not declared aggregatable, a unknown field and a sum of the wrong kind', async () => {
    const app = await demo();
    for (const query of [
      'groupBy=code',
      'groupBy=nope',
      'sum=tier',
      'sum=code',
      'groupBy=tier,tier',
      'groupBy=tier,visits,ownerId,active',
    ]) {
      const response = await get(app, query);
      expect([query, response.statusCode]).toEqual([query, 400]);
    }
    expect(json((await get(app, 'groupBy=code')).body).code).toBe('DATA_AGGREGATE_INVALID');
  });

  it('SEC-04 refuses a parameter that does not exist', async () => {
    const app = await demo();
    for (const query of ['nope=1', 'pageSize=5', 'groupBy=tier;drop', 'count=maybe']) {
      expect([query, (await get(app, query)).statusCode]).toEqual([query, 400]);
    }
  });

  it('API-15 asks for the permission to read a field that has a mask, and for nothing else', async () => {
    const app = await entityApp({
      authorizer: { can: async (_p, permission) => permission !== 'crm.account.read-visits' },
    });
    await seeded(app, [{ tier: 'gold' }]);
    expect((await get(app, 'groupBy=tier')).statusCode).toBe(200);
    for (const query of ['sum=visits', 'groupBy=visits']) {
      const response = await get(app, query);
      expect([query, response.statusCode]).toEqual([query, 403]);
    }
  });

  it('API-15 needs the permission to read the entity', async () => {
    const app = await entityApp({ authorizer: { can: async () => false } });
    expect((await get(app, '')).statusCode).toBe(403);
  });

  it('DATA-09 counts the rows of the tenant of the caller only', async () => {
    const app = await demo();
    const other = createHttpServer(TEST_ENV, {
      authenticator: { authenticate: async () => USER },
      tenantResolver: { resolve: async () => OTHER_TENANT },
      authorizer: { can: async () => true },
    });
    registerEntityRoutes(other, app.schemas, { db: app.db });
    const response = await other.inject({ method: 'GET', url: `${BASE}/aggregate` });
    expect(json(response.body).data).toEqual([{ group: {}, count: 0 }]);
  });

  it('DATA-16 does not count a row that was deleted', async () => {
    const app = await demo();
    const first = manyOf((await app.server.inject({ method: 'GET', url: `${BASE}?sort=code&pageSize=1` })).body);
    await app.server.inject({ method: 'DELETE', url: `${BASE}/${first.data[0]?.id}`, headers: { 'if-match': '1' } });
    expect(json((await get(app, '')).body).data).toEqual([{ group: {}, count: 4 }]);
  });

  it('API-08 has an ETag, and answers 304 when nothing changed', async () => {
    const app = await demo();
    const first = await get(app, 'groupBy=tier');
    const again = await app.server.inject({
      method: 'GET',
      url: `${BASE}/aggregate?groupBy=tier`,
      headers: { 'if-none-match': String(first.headers['etag']) },
    });
    expect(again.statusCode).toBe(304);
  });

  it('API-15 an entity with no aggregatable field has no aggregate route', async () => {
    const app = await demo();
    expect((await app.server.inject({ method: 'GET', url: '/api/v1/crm/notes/aggregate' })).statusCode).toBe(400);
  });

  it('API-15 does not take the place of a row called aggregate: a get of an id still works', async () => {
    const app = await demo();
    const first = manyOf((await app.server.inject({ method: 'GET', url: `${BASE}?pageSize=1` })).body);
    expect((await app.server.inject({ method: 'GET', url: `${BASE}/${first.data[0]?.id}` })).statusCode).toBe(200);
  });

  it('API-06 is in the OpenAPI document, with its parameters', async () => {
    const { openApiDocument } = await import('./openapi.ts');
    const app = await demo();
    const doc: { paths: Record<string, Record<string, { parameters?: { name: string }[] }>> } = JSON.parse(
      JSON.stringify(openApiDocument(app.server.routes(), { title: 't', version: '1' })),
    );
    const names = (doc.paths[`${BASE}/aggregate`]?.['get']?.parameters ?? []).map((parameter) => parameter.name);
    expect(names).toEqual(expect.arrayContaining(['groupBy', 'sum', 'count', 'filter']));
  });
});

describe('META-02 the metadata says which fields can be aggregated', () => {
  it('META-02 marks the fields that were declared aggregatable', async () => {
    const { registerMeta } = await import('./meta.ts');
    const { Account, Hidden, Note, Person } = await import('./entity-app.ts');
    const app = await entityApp();
    registerMeta(app.server, [Person, Account, Note, Hidden]);
    const meta: { entities: { name: string; fields: { key: string; aggregatable?: boolean }[] }[] } = JSON.parse(
      (await app.server.inject({ method: 'GET', url: '/api/v1/_meta' })).body,
    );
    const account = meta.entities.find((entity) => entity.name === 'crm.Account');
    const flagged = (account?.fields ?? [])
      .filter((field) => field.aggregatable === true)
      .map((field) => field.key)
      .toSorted((a, b) => a.localeCompare(b));
    expect(flagged).toEqual(['credit', 'ownerId', 'tier', 'visits']);
  });
});
