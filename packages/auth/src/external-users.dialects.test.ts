/**
 * BieberKit
 *
 * @file        packages/auth/src/external-users.dialects.test.ts
 * @description Tests of users that an identity provider manages: the guards of the users routes and the calls of a provider plugin on three dialects (IDN-01 to IDN-03).
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
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { assignRole, createRole } from './role-service.ts';
import { AuthSession, AuthUser } from './tables.ts';
import { authServer } from './testing/auth-server.ts';
import type { AuthServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import { createUserService } from './user-service.ts';
import type { UserService } from './user-service.ts';

const OKTA = 'sso:okta';

const managed = { code: 'USERS_MANAGED_EXTERNALLY', status: 409 };
/** A fixture provider plugin: it only calls the two functions that the user service gives to providers (IDN-03). */
const provider = (users: UserService) => ({
  provision: (externalId: string, email: string, name = 'Ann') =>
    users.upsertExternalUser({ source: OKTA, externalId, email, name }),
  suspend: (externalId: string) => users.setExternalDisabled({ source: OKTA, externalId, disabled: true }),
  restore: (externalId: string) => users.setExternalDisabled({ source: OKTA, externalId, disabled: false }),
});

async function world(open: Parameters<typeof authServer>[0]) {
  const app = await authServer(open);
  const adminRole = await createRole(app.db, { name: 'admin', permissions: ['users.manage'], system: true });
  const admin = await app.login('admin@example.test');
  await assignRole(app.db, { userId: admin.id, roleId: adminRole });
  const users = createUserService({ db: app.db, auth: app.auth });
  return { app, users, admin, adminRole, idp: provider(users) };
}

const audits = async (app: AuthServer, prefix: string) =>
  (await app.audit()).filter((entry) => entry.action.startsWith(prefix));

describeDialects('IDN users that a provider manages', ({ open }) => {
  it('IDN-03 a provider makes a user with its source and external id, verified, with no password and an audit entry that names the provider', async () => {
    const { app, idp } = await world(open);
    const made = await idp.provision('00u1', 'Ann@Example.test');
    expect(made).toMatchObject({ email: 'ann@example.test', source: OKTA, emailVerified: true, status: 'active' });
    const accounts = await app.rows('select count(*) as n from bk_auth_accounts');
    expect(Number(accounts[0]?.['n'])).toBe(1);
    const created = (await audits(app, 'users.user.created')).filter((entry) => entry.actorId === null);
    expect(created).toHaveLength(1);
    expect(created[0]?.data).toMatchObject({ provider: OKTA, externalId: '00u1' });
  });

  it('IDN-03 the same identity again updates the same user and is not a second one', async () => {
    const { app, idp } = await world(open);
    const first = await idp.provision('00u1', 'ann@example.test');
    const again = await idp.provision('00u1', 'ann.new@example.test', 'Ann Nguyen');
    expect(again).toMatchObject({ id: first.id, email: 'ann.new@example.test', name: 'Ann Nguyen' });
    expect((await audits(app, 'users.user.updated')).at(-1)?.data).toMatchObject({ provider: OKTA });
    expect(await runInUnitOfWork(app.db, (em) => em.count(AuthUser, { source: OKTA }))).toBe(1);
  });

  it('IDN-03 an email that a local user already has is refused, so a provider cannot take over an account', async () => {
    const { users, idp } = await world(open);
    await expect(idp.provision('00u9', 'admin@example.test')).rejects.toMatchObject({ code: 'USERS_EMAIL_TAKEN' });
    expect((await users.list({})).data.filter((user) => user.source === OKTA)).toHaveLength(0);
  });

  it('IDN-03 a source that is not sso: or scim: is refused', async () => {
    const { users } = await world(open);
    for (const source of ['local', 'okta', 'sso:', 'sso:A B']) {
      await expect(
        users.upsertExternalUser({ source, externalId: '1', email: 'x@example.test', name: 'X' }),
      ).rejects.toMatchObject({ code: 'USERS_EXTERNAL_INVALID', status: 400 });
    }
  });

  it('IDN-01 the same external id under two providers is two users, and under one it is unique', async () => {
    const { users, idp } = await world(open);
    const a = await idp.provision('7', 'a@example.test');
    const b = await users.upsertExternalUser({
      source: 'scim:azure',
      externalId: '7',
      email: 'b@example.test',
      name: 'B',
    });
    expect(a.id).not.toBe(b.id);
  });

  it('IDN-03 a provider disables and enables its user, which ends the sessions and writes the same entries as a local change', async () => {
    const { app, idp } = await world(open);
    const made = await idp.provision('00u1', 'ann@example.test');
    expect(await idp.suspend('00u1')).toBe(true);
    expect(await idp.suspend('00u1')).toBe(false);
    expect(await runInUnitOfWork(app.db, (em) => em.count(AuthSession, { userId: made.id }))).toBe(0);
    const disabled = (await audits(app, 'users.user.disabled')).at(-1);
    expect(disabled).toMatchObject({ actorId: null, data: { reason: 'provider', provider: OKTA } });
    expect(await idp.restore('00u1')).toBe(true);
    expect((await audits(app, 'users.user.enabled')).at(-1)?.data).toMatchObject({ provider: OKTA });
  });

  it('IDN-03 an unknown external id is USERS_NOT_FOUND (404)', async () => {
    const { idp } = await world(open);
    await expect(idp.suspend('missing')).rejects.toMatchObject({ code: 'USERS_NOT_FOUND', status: 404 });
  });

  it('IDN-02 the users service refuses to change the name, the email and the disabled state of a managed user', async () => {
    const { users, admin, idp } = await world(open);
    const made = await idp.provision('00u1', 'ann@example.test');
    await expect(users.update({ userId: made.id, name: 'Other', actorId: admin.id })).rejects.toMatchObject(managed);
    await expect(
      users.update({ userId: made.id, email: 'other@example.test', actorId: admin.id }),
    ).rejects.toMatchObject(managed);
    await expect(users.disable({ userId: made.id, reason: 'x', actorId: admin.id })).rejects.toMatchObject(managed);
    await idp.suspend('00u1');
    await expect(users.enable({ userId: made.id, actorId: admin.id })).rejects.toMatchObject(managed);
  });

  it('IDN-02 the override lets a caller change a managed user, and a local user is never refused', async () => {
    const { users, admin, idp } = await world(open);
    const made = await idp.provision('00u1', 'ann@example.test');
    const changed = await users.update({ userId: made.id, name: 'Other', actorId: admin.id, overrideExternal: true });
    expect(changed.name).toBe('Other');
    expect(await users.disable({ userId: made.id, reason: 'x', actorId: admin.id, overrideExternal: true })).toBe(true);
    const local = await users.create({ name: 'Bo', email: 'bo@example.test', invite: true, actorId: admin.id });
    expect((await users.update({ userId: local.id, name: 'Bob', actorId: admin.id })).name).toBe('Bob');
  });

  it('IDN-02 a managed user does not refuse a change that touches no managed field', async () => {
    const { users, admin, idp } = await world(open);
    const made = await idp.provision('00u1', 'ann@example.test');
    const same = await users.update({ userId: made.id, actorId: admin.id });
    expect(same.id).toBe(made.id);
  });

  it('IDN-03 a provider cannot disable the last active administrator', async () => {
    const { users, admin, adminRole, app, idp } = await world(open);
    const external = await idp.provision('adm', 'adm@example.test');
    await assignRole(app.db, { userId: external.id, roleId: adminRole });
    await users.disable({ userId: admin.id, reason: 'left', actorId: null });
    await expect(idp.suspend('adm')).rejects.toMatchObject({ code: 'USERS_LAST_ADMIN', status: 409 });
  });
});
