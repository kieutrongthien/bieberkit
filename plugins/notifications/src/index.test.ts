/**
 * BieberKit
 *
 * @file        plugins/notifications/src/index.test.ts
 * @description Tests of the notifications plugin: the notifier in the caller's transaction, by user, list or role, with dedupe, preferences and mail after commit, the routes of the signed-in person, retention, the event of each notification, and the support routes (NTF-01 to NTF-07, BPL-05, BPL-06, AUTHZ-01).
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
import { assignRole, AuthUserRole, createRole } from '@bieberkit/auth';
import { AuditLog, emitEvent, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import { createTestApp, describeDialects } from '@bieberkit/testing';
import type { TestApp } from '@bieberkit/testing';
import plugin, { Notification, pruneJob } from './index.ts';

const ME = '/api/v1/notifications/me';
const NIL = '00000000-0000-0000-0000-000000000000';
const PASSWORD = 'correct horse battery staple';
const DAY = 86_400_000;

interface Row {
  id: string;
  title: string;
  level: string;
  category: string;
  readAt: string | null;
}

const rowsOf = (body: Readonly<Record<string, unknown>>): Row[] => {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
};

async function account(app: TestApp, email: string): Promise<string> {
  return (await app.services.auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'Someone' } })).user.id;
}

async function stored(app: TestApp, userId?: string): Promise<Record<string, unknown>[]> {
  return runInUnitOfWork(app.db, async (em) => {
    const entity = em.getMetadata().getByClassName(Notification.name).class;
    const found: unknown[] = await em.find(entity, userId === undefined ? {} : { userId });
    return found.map((row) => Object(row));
  });
}

const events = async (app: TestApp): Promise<string[]> =>
  (await app.db.orm.em.getConnection().execute('select event from bk_outbox order by created_at')).map(
    (row: { event: string }) => row.event,
  );

const audits = async (app: TestApp): Promise<string[]> =>
  runInUnitOfWork(app.db, async (em) =>
    (await em.find(AuditLog, {}, { orderBy: { at: 'asc' } }))
      .map((row) => row.action)
      .filter((action) => action.startsWith('notifications.')),
  );

const mailedTo = (app: TestApp, address: string): number =>
  app.mailbox.filter((message) => message.to.some((to) => to.address === address)).length;

describeDialects('NTF the notifications plugin', ({ open }) => {
  async function world(pluginEnv: Record<string, unknown> = {}) {
    const app = await createTestApp({
      modules: [plugin.module],
      open,
      tenant: NIL,
      pluginEnv,
      roles: {
        member: ['notifications.read-own', 'notifications.update-own', 'notifications.delete-own'],
        support: ['notifications.read', 'notifications.manage', 'notifications.send'],
      },
    });
    return { app, notifier: app.services.notifier };
  }

  it('NTF-01 a send writes in the transaction of the caller, and a rollback leaves nothing', async () => {
    const { app, notifier } = await world();
    const user = app.newUser().id;
    await expect(
      runInTransaction(app.db, async () => {
        await notifier.send({ to: user, title: 'Lost' });
        throw new Error('the caller fails');
      }),
    ).rejects.toThrow('the caller fails');
    expect(await stored(app, user)).toEqual([]);
    await runInTransaction(app.db, async (em) => {
      await notifier.send({ to: user, title: 'Kept' });
      emitEvent(em, { name: 'caller.did', payload: {} });
    });
    expect((await stored(app, user)).map((row) => row['title'])).toEqual(['Kept']);
    await app.close();
  });

  it('NTF-01 to is a user, a list or a role; a role of more than 100 is expanded by a job after commit', async () => {
    const { app, notifier } = await world();
    const [a, b] = [app.newUser().id, app.newUser().id];
    expect(await notifier.send({ to: [a, b], title: 'Both' })).toEqual({ created: 2, queued: false });
    const small = await createRole(app.db, { name: 'small', permissions: [] });
    await assignRole(app.db, { userId: a, roleId: small });
    expect(await notifier.send({ to: { role: 'small' }, title: 'Role' })).toEqual({ created: 1, queued: false });
    const big = await createRole(app.db, { name: 'big', permissions: [] });
    // The holders are written straight into the table: 101 audited assignments would only slow the case down.
    await runInUnitOfWork(app.db, async (em) => {
      for (let index = 0; index < 101; index += 1)
        em.create(AuthUserRole, { tenant: NIL, userId: app.newUser().id, roleId: big });
      await em.flush();
    });
    expect(await notifier.send({ to: { role: 'big' }, title: 'Everyone' })).toEqual({ created: 0, queued: true });
    expect((await stored(app)).filter((row) => row['title'] === 'Everyone')).toHaveLength(0);
    // Drain the outbox: it hands out batches of 100.
    while ((await app.runOutbox()) > 0);
    expect((await stored(app)).filter((row) => row['title'] === 'Everyone')).toHaveLength(101);
    await expect(notifier.send({ to: { role: 'nobody' }, title: 'x' })).rejects.toMatchObject({
      code: 'NOTIFICATIONS_ROLE_UNKNOWN',
    });
    await expect(
      notifier.send({ to: Array.from({ length: 101 }, () => app.newUser().id), title: 'x' }),
    ).rejects.toMatchObject({ code: 'NOTIFICATIONS_INVALID' });
    await app.close();
  });

  it('NTF-02 a notification has its level, category, link, data and expiry, and a second send with the dedupe key does nothing', async () => {
    const { app, notifier } = await world();
    const user = app.newUser().id;
    const expiresAt = new Date(Date.now() + DAY);
    await notifier.send({
      to: user,
      title: 'Invoice overdue',
      level: 'warning',
      category: 'billing',
      link: '/invoices/42',
      data: { invoice: 42 },
      dedupeKey: 'invoice-42',
      expiresAt,
    });
    expect(await notifier.send({ to: user, title: 'Invoice overdue', dedupeKey: 'invoice-42' })).toEqual({
      created: 0,
      queued: false,
    });
    const [row] = await stored(app, user);
    expect(row).toMatchObject({
      level: 'warning',
      category: 'billing',
      link: '/invoices/42',
      data: JSON.stringify({ invoice: 42 }),
      dedupeKey: 'invoice-42',
    });
    const expiry: unknown = row?.['expiresAt'];
    expect(expiry instanceof Date ? expiry.getTime() : Number.NaN).toBe(expiresAt.getTime());
    expect(await stored(app, user)).toHaveLength(1);
    // Another user may get the same key.
    expect((await notifier.send({ to: app.newUser().id, title: 'x', dedupeKey: 'invoice-42' })).created).toBe(1);
    // A level outside the list, as a caller in plain JavaScript could send it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await expect(notifier.send({ to: user, title: 'x', level: 'loud' as never })).rejects.toMatchObject({
      code: 'NOTIFICATIONS_INVALID',
    });
    await app.close();
  });

  it('NTF-03 the signed-in person lists, counts, reads, reads all and deletes their own notifications only', async () => {
    const { app, notifier } = await world();
    const me = app.newUser().id;
    const other = app.newUser().id;
    for (const title of ['One', 'Two', 'Three'])
      await notifier.send({ to: me, title, category: title === 'Three' ? 'billing' : 'general' });
    await notifier.send({ to: other, title: 'Theirs' });
    const client = await app.actingAs(me, ['member']);
    const list = rowsOf((await client.get(ME)).body);
    expect(list.map((row) => row.title)).toEqual(['Three', 'Two', 'One']);
    expect(rowsOf((await client.get(`${ME}?category=billing`)).body).map((row) => row.title)).toEqual(['Three']);
    expect((await client.get(`${ME}/unread-count`)).body).toEqual({ count: 3 });
    const first = list[2]?.id ?? '';
    expect((await client.post(`${ME}/${first}/read`)).status).toBe(204);
    expect((await client.get(`${ME}/unread-count`)).body).toEqual({ count: 2 });
    expect(rowsOf((await client.get(`${ME}?unread=true`)).body).map((row) => row.title)).toEqual(['Three', 'Two']);
    expect((await client.post(`${ME}/read-all`)).body).toEqual({ updated: 2 });
    expect((await client.get(`${ME}/unread-count`)).body).toEqual({ count: 0 });
    expect((await client.delete(`${ME}/${first}`, 0)).status).toBe(204);
    const theirs = String((await stored(app, other))[0]?.['id']);
    for (const reply of [await client.post(`${ME}/${theirs}/read`), await client.delete(`${ME}/${theirs}`, 0)]) {
      expect([reply.status, reply.body['code']]).toEqual([404, 'NOTIFICATIONS_NOT_FOUND']);
    }
    expect((await stored(app, other))[0]?.['readAt'] ?? null).toBeNull();
    expect(await audits(app)).toEqual(
      expect.arrayContaining([
        'notifications.notification.read',
        'notifications.notification.read-all',
        'notifications.notification.deleted',
      ]),
    );
    await app.close();
  });

  it('BPL-06 the list of the person pages by id with a cursor, at most 100, and counts only with withTotal', async () => {
    const { app, notifier } = await world();
    const me = app.newUser().id;
    for (let index = 0; index < 5; index += 1) await notifier.send({ to: me, title: `N${String(index)}` });
    const client = await app.actingAs(me, ['member']);
    const first = await client.get(`${ME}?pageSize=2`);
    const meta = Object(first.body['meta']);
    expect(meta).toMatchObject({ pageSize: 2, nextCursor: expect.any(String) });
    expect(meta).not.toHaveProperty('total');
    const titles: string[] = rowsOf(first.body).map((row) => row.title);
    let cursor: unknown = meta['nextCursor'];
    while (typeof cursor === 'string') {
      const page = await client.get(`${ME}?pageSize=2&cursor=${encodeURIComponent(cursor)}`);
      titles.push(...rowsOf(page.body).map((row) => row.title));
      cursor = Object(page.body['meta'])['nextCursor'];
    }
    expect(titles).toEqual(['N4', 'N3', 'N2', 'N1', 'N0']);
    expect(Object((await client.get(`${ME}?withTotal=true&pageSize=500`)).body['meta'])).toMatchObject({
      total: 5,
      pageSize: 100,
    });
    await app.close();
  });

  it('NTF-04 preferences are on by default, and off stops that channel of that category', async () => {
    const { app, notifier } = await world();
    const me = await account(app, 'me@example.test');
    const client = await app.actingAs(me, ['member']);
    expect((await client.get(`${ME}/preferences`)).body).toEqual({ data: [] });
    await notifier.send({ to: me, title: 'Both', category: 'billing', channels: ['in-app', 'mail'] });
    expect((await stored(app, me)).length).toBe(1);
    expect(mailedTo(app, 'me@example.test')).toBe(0);
    await app.runOutbox();
    expect(mailedTo(app, 'me@example.test')).toBe(1);
    const put = await client.put(`${ME}/preferences`, {
      data: [
        { category: 'billing', channel: 'mail', enabled: false },
        { category: 'news', channel: 'in-app', enabled: false },
      ],
    });
    expect(put.status).toBe(200);
    expect(rowsOf((await client.get(`${ME}/preferences`)).body)).toHaveLength(2);
    await notifier.send({ to: me, title: 'No mail', category: 'billing', channels: ['in-app', 'mail'] });
    await notifier.send({ to: me, title: 'No row', category: 'news' });
    await app.runOutbox();
    expect(mailedTo(app, 'me@example.test')).toBe(1);
    expect((await stored(app, me)).map((row) => String(row['title'])).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'Both',
      'No mail',
    ]);
    expect(await audits(app)).toContain('notifications.preferences.updated');
    const bad = await client.put(`${ME}/preferences`, { data: [{ category: 'x', channel: 'sms', enabled: true }] });
    expect(bad.status).toBe(400);
    await app.close();
  });

  it('NTF-05 the prune job deletes read notifications past the retention and every expired one', async () => {
    const { app, notifier } = await world({ NOTIFICATIONS_RETENTION_DAYS: 30 });
    const me = app.newUser().id;
    for (const title of ['old read', 'new read', 'unread', 'expired']) await notifier.send({ to: me, title });
    await runInUnitOfWork(app.db, async (em) => {
      const entity = em.getMetadata().getByClassName(Notification.name).class;
      await em.nativeUpdate(entity, { userId: me, title: 'old read' }, { readAt: new Date(Date.now() - 31 * DAY) });
      await em.nativeUpdate(entity, { userId: me, title: 'new read' }, { readAt: new Date(Date.now() - 29 * DAY) });
      await em.nativeUpdate(entity, { userId: me, title: 'expired' }, { expiresAt: new Date(Date.now() - 1000) });
    });
    await app.queue.dispatch(pruneJob, {});
    expect((await stored(app, me)).map((row) => String(row['title'])).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'new read',
      'unread',
    ]);
    expect(plugin.module.contributions['schedules']).toEqual([{ job: pruneJob, cron: '17 3 * * *' }]);
    await app.close();
  });

  it('NTF-06 each created notification emits notifications.created with its id and user', async () => {
    const { app, notifier } = await world();
    await notifier.send({ to: [app.newUser().id, app.newUser().id], title: 'Hello' });
    expect((await events(app)).filter((event) => event === 'notifications.created')).toHaveLength(2);
    await app.close();
  });

  it('NTF-07 support sends through the service route and keeps list, get and delete of the entity, nothing else', async () => {
    const { app } = await world();
    const support = await app.actingAs(app.newUser(), ['support']);
    const user = app.newUser().id;
    const sent = await support.post('/api/v1/notifications/send', { to: user, title: 'From support' });
    expect([sent.status, sent.body]).toEqual([202, { created: 1, queued: false }]);
    const entity = '/api/v1/notifications/notifications';
    const listed = rowsOf((await support.get(entity)).body);
    expect(listed.map((row) => row.title)).toEqual(['From support']);
    const id = listed[0]?.id ?? '';
    expect((await support.get(`${entity}/${id}`)).status).toBe(200);
    expect((await support.post(entity, { userId: user, title: 'x' })).status).toBe(404);
    expect((await support.patch(`${entity}/${id}`, { title: 'changed' }, 1)).status).toBe(404);
    expect((await support.delete(`${entity}/${id}`, 1)).status).toBe(204);
    const member = await app.actingAs(app.newUser(), ['member']);
    expect((await member.post('/api/v1/notifications/send', { to: user, title: 'x' })).status).toBe(403);
    await app.close();
  });

  it('BPL-05 a send is audited in its transaction, and a failed audit writes no notification', async () => {
    const { app, notifier } = await world();
    const user = app.newUser().id;
    await notifier.send({ to: user, title: 'Audited' });
    expect(await audits(app)).toEqual(['notifications.notification.sent']);
    await app.db.orm.em.getConnection().execute('drop table bk_audit_log');
    await expect(notifier.send({ to: user, title: 'Lost' })).rejects.toThrow(/bk_audit_log/i);
    expect((await stored(app, user)).map((row) => row['title'])).toEqual(['Audited']);
    await app.close();
  });

  it('AUTHZ-01 the routes of the person need the own permissions, and nobody without a session reads any', async () => {
    const { app } = await world();
    const nobody = await app.actingAs(app.newUser());
    expect((await nobody.get(ME)).status).toBe(403);
    expect((await nobody.post(`${ME}/read-all`)).status).toBe(403);
    expect((await app.anonymous().get(ME)).status).toBe(401);
    await app.close();
  });
});
