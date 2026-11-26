/**
 * BieberKit
 *
 * @file        packages/auth/src/user-lifecycle.dialects.test.ts
 * @description Tests of the user service: create with roles or by invitation, change, delete by anonymizing, sessions, password reset, MFA reset, the self and last-administrator guards, tenant scoping and atomic audit (USR-01 to USR-11, BPL-05).
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

import type { EntitySchema } from '@mikro-orm/core';
import { expect, it } from 'vitest';
import { requestContext } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { assignRole, createRole, revokeRole } from './role-service.ts';
import { NIL_TENANT } from './roles.ts';
import { AuthUserRole } from './roles.ts';
import {
  AuthAccount,
  AuthApiKey,
  AuthPasskey,
  AuthSession,
  AuthTwoFactor,
  AuthUser,
  AuthVerification,
} from './tables.ts';
import { authServer, PASSWORD, TENANT_A, TENANT_B } from './testing/auth-server.ts';
import type { AuthServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import { createUserService } from './user-service.ts';
import type { UserService } from './user-service.ts';

const DAY = 86_400_000;

interface World {
  readonly app: AuthServer;
  readonly users: UserService;
  /** The id of the `admin` system role of the nil tenant. */
  readonly adminRole: string;
  /** A signed-in holder of the administrator role. */
  readonly admin: { readonly id: string; readonly cookie: string };
}

/** A server with the administrator system role and one signed-in holder of it, the way the seed of the roles and users plugins leaves a project. */
async function world(open: Parameters<typeof authServer>[0], options: Parameters<typeof authServer>[1] = {}) {
  const app = await authServer(open, options);
  const adminRole = await createRole(app.db, { name: 'admin', permissions: ['users.manage'], system: true });
  const admin = await app.login('admin@example.test');
  await assignRole(app.db, { userId: admin.id, roleId: adminRole });
  const users = createUserService({ db: app.db, auth: app.auth });
  const made: World = { app, users, adminRole, admin };
  return made;
}

async function userRow(app: AuthServer, id: string) {
  return runInUnitOfWork(app.db, (em) => em.findOne(AuthUser, { id }));
}

/** Counts through the ORM, which writes the id in the form of the dialect: uuid, binary(16) or blob. Raw SQL with the text of an id finds nothing on MySQL and SQLite. */
const countFor = async (app: AuthServer, entity: EntitySchema, column: string, id: string): Promise<number> =>
  runInUnitOfWork(app.db, (em) => em.count(entity, { [column]: id }));

const userAudits = async (app: AuthServer): Promise<string[]> =>
  (await app.audit()).filter((entry) => entry.action.startsWith('users.')).map((entry) => entry.action);

describeDialects('USR the user service', ({ open }) => {
  it('USR-03 a user is made with roles in one transaction, and the row shows them', async () => {
    const { app, users, admin } = await world(open);
    const sales = await createRole(app.db, { name: 'sales', permissions: ['crm.deal.read'] });
    const made = await users.create({
      name: 'Ann',
      email: 'Ann@Example.test',
      password: PASSWORD,
      roles: [sales],
      actorId: admin.id,
    });
    expect(made).toMatchObject({
      name: 'Ann',
      email: 'ann@example.test',
      emailVerified: false,
      status: 'invited',
      roles: [{ id: sales, name: 'sales' }],
      mfaEnabled: false,
      lastSignInAt: null,
    });
    expect((await app.signIn('ann@example.test')).status).toBe(200);
    expect(await userAudits(app)).toContain('users.user.created');
  });

  it('USR-03 an unknown role rolls back the user', async () => {
    const { app, users, admin } = await world(open);
    await expect(
      users.create({ name: 'Bob', email: 'bob@example.test', password: PASSWORD, roles: [uuid7()], actorId: admin.id }),
    ).rejects.toMatchObject({ code: 'AUTH_ROLE_NOT_FOUND', status: 404 });
    expect(await app.rows("select id from bk_auth_users where email = 'bob@example.test'")).toEqual([]);
    expect(await userAudits(app)).not.toContain('users.user.created');
  });

  it('USR-03 a refused password states the policy of AUTH-04', async () => {
    const { users, admin } = await world(open);
    const refused = users.create({ name: 'Cy', email: 'cy@example.test', password: 'short', actorId: admin.id });
    await expect(refused).rejects.toMatchObject({ code: 'USERS_CREATE_REFUSED' });
    await expect(refused).rejects.toThrow(/8 characters/);
    await expect(refused).rejects.not.toThrow(/12 characters/);
  });

  it('USR-03 an email that is taken is USERS_EMAIL_TAKEN (409)', async () => {
    const { users, admin } = await world(open);
    await expect(
      users.create({ name: 'Ad', email: 'admin@example.test', password: PASSWORD, actorId: admin.id }),
    ).rejects.toMatchObject({ code: 'USERS_EMAIL_TAKEN', status: 409 });
  });

  it('USR-04 a changed email is unverified, a verification mail goes to the new address, and the password stays', async () => {
    const { app, users, admin } = await world(open);
    const dee = await app.login('dee@example.test');
    await app.db.orm.em
      .getConnection()
      .execute('update bk_auth_users set email_verified = ? where id = ?', [true, dee.id]);
    const changed = await users.update({ userId: dee.id, name: 'Dee', email: 'Dee2@Example.test', actorId: admin.id });
    expect(changed).toMatchObject({ name: 'Dee', email: 'dee2@example.test', emailVerified: false });
    expect(app.mails.filter((mail) => mail.kind === 'verify').map((mail) => mail.to)).toContain('dee2@example.test');
    // The password was not touched: the old one works with the new address.
    expect((await app.signIn('dee2@example.test')).status).toBe(200);
    expect(await userAudits(app)).toContain('users.user.updated');
  });

  it('USR-04 a change that changes nothing writes no audit entry and sends no mail', async () => {
    const { app, users, admin } = await world(open);
    const eve = await app.login('eve@example.test');
    const before = app.mails.length;
    await users.update({ userId: eve.id, email: 'eve@example.test', actorId: admin.id });
    expect(app.mails.length).toBe(before);
    expect(await userAudits(app)).not.toContain('users.user.updated');
  });

  it('USR-05 status is invited before the first sign in, active after it, and disabled after disable', async () => {
    const { app, users, admin } = await world(open);
    const made = await users.create({ name: 'Flo', email: 'flo@example.test', password: PASSWORD, actorId: admin.id });
    expect(made.status).toBe('invited');
    await app.signIn('flo@example.test');
    expect((await users.get(made.id)).status).toBe('active');
    await users.disable({ userId: made.id, reason: 'Left', actorId: admin.id });
    expect((await users.get(made.id)).status).toBe('disabled');
    await users.enable({ userId: made.id, actorId: admin.id });
    expect((await users.get(made.id)).status).toBe('active');
  });

  it('USR-02 a user has the number of active sessions', async () => {
    const { app, users } = await world(open);
    const gil = await app.login('gil@example.test');
    await app.signIn('gil@example.test');
    // login signs up (one session) and signs in (two); one more sign in makes three.
    expect((await users.get(gil.id)).activeSessions).toBe(3);
  });

  it('USR-06 delete anonymizes the row, frees the email, removes every way in, and keeps the audit rows', async () => {
    const { app, users, admin } = await world(open, { totp: true, apiKeys: true });
    const hal = await app.login('hal@example.test');
    const role = await createRole(app.db, { name: 'support', permissions: ['crm.deal.read'] });
    await assignRole(app.db, { userId: hal.id, roleId: role });
    await app.enableTotp(hal.cookie);
    await app.createKey({ userId: hal.id, name: 'ci', permissions: ['crm.deal.read'] });
    await runInUnitOfWork(app.db, async (em) => {
      em.create(AuthPasskey, {
        id: uuid7(),
        userId: hal.id,
        publicKey: 'key',
        credentialID: `cred-${hal.id}`,
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
      });
      await em.flush();
    });
    const ways: [string, EntitySchema, string][] = [
      ['sessions', AuthSession, 'userId'],
      ['accounts', AuthAccount, 'userId'],
      ['roles', AuthUserRole, 'userId'],
      ['two factors', AuthTwoFactor, 'userId'],
      ['passkeys', AuthPasskey, 'userId'],
      ['api keys', AuthApiKey, 'referenceId'],
    ];
    for (const [name, entity, column] of ways) {
      expect([name, (await countFor(app, entity, column, hal.id)) > 0]).toEqual([name, true]);
    }
    await users.remove({ userId: hal.id, actorId: admin.id });

    const row = await userRow(app, hal.id);
    expect(row).toMatchObject({
      email: `deleted-${hal.id}@invalid`,
      name: '',
      source: 'local',
      deletedAt: expect.any(Date),
    });
    expect(row?.externalId ?? null).toBeNull();
    for (const [name, entity, column] of ways) {
      expect([name, await countFor(app, entity, column, hal.id)]).toEqual([name, 0]);
    }
    expect((await app.signUp('hal@example.test')).status).toBe(200);
    await expect(users.get(hal.id)).rejects.toMatchObject({ code: 'USERS_NOT_FOUND', status: 404 });
    expect((await users.list({})).data.map((user) => user.id)).not.toContain(hal.id);
    const audits = await app.audit();
    expect(audits.find((entry) => entry.action === 'users.user.deleted')).toMatchObject({ actorId: admin.id });
    expect(audits.some((entry) => entry.action === 'auth.role.assigned')).toBe(true);
  });

  it('USR-07 nobody disables or deletes themselves, or takes the administrator role from themselves', async () => {
    const { app, users, adminRole, admin } = await world(open);
    const second = await app.login('second-admin@example.test');
    await assignRole(app.db, { userId: second.id, roleId: adminRole });
    await expect(users.disable({ userId: admin.id, reason: 'x', actorId: admin.id })).rejects.toMatchObject({
      code: 'USERS_SELF_ACTION',
      status: 409,
    });
    await expect(users.remove({ userId: admin.id, actorId: admin.id })).rejects.toMatchObject({
      code: 'USERS_SELF_ACTION',
    });
    await expect(
      requestContext.run({ requestId: uuid7(), userId: admin.id }, () =>
        revokeRole(app.db, { userId: admin.id, roleId: adminRole }),
      ),
    ).rejects.toMatchObject({ code: 'USERS_SELF_ACTION' });
  });

  it('USR-07 the last active administrator cannot be disabled, deleted or lose the role', async () => {
    const { app, users, adminRole, admin } = await world(open);
    const actor = await app.login('helper@example.test');
    for (const attempt of [
      () => users.disable({ userId: admin.id, reason: 'x', actorId: actor.id }),
      () => users.remove({ userId: admin.id, actorId: actor.id }),
      () => revokeRole(app.db, { userId: admin.id, roleId: adminRole }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: 'USERS_LAST_ADMIN', status: 409 });
    }
    expect((await users.get(admin.id)).status).toBe('active');
  });

  it('USR-07 a disabled administrator does not count as active', async () => {
    const { app, users, adminRole, admin } = await world(open);
    const second = await app.login('second-admin@example.test');
    await assignRole(app.db, { userId: second.id, roleId: adminRole });
    await users.disable({ userId: second.id, reason: 'Leave', actorId: admin.id });
    await expect(revokeRole(app.db, { userId: admin.id, roleId: adminRole })).rejects.toMatchObject({
      code: 'USERS_LAST_ADMIN',
    });
  });

  it('USR-07 two revokes at the same time from the last two administrators leave one', async () => {
    const { app, adminRole, admin } = await world(open);
    const second = await app.login('second-admin@example.test');
    await assignRole(app.db, { userId: second.id, roleId: adminRole });
    const results = await Promise.allSettled([
      revokeRole(app.db, { userId: admin.id, roleId: adminRole }),
      revokeRole(app.db, { userId: second.id, roleId: adminRole }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({ code: 'USERS_LAST_ADMIN' });
    expect(await countFor(app, AuthUserRole, 'roleId', adminRole)).toBe(1);
  });

  it('USR-07 the system (a seeder, the CLI) is held to the last-administrator rule too', async () => {
    const { users, admin } = await world(open);
    await expect(users.disable({ userId: admin.id, reason: 'x', actorId: null })).rejects.toMatchObject({
      code: 'USERS_LAST_ADMIN',
    });
  });

  it('USR-08 the sessions of a user are listed without their tokens, and one or all are revoked', async () => {
    const { app, users, admin } = await world(open);
    const ivy = await app.login('ivy@example.test');
    const listed = await users.sessions(ivy.id);
    expect(listed).toHaveLength(2);
    expect(listed[0]).toEqual({
      id: expect.any(String),
      ipAddress: '203.0.113.1',
      userAgent: expect.any(String),
      createdAt: expect.any(String),
      lastUsedAt: expect.any(String),
    });
    expect(JSON.stringify(listed)).not.toMatch(/token/i);
    expect(await users.revokeSession({ userId: ivy.id, sessionId: listed[0]?.id ?? '', actorId: admin.id })).toBe(true);
    expect(await users.sessions(ivy.id)).toHaveLength(1);
    // A session of another user is not found through this user.
    const other = (await users.sessions(admin.id))[0]?.id ?? '';
    expect(await users.revokeSession({ userId: ivy.id, sessionId: other, actorId: admin.id })).toBe(false);
    expect(await users.revokeSessions({ userId: ivy.id, actorId: admin.id })).toBe(1);
    expect(await users.sessions(ivy.id)).toEqual([]);
    expect(await userAudits(app)).toEqual(expect.arrayContaining(['users.user.sessions-revoked']));
  });

  it('USR-09 a reset link goes to the user, the caller never gets the token, and the limit is per target and per actor', async () => {
    const { app, admin } = await world(open);
    const users = createUserService({
      db: app.db,
      auth: app.auth,
      limits: { perTarget: { window: 900, max: 2 }, perActor: { window: 900, max: 3 } },
    });
    const jo = await app.login('jo@example.test');
    const kim = await app.login('kim@example.test');
    expect(await users.sendPasswordReset({ userId: jo.id, actorId: admin.id })).toBeUndefined();
    await users.sendPasswordReset({ userId: jo.id, actorId: admin.id });
    expect(app.mails.filter((mail) => mail.kind === 'reset' && mail.to === 'jo@example.test')).toHaveLength(2);
    await expect(users.sendPasswordReset({ userId: jo.id, actorId: admin.id })).rejects.toMatchObject({
      code: 'USERS_RATE_LIMITED',
      status: 429,
    });
    await users.sendPasswordReset({ userId: kim.id, actorId: admin.id });
    // The actor has used 3 of 3, so a fourth user is refused as well.
    const lee = await app.login('lee@example.test');
    await expect(users.sendPasswordReset({ userId: lee.id, actorId: admin.id })).rejects.toMatchObject({
      code: 'USERS_RATE_LIMITED',
    });
    expect(await userAudits(app)).toContain('users.user.password-reset-sent');
  });

  it('USR-10 an invited user has no password, gets a 7-day link, and the link sets the password and verifies the email', async () => {
    const { app, users, admin } = await world(open);
    const before = Date.now();
    const made = await users.create({ name: 'Max', email: 'max@example.test', invite: true, actorId: admin.id });
    expect(made.status).toBe('invited');
    expect(await countFor(app, AuthAccount, 'userId', made.id)).toBe(0);
    const [invite] = app.mails.filter((mail) => mail.kind === 'invite' && mail.to === 'max@example.test');
    expect(invite?.url).toContain(`/reset-password/${invite?.token ?? ''}`);
    const token = await runInUnitOfWork(app.db, (em) =>
      em.findOneOrFail(AuthVerification, { identifier: `reset-password:${invite?.token ?? ''}` }),
    );
    const expires = new Date(token.expiresAt).getTime();
    expect(expires).toBeGreaterThan(before + 7 * DAY - 60_000);
    expect(expires).toBeLessThan(Date.now() + 7 * DAY + 60_000);
    expect((await app.signIn('max@example.test')).status).toBe(401);

    const set = await app.api('POST', '/reset-password', { payload: { token: invite?.token, newPassword: PASSWORD } });
    expect(set.status).toBe(200);
    expect((await app.signIn('max@example.test')).status).toBe(200);
    expect(await users.get(made.id)).toMatchObject({ emailVerified: true, status: 'active' });
    expect(await userAudits(app)).toContain('users.user.invited');
  });

  it('USR-10 an expired invitation is refused, and resending replaces the old link', async () => {
    const { app, users, admin } = await world(open);
    const made = await users.create({ name: 'Ned', email: 'ned@example.test', invite: true, actorId: admin.id });
    const first = app.mails.find((mail) => mail.kind === 'invite')?.token ?? '';
    await users.resendInvite({ userId: made.id, actorId: admin.id });
    const second = app.mails.filter((mail) => mail.kind === 'invite').at(-1)?.token ?? '';
    expect(second).not.toBe(first);
    const old = await app.api('POST', '/reset-password', { payload: { token: first, newPassword: PASSWORD } });
    expect(old.status).toBe(400);
    await app.db.orm.em
      .getConnection()
      .execute('update bk_auth_verifications set expires_at = ? where identifier = ?', [
        new Date(Date.now() - 1000),
        `reset-password:${second}`,
      ]);
    const expired = await app.api('POST', '/reset-password', { payload: { token: second, newPassword: PASSWORD } });
    expect(expired.status).toBe(400);
  });

  it('USR-10 an invitation is resent only to a user who is still invited', async () => {
    const { app, users, admin } = await world(open);
    const oz = await app.login('oz@example.test');
    await expect(users.resendInvite({ userId: oz.id, actorId: admin.id })).rejects.toMatchObject({
      code: 'USERS_NOT_INVITED',
      status: 409,
    });
  });

  it('USR-11 an MFA reset removes TOTP and passkeys, revokes the sessions, and tells the user', async () => {
    const { app, users, admin } = await world(open, { totp: true });
    const pam = await app.login('pam@example.test');
    await app.enableTotp(pam.cookie);
    expect(await countFor(app, AuthTwoFactor, 'userId', pam.id)).toBe(1);
    await users.resetMfa({ userId: pam.id, actorId: admin.id });
    expect(await countFor(app, AuthTwoFactor, 'userId', pam.id)).toBe(0);
    expect(await countFor(app, AuthPasskey, 'userId', pam.id)).toBe(0);
    expect(await countFor(app, AuthSession, 'userId', pam.id)).toBe(0);
    expect((await userRow(app, pam.id))?.twoFactorEnabled ?? false).toBe(false);
    expect(app.mails.filter((mail) => mail.kind === 'mfa-reset').map((mail) => mail.to)).toEqual(['pam@example.test']);
    expect(await userAudits(app)).toContain('users.user.mfa-reset');
  });

  it('USR-11 nobody resets their own MFA', async () => {
    const { users, admin } = await world(open);
    await expect(users.resetMfa({ userId: admin.id, actorId: admin.id })).rejects.toMatchObject({
      code: 'USERS_SELF_ACTION',
    });
  });

  it('Decision 3 in a tenant only the holders of a role of that tenant are seen; without a tenant everybody', async () => {
    const { app, users } = await world(open);
    const a = await app.login('in-a@example.test');
    const b = await app.login('in-b@example.test');
    const roleA = await createRole(app.db, { tenantId: TENANT_A, name: 'a', permissions: [] });
    const roleB = await createRole(app.db, { tenantId: TENANT_B, name: 'b', permissions: [] });
    await assignRole(app.db, { tenantId: TENANT_A, userId: a.id, roleId: roleA });
    await assignRole(app.db, { tenantId: TENANT_B, userId: b.id, roleId: roleB });
    expect((await users.list({ tenantId: TENANT_A })).data.map((user) => user.email)).toEqual(['in-a@example.test']);
    await expect(users.get(b.id, { tenantId: TENANT_A })).rejects.toMatchObject({ code: 'USERS_NOT_FOUND' });
    expect((await users.list({})).data.map((user) => user.email)).toEqual(
      expect.arrayContaining(['admin@example.test', 'in-a@example.test', 'in-b@example.test']),
    );
    // The nil tenant is a project without tenants: it sees everybody, also a user with no role yet.
    expect((await users.list({ tenantId: NIL_TENANT })).data.length).toBe((await users.list({})).data.length);
  });

  it('BPL-05 a failed audit rolls back the change of a user', async () => {
    const { app, users, admin } = await world(open);
    const ray = await app.login('ray@example.test');
    await app.db.orm.em.getConnection().execute('drop table bk_audit_log');
    await expect(users.update({ userId: ray.id, name: 'Changed', actorId: admin.id })).rejects.toThrow(/bk_audit_log/i);
    expect((await userRow(app, ray.id))?.name).toBe('Test User');
    await expect(
      users.create({ name: 'Sue', email: 'sue@example.test', password: PASSWORD, actorId: admin.id }),
    ).rejects.toThrow(/bk_audit_log/i);
    expect(await app.rows("select id from bk_auth_users where email = 'sue@example.test'")).toEqual([]);
  });

  it('BPL-05 every mutation has its users.user.<verb> audit action with the actor', async () => {
    const { app, users, admin } = await world(open, { totp: true });
    const made = await users.create({ name: 'Tia', email: 'tia@example.test', password: PASSWORD, actorId: admin.id });
    await users.update({ userId: made.id, name: 'Tia B', actorId: admin.id });
    await users.disable({ userId: made.id, reason: 'x', actorId: admin.id });
    await users.enable({ userId: made.id, actorId: admin.id });
    await users.revokeSessions({ userId: made.id, actorId: admin.id });
    await users.resetMfa({ userId: made.id, actorId: admin.id });
    await users.remove({ userId: made.id, actorId: admin.id });
    const audits = (await app.audit()).filter((entry) => entry.action.startsWith('users.'));
    expect(audits.map((entry) => entry.action)).toEqual([
      'users.user.created',
      'users.user.updated',
      'users.user.disabled',
      'users.user.enabled',
      'users.user.sessions-revoked',
      'users.user.mfa-reset',
      'users.user.deleted',
    ]);
    expect(audits.every((entry) => entry.actorId === admin.id)).toBe(true);
  });
});

describeDialects('USR-01 the list of users', ({ open }) => {
  async function people(open_: typeof open) {
    const made = await world(open_);
    const { app, users, admin } = made;
    const sales = await createRole(app.db, { name: 'sales', permissions: [] });
    for (const [name, email] of [
      ['Anna', 'anna@example.test'],
      ['anton', 'zed@example.test'],
      ['Bea', 'bea@example.test'],
      ['Carl', 'carl@example.test'],
    ] as const) {
      await users.create({ name, email, password: PASSWORD, roles: name === 'Bea' ? [sales] : [], actorId: admin.id });
    }
    return { ...made, sales };
  }

  it('USR-01 q is a prefix of the name, in any case, or of the email', async () => {
    const { users } = await people(open);
    const emails = async (q: string) =>
      (await users.list({ q })).data.map((user) => user.email).toSorted((a, b) => a.localeCompare(b));
    expect(await emails('an')).toEqual(['anna@example.test', 'zed@example.test']);
    expect(await emails('ZE')).toEqual(['zed@example.test']);
    // A prefix, not a substring.
    expect(await emails('nna')).toEqual([]);
    // LIKE wildcards in q are plain text.
    expect(await emails('%')).toEqual([]);
  });

  it('USR-01 filters by role, status, emailVerified and a createdAt range', async () => {
    const { app, users, sales } = await people(open);
    expect((await users.list({ role: sales })).data.map((user) => user.name)).toEqual(['Bea']);
    await app.signIn('carl@example.test');
    expect((await users.list({ status: 'invited' })).data.map((user) => user.name).toSorted()).toEqual([
      'Anna',
      'Bea',
      'anton',
    ]);
    expect((await users.list({ status: 'active' })).data.map((user) => user.name).toSorted()).toEqual([
      'Carl',
      'Test User',
    ]);
    expect((await users.list({ emailVerified: true })).data).toEqual([]);
    const future = new Date(Date.now() + DAY).toISOString();
    expect((await users.list({ createdFrom: future })).data).toEqual([]);
    expect((await users.list({ createdTo: future })).data.length).toBe(5);
  });

  it('USR-01 each row carries status, roles, mfaEnabled and lastSignInAt', async () => {
    const { users, adminRole } = await people(open);
    const [row] = (await users.list({ q: 'admin@' })).data;
    expect(row).toEqual({
      id: expect.any(String),
      name: 'Test User',
      email: 'admin@example.test',
      emailVerified: false,
      status: 'active',
      source: 'local',
      roles: [{ id: adminRole, name: 'admin' }],
      mfaEnabled: false,
      lastSignInAt: expect.any(String),
      createdAt: expect.any(String),
    });
  });

  it('USR-01 each sort pages with a cursor, never repeats a row and never skips one', async () => {
    const { users } = await people(open);
    const orders: Record<string, string[]> = {};
    for (const sort of ['createdAt', '-createdAt', 'name', '-name', 'email', '-email'] as const) {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await users.list({ sort, pageSize: 2, ...(cursor === undefined ? {} : { cursor }) });
        seen.push(...page.data.map((user) => user.email));
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      expect([sort, seen.length, new Set(seen).size]).toEqual([sort, 5, 5]);
      orders[sort] = seen;
    }
    expect(orders['email']).toEqual(orders['email']?.toSorted((a, b) => a.localeCompare(b)));
    expect(orders['-email']).toEqual(orders['email']?.toReversed());
  });

  it('BPL-06 the page size is at most 100, and the total is counted only when asked', async () => {
    const { users } = await people(open);
    const page = await users.list({ pageSize: 500 });
    expect(page.data.length).toBe(5);
    expect(page.total).toBeUndefined();
    expect((await users.list({ pageSize: 2, withTotal: true })).total).toBe(5);
  });
});
