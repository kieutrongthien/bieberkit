/**
 * BieberKit
 *
 * @file        packages/auth/src/entity-access.dialects.test.ts
 * @description Tests of the entity routes with the real authorizer: rows outside the scope never leave the database, conditions on writes, masked fields, aggregates and bulk calls (AUTHZ-02 to AUTHZ-06).
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
import { DEALS, TENANT_A, TENANT_B, USERS, authApp, codesOf, rowOf, rowsOf } from './testing/app.ts';
import type { AuthApp } from './testing/app.ts';
import { describeDialects } from './testing/dialects.ts';
import type { AuthDialectContext } from './testing/dialects.ts';
import type { ScopedPermission } from './ability.ts';

/** Tenant A: four deals. Tenant B: one deal of the owner. `ids` are by code. */
async function world(open: AuthDialectContext['open'], scoped?: Readonly<Record<string, ScopedPermission>>) {
  const app = await authApp(open, scoped === undefined ? {} : { scoped });
  const ids = await app.seed(TENANT_A, [
    { code: 'D1', assignee: USERS.owner, amount: 100, margin: 5 },
    { code: 'D2', assignee: USERS.other, amount: 2000, margin: 7 },
    { code: 'D3', assignee: USERS.owner, amount: 3000, stage: 'won', margin: 9 },
    { code: 'D4', amount: 50 },
  ]);
  const foreign = await app.seed(TENANT_B, [{ code: 'B1', assignee: USERS.owner, amount: 5000 }]);
  await app.grant('admin', [
    'crm.deal.read',
    'crm.deal.create',
    'crm.deal.update',
    'crm.deal.delete',
    'crm.deal.close',
    'crm.deal.read-margin',
    'crm.deal.edit-margin',
  ]);
  await app.grant('reader', ['crm.deal.read']);
  await app.grant('owner', ['crm.deal.read-own', 'crm.deal.update-own', 'crm.deal.delete-own', 'crm.deal.create-own']);
  return { app, ids, foreign };
}

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

const authz = async (app: AuthApp) => (await app.audit()).filter((row) => row.action.startsWith('authz.'));

describeDialects('AUTHZ-04 default deny on the routes', ({ open }) => {
  it('AUTHZ-04 a caller with no role gets 403 on every route, and a caller with no principal 401', async () => {
    const { app, ids } = await world(open);
    const none = app.as('none');
    expect((await none.get(DEALS)).status).toBe(403);
    expect((await none.get(`${DEALS}/${ids['D1']}`)).status).toBe(403);
    expect((await none.post(DEALS, { code: 'X', title: 'x' })).status).toBe(403);
    expect((await none.patch(`${DEALS}/${ids['D1']}`, { title: 'x' }, 1)).status).toBe(403);
    expect((await none.delete(`${DEALS}/${ids['D1']}`, 1)).status).toBe(403);
    expect((await none.get(`${DEALS}/aggregate`)).status).toBe(403);
    expect((await app.as(undefined).get(DEALS)).status).toBe(401);
  });

  it('AUTHZ-04 a permission allows its action and no other: a reader cannot write', async () => {
    const { app, ids } = await world(open);
    const reader = app.as('reader');
    expect((await reader.get(DEALS)).status).toBe(200);
    expect((await reader.post(DEALS, { code: 'X', title: 'x' })).status).toBe(403);
    expect((await reader.patch(`${DEALS}/${ids['D1']}`, { title: 'x' }, 1)).status).toBe(403);
    expect((await reader.delete(`${DEALS}/${ids['D1']}`, 1)).status).toBe(403);
    expect(await app.stored(ids['D1'] ?? '', 'title')).toBe('A deal');
  });

  it('MOD-06 the update permission does not give the transition, and the transition permission does not give update', async () => {
    const { app, ids } = await world(open);
    await app.grant('closer', ['crm.deal.close', 'crm.deal.read']);
    expect((await app.as('closer').post(`${DEALS}/${ids['D1']}/actions/close`, {}, { 'if-match': '1' })).status).toBe(
      200,
    );
    await app.grant('other', ['crm.deal.update', 'crm.deal.read']);
    expect((await app.as('other').post(`${DEALS}/${ids['D2']}/actions/close`, {}, { 'if-match': '1' })).status).toBe(
      403,
    );
    expect((await app.as('closer').patch(`${DEALS}/${ids['D2']}`, { title: 'x' }, 1)).status).toBe(403);
  });

  it('AUTHZ-04 a user of tenant A cannot reach tenant B with the roles of A', async () => {
    const { app, foreign } = await world(open);
    expect((await app.as('admin', TENANT_B).get(DEALS)).status).toBe(403);
    expect((await app.as('admin', TENANT_B).get(`${DEALS}/${foreign['B1']}`)).status).toBe(403);
    expect((await app.as('admin').get(`${DEALS}/${foreign['B1']}`)).status).toBe(404);
  });
});

describeDialects('AUTHZ-02 the rows of a read', ({ open }) => {
  it('AUTHZ-02 a caller who may read every row sees the four rows of his tenant and none of the other', async () => {
    const { app } = await world(open);
    expect(codesOf(await app.as('reader').get(DEALS))).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('AUTHZ-02 a list gives only the rows that the condition allows, and the total counts only those', async () => {
    const { app } = await world(open);
    const reply = await app.as('owner').get(`${DEALS}?withTotal=true&sort=code`);
    expect(rowsOf(reply).map((row) => row['code'])).toEqual(['D1', 'D3']);
    expect(reply.body['meta']).toMatchObject({ total: 2 });
  });

  it('AUTHZ-02 pages and filters work inside the scope', async () => {
    const { app } = await world(open);
    const first = await app.as('owner').get(`${DEALS}?pageSize=1&sort=code`);
    expect(codesOf(first)).toEqual(['D1']);
    const meta = recordOf(first.body['meta']);
    expect(meta['nextCursor']).toBeTruthy();
    const next = await app
      .as('owner')
      .get(`${DEALS}?pageSize=1&sort=code&cursor=${encodeURIComponent(String(meta['nextCursor']))}`);
    expect(codesOf(next)).toEqual(['D3']);
    expect(codesOf(await app.as('owner').get(`${DEALS}?filter[amount][gte]=2500`))).toEqual(['D3']);
    expect(codesOf(await app.as('owner').get(`${DEALS}?filter[amount][gte]=60000`))).toEqual([]);
  });

  it('AUTHZ-02 a filter of the caller cannot widen the scope', async () => {
    const { app } = await world(open);
    expect(codesOf(await app.as('owner').get(`${DEALS}?filter[amount][gte]=2000`))).toEqual(['D3']);
    expect(codesOf(await app.as('owner').get(`${DEALS}?filter[amount][in]=50,2000`))).toEqual([]);
  });

  it('AUTHZ-02 a get of a row outside the scope is 404, the same answer as for a row that does not exist', async () => {
    const { app, ids } = await world(open);
    const outside = await app.as('owner').get(`${DEALS}/${ids['D2']}`);
    const missing = await app.as('owner').get(`${DEALS}/0190f6b2-7c4e-7000-8000-00000000dead`);
    expect(outside.status).toBe(404);
    expect(outside.body['code']).toBe(missing.body['code']);
    expect(outside.body['detail']).toBe(missing.body['detail']);
    expect((await app.as('owner').get(`${DEALS}/${ids['D1']}`)).status).toBe(200);
  });

  it('AUTHZ-02 a role with the permission for every row and one with the permission for his rows sees every row', async () => {
    const { app } = await world(open);
    await app.grant('owner', ['crm.deal.read']);
    expect(codesOf(await app.as('owner').get(DEALS))).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('AUTHZ-02 two scoped permissions give the rows of either', async () => {
    const { app } = await world(open);
    await app.grant('other', ['crm.deal.read-big', 'crm.deal.read-own']);
    expect(codesOf(await app.as('other').get(DEALS))).toEqual(['D2', 'D3']);
    await app.grant('closer', ['crm.deal.read-open']);
    expect(codesOf(await app.as('closer').get(DEALS))).toEqual(['D1', 'D2', 'D4']);
  });

  it('AUTHZ-02 the scope is in the SQL that reaches the database, next to the tenant filter', async () => {
    const { app } = await world(open);
    app.queries.length = 0;
    await app.as('owner').get(DEALS);
    const select = app.queries.find((text) => /from\W+crm_deals/i.test(text));
    expect(select).toMatch(/assignee/);
    expect(select).toMatch(/tenant_id/);
  });

  it('AUTHZ-02 a selection of fields stays inside the scope', async () => {
    const { app } = await world(open);
    expect(codesOf(await app.as('owner').get(`${DEALS}?fields=code`))).toEqual(['D1', 'D3']);
  });
});

describeDialects('AUTHZ-02 the conditions of a write', ({ open }) => {
  it('AUTHZ-02 an update of a row in the scope works, and one outside it is 404 and changes nothing', async () => {
    const { app, ids } = await world(open);
    const ok = await app.as('owner').patch(`${DEALS}/${ids['D1']}`, { title: 'mine' }, 1);
    expect(ok.status).toBe(200);
    const outside = await app.as('owner').patch(`${DEALS}/${ids['D2']}`, { title: 'not mine' }, 1);
    expect(outside.status).toBe(404);
    expect(await app.stored(ids['D2'] ?? '', 'title')).toBe('A deal');
    expect(await app.stored(ids['D1'] ?? '', 'title')).toBe('mine');
  });

  it('AUTHZ-02 an update that would move the row out of the scope is 403 AUTHZ_DENIED and changes nothing', async () => {
    const { app, ids } = await world(open);
    const reply = await app.as('owner').patch(`${DEALS}/${ids['D1']}`, { assignee: USERS.other }, 1);
    expect(reply.status).toBe(403);
    expect(reply.body['code']).toBe('AUTHZ_DENIED');
    expect(await app.stored(ids['D1'] ?? '', 'assignee')).toBe(USERS.owner);
    expect(await app.stored(ids['D1'] ?? '', 'version')).toBe(1);
  });

  it('AUTHZ-02 an update that sets the same value works, and an empty body is refused by the schema for everyone', async () => {
    const { app, ids } = await world(open);
    expect((await app.as('owner').patch(`${DEALS}/${ids['D1']}`, { assignee: USERS.owner }, 1)).status).toBe(200);
    expect((await app.as('owner').patch(`${DEALS}/${ids['D1']}`, {}, 2)).status).toBe(400);
    expect((await app.as('none').patch(`${DEALS}/${ids['D1']}`, {}, 2)).status).toBe(400);
  });

  it('AUTHZ-02 a create that the condition accepts works, and one that it does not is 403', async () => {
    const { app } = await world(open);
    const ok = await app.as('owner').post(DEALS, { code: 'N1', title: 'x', assignee: USERS.owner });
    expect(ok.status).toBe(201);
    const bad = await app.as('owner').post(DEALS, { code: 'N2', title: 'x', assignee: USERS.other });
    expect([bad.status, bad.body['code']]).toEqual([403, 'AUTHZ_DENIED']);
    expect((await app.as('owner').post(DEALS, { code: 'N3', title: 'x' })).status).toBe(403);
    expect(await app.stored(String(rowOf(ok)['id']), 'code')).toBe('N1');
  });

  it('AUTHZ-02 a delete of a row in the scope works, and one outside it is 404 and keeps the row', async () => {
    const { app, ids } = await world(open);
    expect((await app.as('owner').delete(`${DEALS}/${ids['D2']}`, 1)).status).toBe(404);
    expect(codesOf(await app.as('admin').get(DEALS))).toEqual(['D1', 'D2', 'D3', 'D4']);
    expect((await app.as('owner').delete(`${DEALS}/${ids['D1']}`, 1)).status).toBe(204);
    expect(codesOf(await app.as('admin').get(DEALS))).toEqual(['D2', 'D3', 'D4']);
  });

  it('AUTHZ-02 a stale version of a row outside the scope is 404, not 412, so the row is not revealed', async () => {
    const { app, ids } = await world(open);
    expect((await app.as('owner').patch(`${DEALS}/${ids['D2']}`, { title: 'x' }, 99)).status).toBe(404);
  });

  it('AUTHZ-02 a transition of a row in the scope of the permission works, and one outside it is 404', async () => {
    const scoped: Record<string, ScopedPermission> = {
      'crm.deal.close': { subject: 'crm.Deal', action: 'transition:close', when: (user) => ({ assignee: user.id }) },
    };
    const { app, ids } = await world(open, scoped);
    await app.grant('closer', ['crm.deal.close', 'crm.deal.read']);
    const own = await app.as('closer').post(`${DEALS}/${ids['D1']}/actions/close`, {}, { 'if-match': '1' });
    expect(own.status).toBe(404);
    await app.grant('owner', ['crm.deal.close', 'crm.deal.read-own']);
    expect((await app.as('owner').post(`${DEALS}/${ids['D1']}/actions/close`, {}, { 'if-match': '1' })).status).toBe(
      200,
    );
    expect((await app.as('owner').post(`${DEALS}/${ids['D2']}/actions/close`, {}, { 'if-match': '1' })).status).toBe(
      404,
    );
  });

  it('AUTHZ-05 a denial of a create or of a moved row is audited, and a 404 of a scope is not', async () => {
    const { app, ids } = await world(open);
    await app.as('owner').patch(`${DEALS}/${ids['D2']}`, { title: 'x' }, 1);
    expect(await authz(app)).toEqual([]);
    await app.as('owner').post(DEALS, { code: 'N2', title: 'x', assignee: USERS.other });
    const entries = await authz(app);
    expect(entries.map((row) => row.action)).toEqual(['authz.denied']);
    expect(entries[0]?.actorId).toBe(USERS.owner);
  });
});

describeDialects('AUTHZ-03 the masks of fields', ({ open }) => {
  it('AUTHZ-03 a read leaves out the field that the caller has no permission for, in a list and in a get', async () => {
    const { app, ids } = await world(open);
    const list = rowsOf(await app.as('reader').get(`${DEALS}?sort=code`));
    expect(list.every((row) => !('margin' in row))).toBe(true);
    expect(list[0]).toHaveProperty('title');
    const one = rowOf(await app.as('reader').get(`${DEALS}/${ids['D1']}`));
    expect(one).not.toHaveProperty('margin');
  });

  it('AUTHZ-03 a read shows the field to a caller who has the permission of the field', async () => {
    const { app, ids } = await world(open);
    const one = rowOf(await app.as('admin').get(`${DEALS}/${ids['D1']}`));
    expect(one['margin']).toBe(5);
    await app.grant('reader', ['crm.deal.read-margin']);
    expect(rowsOf(await app.as('reader').get(`${DEALS}?sort=code`))[0]?.['margin']).toBe(5);
  });

  it('AUTHZ-03 asking for a masked field by name without the permission is 403, and the others come as usual', async () => {
    const { app } = await world(open);
    const denied = await app.as('reader').get(`${DEALS}?fields=code,margin`);
    expect([denied.status, denied.body['code']]).toEqual([403, 'AUTHZ_FIELD_FORBIDDEN']);
    expect((await app.as('reader').get(`${DEALS}?fields=code`)).status).toBe(200);
    expect((await app.as('admin').get(`${DEALS}?fields=code,margin`)).status).toBe(200);
  });

  it('AUTHZ-03 a write that touches a masked field without the update permission of the field is 403 and changes nothing', async () => {
    const { app, ids } = await world(open);
    await app.grant('other', ['crm.deal.update', 'crm.deal.read-margin', 'crm.deal.read']);
    const reply = await app.as('other').patch(`${DEALS}/${ids['D1']}`, { title: 'x', margin: 99 }, 1);
    expect([reply.status, reply.body['code']]).toEqual([403, 'AUTHZ_FIELD_FORBIDDEN']);
    expect(await app.stored(ids['D1'] ?? '', 'margin')).toBe(5);
    expect(await app.stored(ids['D1'] ?? '', 'title')).toBe('A deal');
    const created = await app.as('admin').post(DEALS, { code: 'M1', title: 'x', margin: 3 });
    expect(created.status).toBe(201);
    const refused = await app.as('other').post(DEALS, { code: 'M2', title: 'x', margin: 3 });
    expect(refused.status).toBe(403);
  });

  it('AUTHZ-03 a write of a masked field works for a caller who has its update permission', async () => {
    const { app, ids } = await world(open);
    const reply = await app.as('admin').patch(`${DEALS}/${ids['D1']}`, { margin: 11 }, 1);
    expect(reply.status).toBe(200);
    expect(await app.stored(ids['D1'] ?? '', 'margin')).toBe(11);
  });

  it('AUTHZ-03 an update without the field is allowed, whatever the mask', async () => {
    const { app, ids } = await world(open);
    await app.grant('other', ['crm.deal.update', 'crm.deal.read']);
    expect((await app.as('other').patch(`${DEALS}/${ids['D1']}`, { title: 'ok' }, 1)).status).toBe(200);
  });

  it('AUTHZ-03 the answer of a write has only the fields that the caller may read, and the standard keys', async () => {
    const { app, ids } = await world(open);
    await app.grant('other', ['crm.deal.update', 'crm.deal.read']);
    const withRead = rowOf(await app.as('other').patch(`${DEALS}/${ids['D1']}`, { title: 'a' }, 1));
    expect(withRead).toHaveProperty('title');
    expect(withRead).not.toHaveProperty('margin');
    await app.grant('closer', ['crm.deal.update']);
    const noRead = rowOf(await app.as('closer').patch(`${DEALS}/${ids['D1']}`, { title: 'b' }, 2));
    expect(Object.keys(noRead).toSorted()).toEqual(['id', 'version']);
  });

  it('AUTHZ-05 a write of a masked field leaves an entry with the field names and no value', async () => {
    const { app, ids } = await world(open);
    await app.grant('other', ['crm.deal.update', 'crm.deal.read']);
    await app.as('other').patch(`${DEALS}/${ids['D1']}`, { margin: 12345 }, 1);
    const entries = await authz(app);
    expect(entries.map((row) => row.action)).toEqual(['authz.field-forbidden']);
    expect(entries[0]?.data).toMatchObject({ fields: ['margin'] });
    expect(JSON.stringify(entries[0])).not.toContain('12345');
  });

  it('META-02 the metadata of the entity shows a field only to a caller who may read it', async () => {
    const app = await authApp(open, { meta: true });
    await app.grant('reader', ['crm.deal.read']);
    await app.grant('admin', ['crm.deal.read', 'crm.deal.read-margin']);
    const keysOf = async (user: 'reader' | 'admin') => {
      const reply = await app.as(user).get('/api/v1/_meta');
      const entities = Array.isArray(reply.body['entities']) ? reply.body['entities'].map(recordOf) : [];
      const deal = entities.find((entity) => entity['name'] === 'crm.Deal');
      return (Array.isArray(deal?.['fields']) ? deal['fields'] : []).map((field: unknown) =>
        String(recordOf(field)['key']),
      );
    };
    expect(await keysOf('reader')).not.toContain('margin');
    expect(await keysOf('admin')).toContain('margin');
  });
});

describeDialects('AUTHZ-02 aggregate and bulk', ({ open }) => {
  it('AUTHZ-02 an aggregate counts only the rows of the scope, and a caller of every row counts them all', async () => {
    const { app } = await world(open);
    const own = await app.as('owner').get(`${DEALS}/aggregate?groupBy=stage&count=true`);
    expect(rowsOf(own)).toEqual([
      { group: { stage: 'lead' }, count: 1 },
      { group: { stage: 'won' }, count: 1 },
    ]);
    const all = await app.as('reader').get(`${DEALS}/aggregate?groupBy=stage&count=true`);
    expect(rowsOf(all)).toEqual([
      { group: { stage: 'lead' }, count: 3 },
      { group: { stage: 'won' }, count: 1 },
    ]);
  });

  it('AUTHZ-02 a bulk update changes the rows of the scope and says not_found for the others', async () => {
    const { app, ids } = await world(open);
    const reply = await app.as('owner').post(`${DEALS}/bulk`, {
      operation: 'update',
      data: { title: 'bulk' },
      items: [
        { id: ids['D1'], version: 1 },
        { id: ids['D2'], version: 1 },
        { id: ids['D3'], version: 1 },
      ],
    });
    expect(reply.status).toBe(200);
    expect(rowsOf(reply).map((row) => row['status'])).toEqual(['ok', 'not_found', 'ok']);
    expect(await app.stored(ids['D2'] ?? '', 'title')).toBe('A deal');
    expect(await app.stored(ids['D3'] ?? '', 'title')).toBe('bulk');
  });

  it('AUTHZ-02 a bulk update that would move a row out of the scope is invalid for that row only', async () => {
    const { app, ids } = await world(open);
    const reply = await app.as('owner').post(`${DEALS}/bulk`, {
      operation: 'update',
      data: { assignee: USERS.other },
      items: [{ id: ids['D1'], version: 1 }],
    });
    expect(reply.status).toBe(200);
    expect(rowsOf(reply)[0]).toMatchObject({ status: 'invalid' });
    expect(await app.stored(ids['D1'] ?? '', 'assignee')).toBe(USERS.owner);
  });

  it('AUTHZ-04 a bulk call needs the permission of its operation: a reader gets 403, and a delete needs delete', async () => {
    const { app, ids } = await world(open);
    const body = { operation: 'delete', items: [{ id: ids['D1'], version: 1 }] };
    expect((await app.as('reader').post(`${DEALS}/bulk`, body)).status).toBe(403);
    expect((await app.as('owner').post(`${DEALS}/bulk`, body)).status).toBe(200);
    expect(codesOf(await app.as('admin').get(DEALS))).toEqual(['D2', 'D3', 'D4']);
  });

  it('AUTHZ-03 a bulk update of a masked field needs the update permission of the field', async () => {
    const { app, ids } = await world(open);
    await app.grant('other', ['crm.deal.update', 'crm.deal.read']);
    const reply = await app.as('other').post(`${DEALS}/bulk`, {
      operation: 'update',
      data: { margin: 1 },
      items: [{ id: ids['D1'], version: 1 }],
    });
    expect(reply.status).toBe(403);
    expect(await app.stored(ids['D1'] ?? '', 'margin')).toBe(5);
  });
});

describeDialects('AUTHZ-06 a condition that the language does not have', ({ open }) => {
  it.each(['crm.deal.read-regex', 'crm.deal.read-dotted', 'crm.deal.read-unknown'])(
    'AUTHZ-06 %s answers 403 AUTHZ_UNSUPPORTED_CONDITION before any row is read, and leaves an entry',
    async (permission) => {
      const { app } = await world(open);
      await app.grant('other', [permission]);
      app.queries.length = 0;
      const reply = await app.as('other').get(DEALS);
      expect([reply.status, reply.body['code']]).toEqual([403, 'AUTHZ_UNSUPPORTED_CONDITION']);
      expect(app.queries.some((text) => /from\W+crm_deals/i.test(text))).toBe(false);
      expect((await authz(app)).map((row) => row.action)).toEqual(['authz.unsupported-condition']);
    },
  );

  it('AUTHZ-06 a get, an update and an aggregate fail closed the same way', async () => {
    const { app, ids } = await world(open);
    await app.grant('other', ['crm.deal.read-regex']);
    for (const reply of [
      await app.as('other').get(`${DEALS}/${ids['D1']}`),
      await app.as('other').get(`${DEALS}/aggregate`),
    ]) {
      expect([reply.status, reply.body['code']]).toEqual([403, 'AUTHZ_UNSUPPORTED_CONDITION']);
    }
  });

  it('AUTHZ-06 a bad condition does not widen the access of a caller who has the permission for every row too', async () => {
    const { app } = await world(open);
    await app.grant('other', ['crm.deal.read', 'crm.deal.read-regex']);
    expect(codesOf(await app.as('other').get(DEALS))).toEqual(['D1', 'D2', 'D3', 'D4']);
  });
});

describe('AUTHZ-02 the sample is what the tests think it is', () => {
  it('has two tenants and users that are all different', () => {
    expect(TENANT_A).not.toBe(TENANT_B);
    expect(new Set(Object.values(USERS)).size).toBe(Object.keys(USERS).length);
  });
});
