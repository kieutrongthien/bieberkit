/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/index.test.ts
 * @description Tests of the audit-log plugin: filters, one entry with its actor, the export, the list of actions and the tenant of reads (AUD-01 to AUD-06).
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
import { requestContext } from '@bieberkit/core';
import { AuditLog, recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { createTestApp, describeDialects, TENANT_HEADER, USER_HEADER } from '@bieberkit/testing';
import type { TestApp } from '@bieberkit/testing';
import plugin from './index.ts';

const BASE = '/api/v1/audit-log';
const ENTRIES = `${BASE}/entries`;
const NIL = '00000000-0000-0000-0000-000000000000';
const OTHER = '0190a0a0-0000-7000-8000-000000000003';
const RECORD = '0190a0a0-0000-7000-8000-0000000000aa';
const PASSWORD = 'correct horse battery staple';
/** The actions that the cases write. The test app writes others, such as the roles that it makes. */
const SEEDED = /^(crm|sales)\./;

interface Entry {
  readonly id: string;
  readonly action: string;
  readonly entity: string | null;
  readonly data: unknown;
  readonly actor: { readonly id: string; readonly name: string; readonly email: string } | null;
}

const metaOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const meta = body['meta'];
  return typeof meta === 'object' && meta !== null ? Object.fromEntries(Object.entries(meta)) : {};
};

const entriesOf = (body: Readonly<Record<string, unknown>>): Entry[] => {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
};

interface Seed {
  readonly action: string;
  readonly entity?: string;
  readonly recordId?: string;
  readonly data?: unknown;
  readonly reason?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId?: string;
}

/** Writes one entry as a request of `seed.userId` in `seed.tenantId` would. */
async function seed(app: TestApp, entry: Seed): Promise<void> {
  await requestContext.run(
    {
      requestId: entry.requestId ?? 'req-seed',
      tenantId: entry.tenantId ?? app.tenant,
      ...(entry.userId === undefined ? {} : { userId: entry.userId }),
    },
    () =>
      runInTransaction(app.db, async (em) => {
        recordAudit(em, {
          action: entry.action,
          ...(entry.entity === undefined ? {} : { entity: entry.entity }),
          ...(entry.recordId === undefined ? {} : { recordId: entry.recordId }),
          ...(entry.data === undefined ? {} : { data: entry.data }),
          ...(entry.reason === undefined ? {} : { reason: entry.reason }),
        });
        await em.flush();
      }),
  );
}

const actions = (body: Readonly<Record<string, unknown>>): string[] =>
  entriesOf(body)
    .map((entry) => entry.action)
    .filter((action) => SEEDED.test(action));

describeDialects('AUD the audit-log plugin', ({ open }) => {
  async function world(pluginEnv: Record<string, unknown> = {}) {
    const app = await createTestApp({
      modules: [plugin.module],
      open,
      pluginEnv,
      roles: {
        auditor: ['audit-log.read'],
        exporter: ['audit-log.read', 'audit-log.export'],
        keeper: ['audit-log.read', 'audit-log.hold'],
      },
    });
    const actorId = app.newUser().id;
    await seed(app, {
      action: 'crm.deal.won',
      entity: 'crm.Deal',
      recordId: RECORD,
      userId: actorId,
      requestId: 'req-1',
    });
    await seed(app, { action: 'crm.deal.lost', entity: 'crm.Deal', data: { why: 'price' }, reason: '=HYPERLINK("x")' });
    await seed(app, { action: 'crm.note.added', entity: 'crm.Note', requestId: 'req-2' });
    await seed(app, { action: 'sales.quote.sent', entity: 'sales.Quote' });
    await seed(app, { action: 'crm.deal.won', entity: 'crm.Deal', tenantId: OTHER });
    const auditor = await app.actingAs(app.newUser(), ['auditor']);
    return { app, auditor, actorId };
  }

  it('AUD-01 filters by action, a prefix of actions, entity, record, actor, request and time', async () => {
    const { app, auditor, actorId } = await world();
    const list = async (query: string) => actions((await auditor.get(`${ENTRIES}?${query}`)).body);
    expect(await list('')).toEqual(['sales.quote.sent', 'crm.note.added', 'crm.deal.lost', 'crm.deal.won']);
    expect(await list('action=crm.deal.won')).toEqual(['crm.deal.won']);
    expect(await list('action=crm.deal.*')).toEqual(['crm.deal.lost', 'crm.deal.won']);
    expect(await list('action=crm.*')).toHaveLength(3);
    expect(await list('action=crm.deal')).toEqual([]);
    expect(await list('action=%25*')).toEqual([]);
    expect(await list('entity=crm.Note')).toEqual(['crm.note.added']);
    expect(await list(`recordId=${RECORD}`)).toEqual(['crm.deal.won']);
    expect(await list(`actorId=${actorId}`)).toEqual(['crm.deal.won']);
    expect(await list('requestId=req-2')).toEqual(['crm.note.added']);
    const hour = 3_600_000;
    expect(await list(`from=${new Date(Date.now() - hour).toISOString()}`)).toHaveLength(4);
    expect(await list(`to=${new Date(Date.now() - hour).toISOString()}`)).toEqual([]);
    expect((await auditor.get(`${ENTRIES}?actorId=nope`)).status).toBe(400);
    await app.close();
  });

  it('BPL-06 the list pages newest first with a keyset cursor and counts with withTotal', async () => {
    const { app, auditor } = await world();
    const first = await auditor.get(`${ENTRIES}?pageSize=2&withTotal=true&entity=crm.Deal`);
    expect(actions(first.body)).toEqual(['crm.deal.lost', 'crm.deal.won']);
    expect(first.body['meta']).toMatchObject({ pageSize: 2, total: 2, nextCursor: null });
    const page = await auditor.get(`${ENTRIES}?pageSize=1&entity=crm.Deal`);
    const meta: Record<string, unknown> = Object(page.body['meta']);
    const next = await auditor.get(`${ENTRIES}?pageSize=1&entity=crm.Deal&cursor=${String(meta['nextCursor'])}`);
    expect(actions(next.body)).toEqual(['crm.deal.won']);
    expect((await auditor.get(`${ENTRIES}?pageSize=500`)).body['meta']).toMatchObject({ pageSize: 100 });
    await app.close();
  });

  it('AUD-02 one entry carries its actor from the auth tables, the system has none, and an unknown id is 404', async () => {
    const { app, auditor } = await world();
    const signed = await app.services.auth.api.signUpEmail({
      body: { email: 'ada@example.test', password: PASSWORD, name: 'Ada' },
    });
    await seed(app, { action: 'crm.deal.reopened', userId: signed.user.id });
    const [mine] = entriesOf((await auditor.get(`${ENTRIES}?action=crm.deal.reopened`)).body);
    expect(mine?.actor).toEqual({ id: signed.user.id, name: 'Ada', email: 'ada@example.test' });
    const one = await auditor.get(`${ENTRIES}/${String(mine?.id)}`);
    expect(one.status).toBe(200);
    expect(one.body['data']).toMatchObject({ action: 'crm.deal.reopened', actor: { email: 'ada@example.test' } });
    const [system] = entriesOf((await auditor.get(`${ENTRIES}?action=sales.quote.sent`)).body);
    expect(system?.actor).toBeNull();
    const missing = await auditor.get(`${ENTRIES}/0190a0a0-0000-7000-8000-0000000000ff`);
    expect(missing.status).toBe(404);
    expect(missing.body['code']).toBe('AUDIT_NOT_FOUND');
    await app.close();
  });

  it('AUD-03 the export streams CSV or NDJSON with the filters, escapes formulas and is itself audited', async () => {
    const { app, auditor } = await world();
    const exporter = app.newUser();
    await app.actingAs(exporter, ['exporter']);
    const get = (query: string) =>
      app.server.inject({
        method: 'GET',
        url: `${BASE}/export?${query}`,
        headers: { [USER_HEADER]: exporter.id, [TENANT_HEADER]: app.tenant },
      });
    const csv = await get('format=csv&entity=crm.Deal');
    expect(csv.statusCode).toBe(200);
    expect(String(csv.headers['content-type'])).toMatch(/^text\/csv/);
    expect(String(csv.headers['content-disposition'])).toMatch(/^attachment; filename="audit-log-.*\.csv"$/);
    expect(csv.headers['x-export-truncated']).toBeUndefined();
    const lines = csv.body.trim().split('\n');
    expect(lines[0]).toBe('id,at,tenant,actorId,actorEmail,requestId,action,entity,recordId,reason,data');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('crm.deal.lost');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain(`"{""why"":""price""}"`);
    const ndjson = await get('format=ndjson&action=crm.note.added');
    expect(String(ndjson.headers['content-type'])).toMatch(/^application\/x-ndjson/);
    const rows = ndjson.body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'crm.note.added', entity: 'crm.Note', requestId: 'req-2' });
    const audited = entriesOf((await auditor.get(`${ENTRIES}?action=audit-log.entries.exported`)).body);
    expect(audited).toHaveLength(2);
    expect(audited[0]?.data).toMatchObject({ format: 'ndjson', filters: { action: 'crm.note.added' } });
    expect((await auditor.get(`${BASE}/export?format=csv`)).status).toBe(403);
    expect((await get('format=xml')).statusCode).toBe(400);
    await app.close();
  });

  it('AUD-03 the export stops at AUDIT_LOG_EXPORT_MAX_ROWS and says that it was cut', async () => {
    const { app } = await world({ AUDIT_LOG_EXPORT_MAX_ROWS: 2 });
    const exporter = app.newUser();
    await app.actingAs(exporter, ['exporter']);
    const reply = await app.server.inject({
      method: 'GET',
      url: `${BASE}/export?format=ndjson&action=crm.*`,
      headers: { [USER_HEADER]: exporter.id, [TENANT_HEADER]: app.tenant },
    });
    expect(reply.headers['x-export-truncated']).toBe('true');
    expect(reply.body.trim().split('\n')).toHaveLength(2);
    await app.close();
  });

  it('AUD-04 the actions are distinct, in order, and kept for 60 seconds', async () => {
    const { app, auditor } = await world();
    const listed = async (): Promise<string[]> => {
      const data = (await auditor.get(`${BASE}/actions`)).body['data'];
      return (Array.isArray(data) ? data : []).filter((action: string) => SEEDED.test(action));
    };
    expect(await listed()).toEqual(['crm.deal.lost', 'crm.deal.won', 'crm.note.added', 'sales.quote.sent']);
    await seed(app, { action: 'crm.deal.split' });
    expect(await listed()).toEqual(['crm.deal.lost', 'crm.deal.won', 'crm.note.added', 'sales.quote.sent']);
    await app.close();
  });

  it('AUD-05 a reader in a tenant sees that tenant only; a reader in the nil tenant sees every tenant', async () => {
    const { app, auditor } = await world();
    const mine = entriesOf((await auditor.get(`${ENTRIES}?action=crm.deal.won`)).body);
    expect(mine).toHaveLength(1);
    const other = app.withTenant(OTHER);
    const theirs = await other.actingAs(other.newUser(), ['auditor']);
    const seen = entriesOf((await theirs.get(`${ENTRIES}?action=crm.deal.won`)).body);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.id).not.toBe(mine[0]?.id);
    expect((await theirs.get(`${ENTRIES}/${String(mine[0]?.id)}`)).status).toBe(404);
    const data = (await theirs.get(`${BASE}/actions`)).body['data'];
    expect((Array.isArray(data) ? data : []).filter((action: string) => SEEDED.test(action))).toEqual(['crm.deal.won']);
    const system = app.withTenant(NIL);
    const admin = await system.actingAs(system.newUser(), ['auditor']);
    expect(entriesOf((await admin.get(`${ENTRIES}?action=crm.deal.won`)).body)).toHaveLength(2);
    await app.close();
  });

  it('AUD-06 no route of the plugin changes or deletes an audit row: only the holds are written, and they are not audit rows', async () => {
    const { app, auditor } = await world();
    const routes = plugin.module.contributions['routes'];
    const written = (Array.isArray(routes) ? routes : [])
      .filter((route) => Reflect.get(Object(route), 'method') !== 'GET')
      .map((route) => String(Reflect.get(Object(route), 'url')));
    expect(written).toEqual([`${BASE}/holds`, `${BASE}/holds/:id`]);
    const before = await runInUnitOfWork(app.db, (em) => em.count(AuditLog, {}));
    await auditor.get(ENTRIES);
    expect(await runInUnitOfWork(app.db, (em) => em.count(AuditLog, {}))).toBe(before);
    expect(plugin.permissions).toEqual(['audit-log.read', 'audit-log.export', 'audit-log.hold']);
    await app.close();
  });

  it('AUTHZ-01 a caller without audit-log.read gets 403, and one who is not signed in gets 401', async () => {
    const { app } = await world();
    expect((await (await app.actingAs(app.newUser())).get(ENTRIES)).status).toBe(403);
    expect((await app.anonymous().get(ENTRIES)).status).toBe(401);
    await app.close();
  });
  it('AUD-08 after gives the entries after an id, oldest first, each once, and nextAfter resumes', async () => {
    const { app, auditor } = await world();
    const all = entriesOf((await auditor.get(`${ENTRIES}?pageSize=100`)).body);
    const oldest = all.toReversed();
    const first = await auditor.get(`${ENTRIES}?after=${oldest[0]?.id ?? ''}&pageSize=2`);
    expect(entriesOf(first.body).map((entry) => entry.id)).toEqual(oldest.slice(1, 3).map((entry) => entry.id));
    const meta = metaOf(first.body);
    expect(meta['nextAfter']).toBe(oldest[2]?.id);
    const second = await auditor.get(`${ENTRIES}?after=${String(meta['nextAfter'])}&pageSize=100`);
    const rest = entriesOf(second.body).map((entry) => entry.id);
    expect(rest).toEqual(oldest.slice(3).map((entry) => entry.id));
    const done = await auditor.get(`${ENTRIES}?after=${oldest.at(-1)?.id ?? ''}`);
    expect([entriesOf(done.body), metaOf(done.body)['nextAfter']]).toEqual([[], oldest.at(-1)?.id]);
    await app.close();
  });

  it('AUD-08 after and cursor together, and an after that is not an id, are 400', async () => {
    const { app, auditor } = await world();
    expect((await auditor.get(`${ENTRIES}?after=nope`)).status).toBe(400);
    const both = await auditor.get(`${ENTRIES}?after=${RECORD}&cursor=abc`);
    expect([both.status, both.body['code']]).toEqual([400, 'AUDIT_AFTER_INVALID']);
    await app.close();
  });

  it('AUD-08 the export takes after too, and reads oldest first', async () => {
    const { app, auditor } = await world();
    const exporter = app.newUser();
    await app.actingAs(exporter, ['exporter']);
    const oldest = entriesOf((await auditor.get(`${ENTRIES}?pageSize=100`)).body).toReversed();
    const out = await app.server.inject({
      method: 'GET',
      url: `${BASE}/export?format=ndjson&after=${oldest[0]?.id ?? ''}`,
      headers: { [USER_HEADER]: exporter.id, [TENANT_HEADER]: app.tenant },
    });
    const ids = out.body
      .trim()
      .split('\n')
      .map((line) => String(Reflect.get(JSON.parse(line), 'id')));
    expect(ids.slice(0, 2)).toEqual([oldest[1]?.id, oldest[2]?.id]);
    expect(ids).not.toContain(oldest[0]?.id);
    await app.close();
  });

  it('AUD-09 a hold needs a reason and something to cover, and is listed, audited and released by a mark', async () => {
    const { app } = await world();
    const keeper = await app.actingAs(app.newUser(), ['keeper']);
    expect((await keeper.post(`${BASE}/holds`, { reason: 'lawsuit' })).body['code']).toBe('AUDIT_HOLD_INVALID');
    const made = await keeper.post(`${BASE}/holds`, { entity: 'crm.Deal', reason: 'lawsuit 42' });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ entity: 'crm.Deal', reason: 'lawsuit 42', releasedAt: null });
    const id = String(made.body['id']);
    expect(entriesOf((await keeper.get(`${BASE}/holds`)).body)).toHaveLength(1);
    expect((await keeper.delete(`${BASE}/holds/${id}`, 0)).status).toBe(204);
    expect((await keeper.delete(`${BASE}/holds/${id}`, 0)).status).toBe(204);
    expect(entriesOf((await keeper.get(`${BASE}/holds`)).body)).toHaveLength(0);
    const released = await keeper.get(`${BASE}/holds?status=released`);
    expect(entriesOf(released.body).map((hold) => hold.id)).toEqual([id]);
    const trail = (await keeper.get(`${ENTRIES}?action=audit-log.hold.*`)).body;
    expect(
      entriesOf(trail)
        .map((entry) => entry.action)
        .toSorted(),
    ).toEqual(['audit-log.hold.placed', 'audit-log.hold.released']);
    expect((await keeper.delete(`${BASE}/holds/0190a0a0-0000-7000-8000-0000000000ff`, 0)).status).toBe(404);
    await app.close();
  });

  it('AUD-09 placing and releasing a hold needs audit-log.hold, and a tenant sees only its own holds', async () => {
    const { app, auditor } = await world();
    expect((await auditor.post(`${BASE}/holds`, { entity: 'x', reason: 'r' })).status).toBe(403);
    const keeper = await app.actingAs(app.newUser(), ['keeper']);
    await keeper.post(`${BASE}/holds`, { entity: 'crm.Deal', reason: 'mine' });
    const elsewhere = app.withTenant(OTHER);
    const other = await elsewhere.actingAs(elsewhere.newUser(), ['keeper']);
    expect(entriesOf((await other.get(`${BASE}/holds`)).body)).toHaveLength(0);
    await app.close();
  });

  it('AUD-07 with AUDIT_LOG_MIRROR each entry is copied to the log as one line with audit: true, after commit', async () => {
    const { app } = await world({ AUDIT_LOG_MIRROR: true });
    await seed(app, { action: 'crm.deal.mirrored', entity: 'crm.Deal', data: { stage: 'won' } });
    expect(app.logger.lines.filter((line) => line.fields['audit'] === true)).toHaveLength(0);
    await app.runOutbox();
    const lines = app.logger.lines.filter((line) => line.fields['audit'] === true);
    expect(lines.length).toBeGreaterThan(0);
    const mirrored = lines.find((line) => line.fields['action'] === 'crm.deal.mirrored');
    expect(mirrored?.fields).toMatchObject({ audit: true, entity: 'crm.Deal', data: { stage: 'won' } });
    await app.close();
  });

  it('AUD-07 without it nothing is mirrored and no event is written', async () => {
    const { app } = await world();
    await seed(app, { action: 'crm.deal.quiet' });
    await app.runOutbox();
    expect(app.logger.lines.filter((line) => line.fields['audit'] === true)).toHaveLength(0);
    await app.close();
  });
  it('OPS-02 one person may start only a few exports in a short time (AUTH_ACTION_LIMITED)', async () => {
    const { app } = await world();
    const exporter = app.newUser();
    await app.actingAs(exporter, ['exporter']);
    const get = () =>
      app.server.inject({
        method: 'GET',
        url: `${BASE}/export?format=ndjson&entity=crm.Note`,
        headers: { [USER_HEADER]: exporter.id, [TENANT_HEADER]: app.tenant },
      });
    const codes: number[] = [];
    for (let n = 0; n < 11; n += 1) codes.push((await get()).statusCode);
    expect(codes.slice(0, 10).every((code) => code === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    await app.close();
  });
  it('BPL-06 the holds list pages with a keyset cursor and a page of at most 100', async () => {
    const { app } = await world();
    const keeper = await app.actingAs(app.newUser(), ['keeper']);
    for (const name of ['a', 'b', 'c']) await keeper.post(`${BASE}/holds`, { entity: `crm.${name}`, reason: name });
    const first = await keeper.get(`${BASE}/holds?pageSize=2`);
    expect(entriesOf(first.body)).toHaveLength(2);
    const cursor = String(metaOf(first.body)['nextCursor']);
    const second = await keeper.get(`${BASE}/holds?pageSize=2&cursor=${encodeURIComponent(cursor)}`);
    expect(entriesOf(second.body)).toHaveLength(1);
    expect(metaOf(second.body)['nextCursor']).toBeNull();
    expect(metaOf(await keeper.get(`${BASE}/holds?pageSize=100`).then((reply) => reply.body))['pageSize']).toBe(100);
    await app.close();
  });
});
