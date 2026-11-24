/**
 * BieberKit
 *
 * @file        packages/testing/src/app.test.ts
 * @description Tests of the test app: modules booted, callers with roles in a tenant, tenants kept apart, the routes, jobs and conditions of the modules, and every dialect (TST-02).
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

import { expect, it, onTestFinished } from 'vitest';
import { emitEvent, runInTransaction } from '@bieberkit/data/orm';
import { createTestApp, describeDialects } from './index.ts';
import { Account, crm, touchJob } from './fixtures.ts';

const ACCOUNTS = '/api/v1/crm/accounts';
const roles = {
  reader: ['crm.account.read'],
  writer: ['crm.account.read', 'crm.account.create', 'crm.account.update', 'crm.account.delete'],
};

describeDialects('BPL-02 the platform of the test app', ({ open }) => {
  it('BPL-02 createTestApp registers mail, queue and cache in memory', async () => {
    const app = await createTestApp({ open });
    onTestFinished(() => app.close());
    expect(app.services.mail).toMatchObject({
      send: expect.any(Function),
      sendNow: expect.any(Function),
      verify: expect.any(Function),
    });
    expect(app.services.queue).toBe(app.queue);
    expect(app.services.cache).toMatchObject({
      get: expect.any(Function),
      set: expect.any(Function),
      remember: expect.any(Function),
    });
    expect(app.mailbox).toEqual([]);
  });

  it('BPL-02 runOutbox delivers committed events once and returns their count', async () => {
    const app = await createTestApp({ open });
    onTestFinished(() => app.close());
    expect(await app.runOutbox()).toBe(0);
    await runInTransaction(app.db, async (em) => {
      emitEvent(em, { name: 'platform.probe', payload: { value: 42 } });
      await em.flush();
    });
    expect(await app.runOutbox()).toBe(1);
    expect(await app.runOutbox()).toBe(0);
  });

  it('BPL-02 a password reset request sends one message with the link', async () => {
    const app = await createTestApp({ open });
    onTestFinished(() => app.close());
    const auth = app.services.auth;
    const base = app.services.config.APP_URL;
    const headers = new Headers({ origin: base });
    await auth.api.signUpEmail({
      body: { name: 'Reader', email: 'reader@example.test', password: 'correct-test-password' },
      headers,
    });
    const response = await auth.api.requestPasswordReset({
      body: { email: 'reader@example.test', redirectTo: base + '/reset-password' },
      headers,
      asResponse: true,
    });
    expect(response.status).toBe(200);
    expect(app.mailbox).toEqual([
      expect.objectContaining({
        to: [{ address: 'reader@example.test' }],
        subject: expect.stringMatching(/password|reset/i),
        text: expect.stringMatching(/https?:\/\/\S+\/api\/auth\/reset-password\/[^/?\s]+\?callbackURL=/),
      }),
    ]);
  });

  it('AUTH-06 a reset request for an unknown address sends no mail and answers the same', async () => {
    const app = await createTestApp({ open });
    onTestFinished(() => app.close());
    const auth = app.services.auth;
    const headers = new Headers({ origin: app.services.config.APP_URL });
    await auth.api.signUpEmail({
      body: { name: 'Reader', email: 'reader@example.test', password: 'correct-test-password' },
      headers,
    });
    const known = await auth.api.requestPasswordReset({ body: { email: 'reader@example.test' }, headers });
    const before: unknown = app.mailbox;
    expect(before).toHaveLength(1);
    const unknown = await auth.api.requestPasswordReset({ body: { email: 'nobody@example.test' }, headers });
    expect(unknown).toEqual(known);
    expect(app.mailbox).toHaveLength(1);
  });
});
const dataOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown>[] => {
  const data = body['data'];
  return Array.isArray(data) ? data.map((row: unknown) => Object.fromEntries(Object.entries(Object(row)))) : [];
};

describeDialects('TST-02 the test app', ({ open }) => {
  it('TST-02 boots the entities of the modules as routes, and a module route and job beside them', async () => {
    const app = await createTestApp({ modules: [crm], roles, open });
    expect((await app.anonymous().get('/api/v1/crm/ping')).body).toEqual({ pong: true });
    const outcome = await app.queue.dispatch(touchJob, { code: 'A1' });
    expect(outcome.duplicate).toBe(false);
    await app.close();
  });

  it('TST-02 a caller with no roles can do nothing that needs a permission, and an anonymous caller is not signed in', async () => {
    const app = await createTestApp({ modules: [crm], roles, open });
    const nobody = await app.actingAs(app.newUser());
    expect((await nobody.get(ACCOUNTS)).status).toBe(403);
    expect((await app.anonymous().get(ACCOUNTS)).status).toBe(401);
    await app.close();
  });

  it('TST-02 roles give permissions: a reader reads and cannot write, a writer does both', async () => {
    const app = await createTestApp({ modules: [crm], roles, open });
    const reader = await app.actingAs(app.newUser(), ['reader']);
    const writer = await app.actingAs(app.newUser(), ['writer']);
    const owner = await app.factory(Account).create();
    const body = app.factory(Account).build({ ownerId: owner['ownerId'] });
    expect((await reader.get(ACCOUNTS)).status).toBe(200);
    expect((await reader.post(ACCOUNTS, body)).status).toBe(403);
    const created = await writer.post(ACCOUNTS, body);
    expect(created.status).toBe(201);
    await app.close();
  });

  it('TST-02 admin is every permission that the entities declare, with no role to declare', async () => {
    const app = await createTestApp({ modules: [crm], open });
    const admin = await app.actingAs(app.newUser(), ['admin']);
    const row = await app.factory(Account).create();
    const got = await admin.get(`${ACCOUNTS}/${String(row['id'])}`);
    expect(got.status).toBe(200);
    expect((await admin.delete(`${ACCOUNTS}/${String(row['id'])}`, 1)).status).toBe(204);
    await app.close();
  });

  it('TST-02 asking again for roles adds them, and a role that the app does not have names the ones it has', async () => {
    const app = await createTestApp({ modules: [crm], roles, open });
    const user = app.newUser();
    const owner = await app.factory(Account).create();
    const body = (): Record<string, unknown> => app.factory(Account).build({ ownerId: owner['ownerId'] });
    expect((await (await app.actingAs(user, ['reader'])).post(ACCOUNTS, body())).status).toBe(403);
    expect((await (await app.actingAs(user, ['writer'])).post(ACCOUNTS, body())).status).toBe(201);
    const failure = await app.actingAs(user, ['ghost']).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'TEST_ROLE_UNKNOWN' });
    expect(String(Reflect.get(Object(failure), 'fix'))).toContain('reader, writer, admin');
    await app.close();
  });

  it('TST-02 a caller of one tenant never sees the rows of another, and a role is of the tenant that it was given in', async () => {
    const app = await createTestApp({ modules: [crm], roles, open });
    const other = app.withTenant(app.newUser().id);
    await app.factory(Account).createMany(2);
    await other.factory(Account).createMany(3);
    const user = app.newUser();
    const here = await (await app.actingAs(user, ['reader'])).get(ACCOUNTS);
    // The same user has no role in the other tenant, so the other tenant says no.
    const there = await (await other.actingAs(user)).get(ACCOUNTS);
    expect(dataOf(here.body)).toHaveLength(2);
    expect(there.status).toBe(403);
    expect(other.tenant).not.toBe(app.tenant);
    expect(app.withTenant(other.tenant)).toBe(other);
    await app.close();
  });

  it('TST-02 the conditions of the modules are in force', async () => {
    const app = await createTestApp({ modules: [crm], roles: { big: ['crm.account.read-big'] }, open });
    await app.factory(Account).createMany(3, { visits: 5 });
    await app.factory(Account).createMany(2, { visits: 9 });
    const caller = await app.actingAs(app.newUser(), ['big']);
    expect(dataOf((await caller.get(ACCOUNTS)).body)).toHaveLength(2);
    await app.close();
  });

  it('TST-02 the app is quiet: what it logged is in logger, and nothing reaches the output', async () => {
    const app = await createTestApp({ modules: [crm], roles, open });
    await (await app.actingAs(app.newUser(), ['reader'])).get(ACCOUNTS);
    expect(app.logger.lines.some((line) => line.message === 'request completed')).toBe(true);
    await app.close();
  });
});

it('TST-02 a test app with no options is an empty app on SQLite in memory', async () => {
  const app = await createTestApp();
  expect(app.entities).toEqual([]);
  expect((await app.anonymous().get('/health/live')).status).toBe(200);
  await app.close();
});
