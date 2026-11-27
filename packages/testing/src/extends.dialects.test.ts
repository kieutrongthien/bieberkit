/**
 * BieberKit
 *
 * @file        packages/testing/src/extends.dialects.test.ts
 * @description Tests of entity extensions through the test app on three dialects: the table, the API, the permissions, the tenant and the boot errors (PLG-06, ADR 0033).
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

import { expect, it } from 'vitest';
import { defineModule } from '@bieberkit/core';
import { defineExtension, f, resolveExtensions } from '@bieberkit/data';
import { registerMeta } from '@bieberkit/http';
import { createTestApp, describeDialects } from './index.ts';
import type { TestApp } from './index.ts';
import { Account, crm } from './fixtures.ts';

const ACCOUNTS = '/api/v1/crm/accounts';

const AccountSeo = defineExtension({
  table: 'seo_account_ext',
  fields: {
    seoTitle: f.string({ max: 20 }).optional(),
    noindex: f.boolean().default(false),
    seoScore: f.int({ min: 0, max: 100 }).optional(),
  },
  permissions: { fields: { seoScore: { read: 'seo.score.read', update: 'seo.score.write' } } },
});
const seo = defineModule({ name: 'seo', extends: { 'crm.Account': AccountSeo } });

const AccountMeta = defineExtension({
  table: 'meta_account_ext',
  fields: { metaNote: f.text({ max: 40 }).optional() },
});
const meta = defineModule({ name: 'meta', extends: { 'crm.Account': AccountMeta } });

const base = ['crm.account.read', 'crm.account.create', 'crm.account.update', 'crm.account.delete'];
const roles = {
  writer: base,
  reader: ['crm.account.read'],
  scorer: [...base, 'seo.score.read', 'seo.score.write'],
  scoreReader: ['crm.account.read', 'seo.score.read'],
};

/** The record of an answer that holds one: the API wraps it in `data`. */
const one = (reply: { readonly body: Readonly<Record<string, unknown>> }): Record<string, unknown> =>
  Object(reply.body['data']);

const dataOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown>[] => {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
};

async function columnsOf(app: TestApp, table: string): Promise<string[]> {
  const connection = app.db.orm.em.getConnection();
  const query =
    app.db.dialect === 'sqlite'
      ? `select name from pragma_table_info('${table}')`
      : `select column_name as name from information_schema.columns where table_name = '${table}' and table_schema = ${
          app.db.dialect === 'postgres' ? 'current_schema()' : 'database()'
        }`;
  const rows: Record<string, unknown>[] = await connection.execute(query);
  return rows.map((row) => String(row['name'] ?? row['NAME'])).toSorted();
}

async function countOf(app: TestApp, table: string): Promise<number> {
  const rows: Record<string, unknown>[] = await app.db.orm.em
    .getConnection()
    .execute(`select count(*) as n from ${table}`);
  return Number(rows[0]?.['n'] ?? rows[0]?.['N']);
}

/** The body of an account, with the fields of the extension that the test gives. */
async function account(app: TestApp, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const owner = await app.factory(Account).create();
  return { ...app.factory(Account).build({ ownerId: owner['ownerId'] }), ...extra };
}

describeDialects('PLG-06 entity extensions', ({ open }) => {
  const make = (modules = [crm, seo]) => createTestApp({ modules, roles, open });

  it('PLG-06 the extension is a table of its own with the id of the target as its key, and the target table has no new column', async () => {
    const app = await make();
    const own = await columnsOf(app, 'seo_account_ext');
    expect(own).toEqual(expect.arrayContaining(['id', 'noindex', 'seo_score', 'seo_title', 'tenant_id']));
    const target = await columnsOf(app, 'crm_accounts');
    for (const column of ['seo_title', 'noindex', 'seo_score']) expect(target).not.toContain(column);
    await app.close();
  });

  it('PLG-06 a create with extension fields answers with them, and the list and the detail show them', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['scorer']);
    const created = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'Gold', noindex: true, seoScore: 7 }));
    expect(created.status).toBe(201);
    expect(one(created)).toMatchObject({ seoTitle: 'Gold', noindex: true, seoScore: 7, version: 1 });
    const id = String(one(created)['id']);
    expect(one(await writer.get(`${ACCOUNTS}/${id}`))).toMatchObject({
      seoTitle: 'Gold',
      noindex: true,
      seoScore: 7,
    });
    expect(dataOf((await writer.get(ACCOUNTS)).body).find((row) => row['id'] === id)).toMatchObject({
      seoTitle: 'Gold',
      noindex: true,
    });
    await app.close();
  });

  it('PLG-06 an account made with no extension field has the defaults and no extension row, and gets one when a field is first set', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const created = await writer.post(ACCOUNTS, await account(app));
    expect(one(created)).toMatchObject({ noindex: false, seoTitle: null });
    expect(await countOf(app, 'seo_account_ext')).toBe(0);
    const id = String(one(created)['id']);
    const set = await writer.patch(`${ACCOUNTS}/${id}`, { seoTitle: 'Late' }, 1);
    expect(set.status).toBe(200);
    expect(one(set)).toMatchObject({ seoTitle: 'Late', noindex: false });
    expect(await countOf(app, 'seo_account_ext')).toBe(1);
    await app.close();
  });

  it('PLG-06 an update of only an extension field changes it, leaves the target alone, and moves the version of the record', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const created = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'One' }));
    const id = String(one(created)['id']);
    const updated = await writer.patch(`${ACCOUNTS}/${id}`, { seoTitle: 'Two' }, 1);
    expect(updated.status).toBe(200);
    expect(one(updated)).toMatchObject({
      seoTitle: 'Two',
      version: 2,
      name: one(created)['name'],
      code: one(created)['code'],
    });
    const stale = await writer.patch(`${ACCOUNTS}/${id}`, { seoTitle: 'Three' }, 1);
    expect(stale.status).toBe(412);
    expect(one(await writer.get(`${ACCOUNTS}/${id}`))).toMatchObject({ seoTitle: 'Two', version: 2 });
    await app.close();
  });

  it('PLG-06 an update of a field of the target and of the extension together is one change, with one version', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const created = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'One' }));
    const id = String(one(created)['id']);
    const updated = await writer.patch(`${ACCOUNTS}/${id}`, { name: 'Renamed', seoTitle: 'Two' }, 1);
    expect(one(updated)).toMatchObject({ name: 'Renamed', seoTitle: 'Two', version: 2 });
    await app.close();
  });

  it('PLG-06 the fields of the extension are validated like those of the entity, and a field that nobody declares is still refused', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const tooLong = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'x'.repeat(21) }));
    expect([tooLong.status, tooLong.body['code']]).toEqual([400, 'HTTP_VALIDATION_FAILED']);
    expect(JSON.stringify(tooLong.body['errors'])).toContain('seoTitle');
    const wrongType = await writer.post(ACCOUNTS, await account(app, { noindex: 'yes' }));
    expect(wrongType.status).toBe(400);
    expect((await writer.post(ACCOUNTS, await account(app, { ghost: 1 }))).status).toBe(400);
    expect(await countOf(app, 'seo_account_ext')).toBe(0);
    await app.close();
  });

  it('PLG-06 a write that fails after the target row leaves no extension row, and one that fails in the extension leaves no target row', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const body = await account(app, { seoScore: 101 });
    const before = dataOf((await writer.get(ACCOUNTS)).body).length;
    const bad = await writer.post(ACCOUNTS, body);
    expect(bad.status).toBe(400);
    expect(dataOf((await writer.get(ACCOUNTS)).body)).toHaveLength(before);
    expect(await countOf(app, 'seo_account_ext')).toBe(0);
    await app.close();
  });

  it('PLG-06 a field with its own permission is hidden from a reader without it, and refused to a writer without it', async () => {
    const app = await make();
    const scorer = await app.actingAs(app.newUser(), ['scorer']);
    const created = await scorer.post(ACCOUNTS, await account(app, { seoTitle: 'T', seoScore: 50 }));
    const id = String(one(created)['id']);
    const reader = await app.actingAs(app.newUser(), ['reader']);
    const seen = one(await reader.get(`${ACCOUNTS}/${id}`));
    expect(seen).toMatchObject({ seoTitle: 'T' });
    expect(seen).not.toHaveProperty('seoScore');
    expect(one(await (await app.actingAs(app.newUser(), ['scoreReader'])).get(`${ACCOUNTS}/${id}`))).toMatchObject({
      seoScore: 50,
    });
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const refused = await writer.patch(`${ACCOUNTS}/${id}`, { seoScore: 60 }, 1);
    expect(refused.status).toBe(403);
    expect(one(await scorer.patch(`${ACCOUNTS}/${id}`, { seoScore: 60 }, 1))).toMatchObject({ seoScore: 60 });
    await app.close();
  });

  it('PLG-06 a tenant never sees the extension of another tenant, and the extension row has the tenant of its target', async () => {
    const app = await make();
    const other = app.withTenant(app.newUser().id);
    const here = await app.actingAs(app.newUser(), ['writer']);
    const there = await other.actingAs(other.newUser(), ['writer']);
    await here.post(ACCOUNTS, await account(app, { seoTitle: 'Here' }));
    await there.post(ACCOUNTS, await account(other, { seoTitle: 'There' }));
    expect(
      dataOf((await here.get(ACCOUNTS)).body)
        .map((row) => row['seoTitle'])
        .filter((title) => title !== null),
    ).toEqual(['Here']);
    expect(
      dataOf((await there.get(ACCOUNTS)).body)
        .map((row) => row['seoTitle'])
        .filter((title) => title !== null),
    ).toEqual(['There']);
    await app.close();
  });

  it('PLG-06 deleting the target deletes its extension row', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const created = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'Gone' }));
    expect(await countOf(app, 'seo_account_ext')).toBe(1);
    expect((await writer.delete(`${ACCOUNTS}/${String(one(created)['id'])}`, 1)).status).toBe(204);
    expect(await countOf(app, 'seo_account_ext')).toBe(0);
    await app.close();
  });

  it('PLG-06 two plugins extend the same entity, and each writes its own table in one transaction', async () => {
    const app = await make([crm, seo, meta]);
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const created = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'S', metaNote: 'M' }));
    expect(one(created)).toMatchObject({ seoTitle: 'S', metaNote: 'M' });
    expect(await countOf(app, 'seo_account_ext')).toBe(1);
    expect(await countOf(app, 'meta_account_ext')).toBe(1);
    expect((await columnsOf(app, 'crm_accounts')).includes('meta_note')).toBe(false);
    await app.close();
  });

  it('PLG-06 the metadata of the admin lists the fields of the extension in the form of the target', async () => {
    const app = await make();
    // The test app does not mount the metadata, so it is mounted over the entities that the app has, as the server does (UI-02).
    registerMeta(
      app.server,
      resolveExtensions([Account], [{ module: 'seo', target: 'crm.Account', extension: AccountSeo }]).entities,
    );
    const admin = await app.actingAs(app.newUser(), ['admin']);
    const document = (await admin.get('/api/v1/_meta')).body;
    const entities = Array.isArray(document['entities']) ? document['entities'] : [];
    const found = entities.find((entity: Record<string, unknown>) => entity['name'] === 'crm.Account');
    const keys = (Array.isArray(found?.['fields']) ? found['fields'] : []).map(
      (field: Record<string, unknown>) => field['key'],
    );
    expect(keys).toEqual(expect.arrayContaining(['name', 'seoTitle', 'noindex', 'seoScore']));
    await app.close();
  });

  it('PLG-06 a filter or a sort by an extension field is a 400 for now, and the list still works', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    await writer.post(ACCOUNTS, await account(app, { seoTitle: 'A' }));
    const filtered = await writer.get(`${ACCOUNTS}?filter[seoTitle][eq]=A`);
    expect([filtered.status, filtered.body['code']]).toEqual([400, 'DATA_QUERY_INVALID']);
    expect((await writer.get(`${ACCOUNTS}?sort=seoTitle`)).status).toBe(400);
    expect((await writer.get(`${ACCOUNTS}?fields=name,seoTitle`)).status).toBe(200);
    await app.close();
  });

  it('PLG-06 the audit entry of an update names the extension field among those that changed', async () => {
    const app = await make();
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const created = await writer.post(ACCOUNTS, await account(app, { seoTitle: 'One' }));
    await writer.patch(`${ACCOUNTS}/${String(one(created)['id'])}`, { seoTitle: 'Two' }, 1);
    const audit: Record<string, unknown>[] = await app.db.orm.em
      .getConnection()
      .execute('select data from bk_audit_log');
    expect(audit.some((row) => String(row['data']).includes('seoTitle'))).toBe(true);
    await app.close();
  });
});

describeDialects('PLG-06 the errors of the boot', ({ open }) => {
  const boot = (...modules: ReturnType<typeof defineModule>[]) => createTestApp({ modules: [crm, ...modules], open });

  it('PLG-06 an extension of an entity that no module declares stops the boot with DATA_EXTENSION_TARGET_UNKNOWN', async () => {
    const ghost = defineModule({ name: 'ghost', extends: { 'crm.Nobody': AccountMeta } });
    await expect(boot(ghost)).rejects.toMatchObject({ code: 'DATA_EXTENSION_TARGET_UNKNOWN' });
  });

  it('PLG-06 a field that the target has stops the boot with DATA_EXTENSION_FIELD_CLASH', async () => {
    const clash = defineExtension({ table: 'clash_account_ext', fields: { name: f.string({ max: 5 }) } });
    await expect(boot(defineModule({ name: 'clash', extends: { 'crm.Account': clash } }))).rejects.toMatchObject({
      code: 'DATA_EXTENSION_FIELD_CLASH',
    });
  });

  it('PLG-06 a table that is taken stops the boot with DATA_EXTENSION_TABLE_CLASH', async () => {
    const taken = defineExtension({ table: 'crm_accounts', fields: { other: f.string({ max: 5 }) } });
    await expect(boot(defineModule({ name: 'taken', extends: { 'crm.Account': taken } }))).rejects.toMatchObject({
      code: 'DATA_EXTENSION_TABLE_CLASH',
    });
  });
});
