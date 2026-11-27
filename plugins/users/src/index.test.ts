/**
 * BieberKit
 *
 * @file        plugins/users/src/index.test.ts
 * @description Tests of the users plugin routes over the user service: list filters and paging, detail, create with roles or by invitation, change, disable, delete, sessions, reset mails after commit, MFA reset, the signed-in person, tenants and permissions (USR-01 to USR-12, ROL-05, BPL-05, BPL-06, AUTHZ-01).
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
import { AuthUserGroup, AuthUserRole } from '@bieberkit/auth';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { createTestApp, describeDialects } from '@bieberkit/testing';
import type { TestApp } from '@bieberkit/testing';
import roles from '@bieberkit/plugin-roles';
import plugin from './index.ts';

const USERS = '/api/v1/users/users';
const NIL = '00000000-0000-0000-0000-000000000000';
const PASSWORD = 'correct horse battery staple';

interface Row {
  id: string;
  name: string;
  email: string;
  status: string;
}

function rowsOf(body: Readonly<Record<string, unknown>>): Row[] {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
}

const metaOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const meta = body['meta'];
  return typeof meta === 'object' && meta !== null ? Object.fromEntries(Object.entries(meta)) : {};
};

/** Makes a real account through the service, outside of any route, as a seeder would. */
async function make(app: TestApp, email: string, name = 'Someone'): Promise<string> {
  const made = await app.services.auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  return made.user.id;
}

/** A manager whose role is limited to the users of `group` (ROL-09). */
async function limited(app: TestApp, email: string, group: string) {
  const id = await make(app, email);
  const client = await app.actingAs(id, ['manager']);
  await runInUnitOfWork(app.db, (em) => em.nativeUpdate(AuthUserRole, { userId: id }, { scopeGroup: group }));
  return { id, client };
}

describeDialects('USR the users plugin', ({ open }) => {
  async function world(pluginEnv: Record<string, unknown> = {}) {
    const app = await createTestApp({
      modules: [roles.module, plugin.module],
      open,
      tenant: NIL,
      pluginEnv,
      roles: {
        manager: ['users.read', 'users.manage', 'roles.read'],
        reader: ['users.read'],
        support: ['users.read', 'users.revoke-sessions', 'users.reset-mfa'],
      },
    });
    const managerId = await make(app, 'manager@example.test');
    const manager = await app.actingAs(managerId, ['manager']);
    return { app, manager, managerId };
  }

  it('12 the seed makes the administrator with the administrator role, and running it again changes nothing', async () => {
    const { app, manager } = await world({ USERS_ADMIN_EMAIL: 'Boss@Example.com', USERS_ADMIN_PASSWORD: PASSWORD });
    await roles.seed?.(app.services);
    await plugin.seed?.(app.services);
    await plugin.seed?.(app.services);
    const found = rowsOf((await manager.get(`${USERS}?q=boss@`)).body);
    expect(found.map((row) => row.email)).toEqual(['boss@example.com']);
    await app.close();
  });

  it('12 the seed makes no account when there is no password', async () => {
    const { app, manager } = await world({ USERS_ADMIN_EMAIL: 'boss@example.com' });
    await roles.seed?.(app.services);
    await plugin.seed?.(app.services);
    const found = await manager.get(`${USERS}?q=boss@`);
    expect([found.status, rowsOf(found.body)]).toEqual([200, []]);
    await app.close();
  });

  it('USR-01 the list filters by q and status, sorts, and pages with the meta of the entity routes', async () => {
    const { app, manager } = await world();
    for (const name of ['anna', 'bert', 'carl']) await make(app, `${name}@example.test`, name);
    const anna = await manager.get(`${USERS}?q=AN`);
    expect(rowsOf(anna.body).map((row) => row.email)).toEqual(['anna@example.test']);
    const first = await manager.get(`${USERS}?sort=email&pageSize=2`);
    expect(metaOf(first.body)).toMatchObject({ pageSize: 2, nextCursor: expect.any(String) });
    expect(metaOf(first.body)).not.toHaveProperty('total');
    const second = await manager.get(
      `${USERS}?sort=email&pageSize=2&cursor=${encodeURIComponent(String(metaOf(first.body)['nextCursor']))}`,
    );
    expect([...rowsOf(first.body), ...rowsOf(second.body)].map((row) => row.email)).toEqual([
      'anna@example.test',
      'bert@example.test',
      'carl@example.test',
      'manager@example.test',
    ]);
    expect((await manager.get(`${USERS}?status=invited`)).status).toBe(200);
    expect((await manager.get(`${USERS}?status=gone`)).status).toBe(400);
    await app.close();
  });

  it('BPL-06 a page size above 100 is cut to 100, and the total is given only with withTotal', async () => {
    const { app, manager } = await world();
    const big = await manager.get(`${USERS}?pageSize=500`);
    expect(big.status).toBe(200);
    expect(metaOf(big.body)['pageSize']).toBe(100);
    expect(metaOf((await manager.get(`${USERS}?withTotal=true`)).body)['total']).toBe(1);
    await app.close();
  });

  it('USR-02 the detail has the row and the number of active sessions; an unknown id is 404', async () => {
    const { app, manager, managerId } = await world();
    const detail = await manager.get(`${USERS}/${managerId}`);
    expect(detail.body).toMatchObject({ id: managerId, email: 'manager@example.test', activeSessions: 1 });
    const missing = await manager.get(`${USERS}/${NIL}`);
    expect([missing.status, missing.body['code']]).toEqual([404, 'USERS_NOT_FOUND']);
    await app.close();
  });

  it('USR-03 a user is made with roles, and a weak password is refused with the real policy', async () => {
    const { app, manager } = await world();
    const list = rowsOf((await manager.get('/api/v1/roles/roles')).body);
    const role = list[0]?.id ?? '';
    const made = await manager.post(USERS, {
      name: 'Ann',
      email: 'ann@example.test',
      password: PASSWORD,
      roles: [role],
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ email: 'ann@example.test', status: 'invited', roles: [{ id: role }] });
    const taken = await manager.post(USERS, { name: 'Ann', email: 'ann@example.test', password: PASSWORD });
    expect([taken.status, taken.body['code']]).toEqual([409, 'USERS_EMAIL_TAKEN']);
    const weak = await manager.post(USERS, { name: 'Bob', email: 'bob@example.test', password: 'short' });
    expect(weak.body['code']).toBe('USERS_CREATE_REFUSED');
    expect(JSON.stringify(weak.body)).toMatch(/8 characters/);
    expect(JSON.stringify(weak.body)).not.toMatch(/12 characters/);
    expect((await manager.post(USERS, { name: 'C', email: 'c@example.test' })).status).toBe(400);
    await app.close();
  });

  it('USR-10 an invitation sends its mail only after commit, and can be sent again', async () => {
    const { app, manager } = await world();
    const made = await manager.post(USERS, { name: 'Max', email: 'max@example.test', invite: true });
    expect(made.status).toBe(201);
    expect(made.body['status']).toBe('invited');
    expect(app.mailbox.filter((message) => message.to.some((to) => to.address === 'max@example.test'))).toEqual([]);
    await app.runOutbox();
    expect(app.mailbox.some((message) => message.to.some((to) => to.address === 'max@example.test'))).toBe(true);
    const again = await manager.post(`${USERS}/${String(made.body['id'])}/resend-invite`);
    expect(again.status).toBe(202);
    expect(
      (await manager.post(USERS, { name: 'X', email: 'x@example.test', invite: true, password: PASSWORD })).status,
    ).toBe(400);
    await app.close();
  });

  it('USR-04 a patch changes the name and the email, and never takes a password', async () => {
    const { app, manager } = await world();
    const id = await make(app, 'dee@example.test');
    const changed = await manager.patch(`${USERS}/${id}`, { name: 'Dee', email: 'dee2@example.test' }, 0);
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'Dee', email: 'dee2@example.test', emailVerified: false });
    expect((await manager.patch(`${USERS}/${id}`, { password: PASSWORD }, 0)).status).toBe(400);
    await app.close();
  });

  it('USR-05 disable needs a reason, and enable brings the user back', async () => {
    const { app, manager } = await world();
    const id = await make(app, 'eve@example.test');
    expect((await manager.post(`${USERS}/${id}/disable`, {})).status).toBe(400);
    const disabled = await manager.post(`${USERS}/${id}/disable`, { reason: 'Left the company' });
    expect([disabled.status, disabled.body['status']]).toEqual([200, 'disabled']);
    const enabled = await manager.post(`${USERS}/${id}/enable`);
    expect([enabled.status, enabled.body['status']]).toEqual([200, 'active']);
    await app.close();
  });

  it('USR-06 and USR-07 delete removes a user; deleting oneself is USERS_SELF_ACTION', async () => {
    const { app, manager, managerId } = await world();
    const id = await make(app, 'gone@example.test');
    expect((await manager.delete(`${USERS}/${id}`, 0)).status).toBe(204);
    expect((await manager.get(`${USERS}/${id}`)).status).toBe(404);
    const self = await manager.delete(`${USERS}/${managerId}`, 0);
    expect([self.status, self.body['code']]).toEqual([409, 'USERS_SELF_ACTION']);
    await app.close();
  });

  it('USR-08 sessions are listed and revoked with users.revoke-sessions', async () => {
    const { app, manager } = await world();
    const id = await make(app, 'ivy@example.test');
    const support = await app.actingAs(await make(app, 'support@example.test'), ['support']);
    const listed = await support.get(`${USERS}/${id}/sessions`);
    expect(rowsOf(listed.body)).toHaveLength(1);
    const sessionId = rowsOf(listed.body)[0]?.id ?? '';
    expect((await manager.delete(`${USERS}/${id}/sessions/${sessionId}`, 0)).status).toBe(403);
    expect((await support.delete(`${USERS}/${id}/sessions/${sessionId}`, 0)).status).toBe(204);
    expect((await support.delete(`${USERS}/${id}/sessions`, 0)).status).toBe(204);
    expect(rowsOf((await support.get(`${USERS}/${id}/sessions`)).body)).toEqual([]);
    await app.close();
  });

  it('USR-09 a reset link is sent after commit and the answer has no token', async () => {
    const { app, manager } = await world();
    const id = await make(app, 'jo@example.test');
    const sent = await manager.post(`${USERS}/${id}/reset-password`);
    expect(sent.status).toBe(202);
    expect(JSON.stringify(sent.body)).not.toMatch(/token/i);
    await app.runOutbox();
    expect(app.mailbox.some((message) => message.to.some((to) => to.address === 'jo@example.test'))).toBe(true);
    await app.close();
  });

  it('USR-11 an MFA reset needs users.reset-mfa', async () => {
    const { app, manager } = await world();
    const id = await make(app, 'pam@example.test');
    expect((await manager.post(`${USERS}/${id}/mfa/reset`)).status).toBe(403);
    const support = await app.actingAs(await make(app, 'support@example.test'), ['support']);
    expect((await support.post(`${USERS}/${id}/mfa/reset`)).status).toBe(204);
    await app.close();
  });

  it('POL-02 /users/me shows mfaEnrolBy to a user in the grace of the second factor, and only then', async () => {
    const { app } = await world();
    const id = await make(app, 'grace@example.test');
    const me = await app.actingAs(id);
    expect((await me.get('/api/v1/users/me')).body).not.toHaveProperty('mfaEnrolBy');
    const by = '2026-12-01T00:00:00.000Z';
    expect((await me.get('/api/v1/users/me', { 'x-test-mfa-enrol-by': by })).body).toMatchObject({
      id,
      mfaEnrolBy: by,
    });
    await app.close();
  });

  it('ROL-09 a manager whose role is limited to a group lists, reads and changes only the users of that group', async () => {
    const { app, manager } = await world();
    const ann = await make(app, 'ann@example.test', 'Ann');
    const bo = await make(app, 'bo@example.test', 'Bo');
    await manager.put(`${USERS}/${ann}/groups`, { groups: ['hr'] }, {});
    await manager.put(`${USERS}/${bo}/groups`, { groups: ['sales'] }, {});
    const hr = await limited(app, 'hr-boss@example.test', 'hr');
    await manager.put(`${USERS}/${hr.id}/groups`, { groups: ['hr'] }, {});
    expect(rowsOf((await hr.client.get(USERS)).body).map((row) => row.email)).toEqual([
      'ann@example.test',
      'hr-boss@example.test',
    ]);
    expect((await hr.client.get(`${USERS}/${ann}`)).body).toMatchObject({ id: ann, groups: ['hr'] });
    for (const call of [
      () => hr.client.get(`${USERS}/${bo}`),
      () => hr.client.patch(`${USERS}/${bo}`, { name: 'X' }, 0),
      () => hr.client.post(`${USERS}/${bo}/disable`, { reason: 'x' }),
      () => hr.client.post(`${USERS}/${bo}/reset-password`, {}),
    ]) {
      const refused = await call();
      expect([refused.status, refused.body['code']]).toEqual([404, 'USERS_NOT_FOUND']);
    }
    expect((await hr.client.patch(`${USERS}/${ann}`, { name: 'Ann H' }, 0)).status).toBe(200);
    await app.close();
  });

  it('ROL-09 an unlimited manager still sees everybody', async () => {
    const { app, manager } = await world();
    const bo = await make(app, 'bo@example.test');
    await manager.put(`${USERS}/${bo}/groups`, { groups: ['sales'] }, {});
    const all = rowsOf((await manager.get(USERS)).body).map((row) => row.email);
    expect(all).toContain('bo@example.test');
    expect(all).toContain('manager@example.test');
    await app.close();
  });

  it('ROL-09 a limited manager makes a user only inside their groups, and cannot move a user out of them (USERS_OUT_OF_SCOPE)', async () => {
    const { app } = await world();
    const hr = await limited(app, 'hr-boss@example.test', 'hr');
    const outside = await hr.client.post(USERS, {
      name: 'N',
      email: 'n@example.test',
      password: PASSWORD,
      groups: ['sales'],
    });
    expect([outside.status, outside.body['code']]).toEqual([403, 'USERS_OUT_OF_SCOPE']);
    const none = await hr.client.post(USERS, { name: 'N', email: 'n@example.test', password: PASSWORD });
    expect([none.status, none.body['code']]).toEqual([403, 'USERS_OUT_OF_SCOPE']);
    const made = await hr.client.post(USERS, {
      name: 'N',
      email: 'n@example.test',
      password: PASSWORD,
      groups: ['hr'],
    });
    expect([made.status, made.body['groups']]).toEqual([201, ['hr']]);
    const id = String(made.body['id']);
    const moved = await hr.client.put(`${USERS}/${id}/groups`, { groups: ['sales'] }, {});
    expect([moved.status, moved.body['code']]).toEqual([403, 'USERS_OUT_OF_SCOPE']);
    await app.close();
  });

  it('ROL-09 groups are audited, and a user who is deleted leaves no groups', async () => {
    const { app, manager } = await world();
    const ann = await make(app, 'ann@example.test');
    const set = await manager.put(`${USERS}/${ann}/groups`, { groups: ['b', 'a', 'a'] }, {});
    expect(set.body['groups']).toEqual(['a', 'b']);
    expect((await manager.put(`${USERS}/${ann}/groups`, { groups: ['a'] }, {})).body['groups']).toEqual(['a']);
    expect((await manager.delete(`${USERS}/${ann}`, 0)).status).toBe(204);
    expect(await runInUnitOfWork(app.db, (em) => em.count(AuthUserGroup, { userId: ann }))).toBe(0);
    await app.close();
  });

  it('USR-12 the signed-in person reads and renames themselves, and nothing else', async () => {
    const { app } = await world();
    const id = await make(app, 'me@example.test');
    const me = await app.actingAs(id);
    const read = await me.get('/api/v1/users/me');
    expect(read.body).toMatchObject({ id, email: 'me@example.test', roles: [] });
    const renamed = await me.patch('/api/v1/users/me', { name: 'Me' }, 0);
    expect([renamed.status, renamed.body['name']]).toEqual([200, 'Me']);
    expect((await me.patch('/api/v1/users/me', { email: 'other@example.test' }, 0)).status).toBe(400);
    expect((await app.anonymous().get('/api/v1/users/me')).status).toBe(401);
    await app.close();
  });

  it('Decision 3 in a tenant a caller sees only the holders of a role there; the nil tenant sees everybody', async () => {
    const { app, manager, managerId } = await world();
    const other = app.withTenant('0190a0a0-0000-7000-8000-000000000001');
    const stranger = await make(app, 'stranger@example.test');
    const inside = await other.actingAs(stranger, ['reader']);
    expect(rowsOf((await inside.get(USERS)).body).map((row) => row.email)).toEqual(['stranger@example.test']);
    const seen = await inside.get(`${USERS}/${managerId}`);
    expect([seen.status, seen.body['code']]).toEqual([404, 'USERS_NOT_FOUND']);
    // A project without tenants works in the nil tenant, where a user with no role yet is still listed.
    expect(rowsOf((await manager.get(USERS)).body).map((row) => row.email)).toEqual(
      expect.arrayContaining(['manager@example.test', 'stranger@example.test']),
    );
    await app.close();
  });

  it('ROL-05 the effective permissions of a user say which roles grant them', async () => {
    const { app, manager, managerId } = await world();
    const found = await manager.get(`${USERS}/${managerId}/permissions`);
    expect(found.status).toBe(200);
    expect(found.body['data']).toEqual(
      expect.arrayContaining([{ permission: 'users.read', roles: [{ id: expect.any(String), name: 'manager' }] }]),
    );
    await app.close();
  });

  it('AUTHZ-01 each route needs its permission, and no answer carries a password', async () => {
    const { app, manager } = await world();
    const id = await make(app, 'kim@example.test');
    const reader = await app.actingAs(await make(app, 'reader@example.test'), ['reader']);
    const nobody = await app.actingAs(await make(app, 'nobody@example.test'));
    expect((await nobody.get(USERS)).status).toBe(403);
    expect((await reader.get(USERS)).status).toBe(200);
    expect((await reader.post(USERS, { name: 'n', email: 'n@example.test', password: PASSWORD })).status).toBe(403);
    expect((await reader.post(`${USERS}/${id}/disable`, { reason: 'x' })).status).toBe(403);
    expect((await reader.post(`${USERS}/${id}/reset-password`)).status).toBe(403);
    expect((await reader.get(`${USERS}/${id}/sessions`)).status).toBe(403);
    expect(JSON.stringify((await manager.get(USERS)).body)).not.toContain(PASSWORD);
    await app.close();
  });
});
