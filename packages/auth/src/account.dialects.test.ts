/**
 * BieberKit
 *
 * @file        packages/auth/src/account.dialects.test.ts
 * @description Tests of what the account screens need from authentication, on the three dialects: where a password link leads, which sessions end, and what the principal says about the second factor (USR-09, USR-10, AUTH-02, AUTH-03, AUTH-05, AUTH-06, POL-02).
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
import { principalOfSession } from './authenticator.ts';
import type { AuthSecondaryStorage } from './better-auth.ts';
import { DEFAULT_POLICY } from './policy.ts';
import type { PolicyReader } from './policy.ts';
import { assignRole, createRole } from './role-service.ts';
import { authServer, BASE_URL, cookieNamed, cookieOf, PASSWORD } from './testing/auth-server.ts';
import type { AuthServer, ServerReply } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import { secretOf, totpCode } from './testing/totp.ts';
import { createUserService } from './user-service.ts';

const RESET_PAGE = `${BASE_URL}/admin/reset-password`;
const NEW_PASSWORD = 'another long enough password';

async function world(open: Parameters<typeof authServer>[0], options: Parameters<typeof authServer>[1] = {}) {
  const app = await authServer(open, options);
  const role = await createRole(app.db, { name: 'admin', permissions: ['users.manage'], system: true });
  const admin = await app.login('admin@example.test');
  await assignRole(app.db, { userId: admin.id, roleId: role });
  return { app, admin, users: createUserService({ db: app.db, auth: app.auth }) };
}

const mailOfKind = (app: AuthServer, kind: string) => app.mails.filter((mail) => mail.kind === kind).at(-1);

/** Opens a mailed link as a browser does, and answers where it sends the person. */
async function follow(app: AuthServer, link: string): Promise<URL> {
  const target = new URL(link);
  const reply = await app.send('GET', target.pathname + target.search);
  expect(reply.status).toBe(302);
  return new URL(String(reply.headers['location']));
}

const signedIn = async (app: AuthServer, cookie: string): Promise<boolean> => {
  const user = (await app.api('GET', '/get-session', { cookie })).body['user'];
  return typeof user === 'object' && user !== null;
};

/** Signs up, then signs in twice, from two addresses, so the account has two sessions. */
async function twoSessions(app: AuthServer, email: string) {
  const { cookie: first } = await app.login(email);
  const second = cookieOf(await app.signIn(email, { ip: '203.0.113.20' })) ?? '';
  expect(second).not.toBe('');
  expect(second).not.toBe(first);
  return { first, second };
}

/** An in-memory secondary storage: the interface that Valkey fills in production (AUTH-02). */
function memoryStorage(): AuthSecondaryStorage {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    getAndDelete: async (key) => {
      const found = values.get(key) ?? null;
      values.delete(key);
      return found;
    },
    increment: async (key) => {
      const next = Number(values.get(key) ?? '0') + 1;
      values.set(key, String(next));
      return next;
    },
    set: async (key, value) => void values.set(key, value),
    delete: async (key) => void values.delete(key),
  };
}

describeDialects('UI-26 the password links', ({ open }) => {
  it('USR-10 the link of an invitation comes back to the reset page of the admin, marked invite=1', async () => {
    const { app, users, admin } = await world(open, { pages: { resetPassword: RESET_PAGE } });
    await users.create({ name: 'Max', email: 'max@example.test', invite: true, actorId: admin.id });
    const invite = mailOfKind(app, 'invite');
    const landed = await follow(app, invite?.url ?? '');
    expect(landed.origin + landed.pathname).toBe(RESET_PAGE);
    expect(landed.searchParams.get('invite')).toBe('1');
    expect(landed.searchParams.get('token')).toBe(invite?.token);
  });

  it('USR-09 the link of a reset by an administrator comes back to the same page without invite', async () => {
    const { app, users, admin } = await world(open, { pages: { resetPassword: RESET_PAGE } });
    const kim = await app.login('kim@example.test');
    await users.sendPasswordReset({ userId: kim.id, actorId: admin.id });
    const mail = mailOfKind(app, 'reset');
    const landed = await follow(app, mail?.url ?? '');
    expect(landed.origin + landed.pathname).toBe(RESET_PAGE);
    expect(landed.searchParams.has('invite')).toBe(false);
    expect(landed.searchParams.get('token')).toBe(mail?.token);
  });

  it('USR-10 without pages the link comes back to /reset-password of the origin, for a front end of the project', async () => {
    const { app, users, admin } = await world(open);
    await users.create({ name: 'Max', email: 'max@example.test', invite: true, actorId: admin.id });
    const landed = await follow(app, mailOfKind(app, 'invite')?.url ?? '');
    expect(landed.origin + landed.pathname).toBe(`${BASE_URL}/reset-password`);
    expect(landed.searchParams.has('invite')).toBe(false);
  });

  it('UI-26 a link that is too old comes back to the page with error=INVALID_TOKEN', async () => {
    const { app, users, admin } = await world(open, { pages: { resetPassword: RESET_PAGE } });
    await users.create({ name: 'Ned', email: 'ned@example.test', invite: true, actorId: admin.id });
    const invite = mailOfKind(app, 'invite');
    await app.db.orm.em
      .getConnection()
      .execute('update bk_auth_verifications set expires_at = ? where identifier = ?', [
        new Date(Date.now() - 1000),
        `reset-password:${invite?.token ?? ''}`,
      ]);
    const landed = await follow(app, invite?.url ?? '');
    expect(landed.origin + landed.pathname).toBe(RESET_PAGE);
    expect(landed.searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(landed.searchParams.has('token')).toBe(false);
  });
});

describeDialects('UI-26 the sessions of an account', ({ open }) => {
  const resetOwnPassword = async (app: AuthServer, email: string): Promise<ServerReply> => {
    await app.api('POST', '/request-password-reset', { payload: { email, redirectTo: RESET_PAGE } });
    return app.api('POST', '/reset-password', {
      payload: { token: mailOfKind(app, 'reset')?.token, newPassword: NEW_PASSWORD },
    });
  };

  it('AUTH-06 a password that is set through a link ends every session of the account', async () => {
    const app = await authServer(open);
    const { first, second } = await twoSessions(app, 'an@example.vn');
    const other = await app.login('binh@example.vn');
    expect((await resetOwnPassword(app, 'an@example.vn')).status).toBe(200);
    expect(await signedIn(app, first)).toBe(false);
    expect(await signedIn(app, second)).toBe(false);
    expect(await signedIn(app, other.cookie)).toBe(true);
  });

  it('AUTH-02 the sessions that a reset ends are gone from the secondary storage as well', async () => {
    const app = await authServer(open, { secondaryStorage: memoryStorage() });
    const { first, second } = await twoSessions(app, 'an@example.vn');
    expect((await resetOwnPassword(app, 'an@example.vn')).status).toBe(200);
    expect(await signedIn(app, first)).toBe(false);
    expect(await signedIn(app, second)).toBe(false);
  });

  it('AUTH-05 turning the second factor on ends the other sessions of the account, and no session of another account', async () => {
    const app = await authServer(open, { totp: true });
    const { first, second } = await twoSessions(app, 'an@example.vn');
    const other = await app.login('binh@example.vn');
    const enabled = await app.enableTotp(first);
    expect(await signedIn(app, enabled.cookie)).toBe(true);
    expect(await signedIn(app, second)).toBe(false);
    expect(await signedIn(app, first)).toBe(false);
    expect(await signedIn(app, other.cookie)).toBe(true);
  });

  it('AUTH-05 the other sessions are gone from the secondary storage as well', async () => {
    const app = await authServer(open, { totp: true, secondaryStorage: memoryStorage() });
    const { first, second } = await twoSessions(app, 'an@example.vn');
    const enabled = await app.enableTotp(first);
    expect(await signedIn(app, enabled.cookie)).toBe(true);
    expect(await signedIn(app, second)).toBe(false);
  });

  it('AUTH-05 a wrong code while turning it on ends no session', async () => {
    const app = await authServer(open, { totp: true });
    const { first, second } = await twoSessions(app, 'an@example.vn');
    await app.api('POST', '/two-factor/enable', { cookie: first, payload: { password: PASSWORD } });
    const wrong = await app.api('POST', '/two-factor/verify-totp', { cookie: first, payload: { code: '000000' } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(await signedIn(app, first)).toBe(true);
    expect(await signedIn(app, second)).toBe(true);
  });

  it('AUTH-05 a sign in with a code later ends no session', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const enabled = await app.enableTotp(cookie);
    const one = await app.signInTotp('an@example.vn', enabled.secret, { ip: '203.0.113.7' });
    const two = await app.signInTotp('an@example.vn', enabled.secret, { ip: '203.0.113.8' });
    expect(await signedIn(app, enabled.cookie)).toBe(true);
    expect(await signedIn(app, one.cookie)).toBe(true);
    expect(await signedIn(app, two.cookie)).toBe(true);
  });

  it('AUTH-03 enabling again before the code replaces the secret, and the new one confirms, as after a reload of the page', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const ask = () => app.api('POST', '/two-factor/enable', { cookie, payload: { password: PASSWORD } });
    const before = secretOf(String((await ask()).body['totpURI']));
    const after = secretOf(String((await ask()).body['totpURI']));
    expect(after).not.toBe(before);
    const done = await app.api('POST', '/two-factor/verify-totp', { cookie, payload: { code: totpCode(after) } });
    expect(done.status).toBe(200);
    expect(await app.count('bk_auth_two_factors')).toBe(1);
    const first = await app.signIn('an@example.vn', { ip: '203.0.113.7' });
    const second = await app.api('POST', '/two-factor/verify-totp', {
      cookie: cookieNamed(first, '__Host-bk_two_factor') ?? '',
      ip: '203.0.113.7',
      payload: { code: totpCode(after) },
    });
    expect(second.status).toBe(200);
  });
});

describeDialects('POL-02 the principal and the rule for everyone', ({ open }) => {
  const forAll: PolicyReader = {
    read: async () => ({ ...DEFAULT_POLICY, mfa: { requiredForAll: true, graceDays: 7, since: null } }),
  };

  it('POL-02 the principal says that the rule for everyone is on, also after the person has a factor', async () => {
    const app = await authServer(open, { totp: true, policy: forAll });
    const { cookie } = await app.login('an@example.vn');
    const before = await principalOfSession(app.auth, cookie, undefined, { policy: forAll });
    expect(before?.mfaForAll).toBe(true);
    const enabled = await app.enableTotp(cookie);
    const after = await principalOfSession(app.auth, enabled.cookie, undefined, { policy: forAll });
    expect(after).toMatchObject({ mfa: true, mfaForAll: true });
    expect(after).not.toHaveProperty('mfaEnrolBy');
  });

  it('POL-02 without the rule the principal says nothing about it', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    expect(await principalOfSession(app.auth, cookie)).not.toHaveProperty('mfaForAll');
  });
});
