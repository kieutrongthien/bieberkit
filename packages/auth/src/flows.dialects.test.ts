/**
 * BieberKit
 *
 * @file        packages/auth/src/flows.dialects.test.ts
 * @description Tests of the flows of Better Auth through the HTTP server: sign up, sign in, cookie, verification, reset, sign out, and one transaction for each request (AUTH-01, AUTH-04, AUTH-09, ADR 0012).
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
import { authServer, cookieOf, PASSWORD, setCookieOf } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const idOf = (body: Readonly<Record<string, unknown>>): string => {
  const user = body['user'];
  return typeof user === 'object' && user !== null && 'id' in user ? String(user.id) : '';
};

describeDialects('AUTH-09 the flows of ADR 0012', ({ open }) => {
  it('AUTH-09 sign up writes a user, an account with a hashed password and a session', async () => {
    const app = await authServer(open);
    const reply = await app.signUp('an@example.vn');
    expect(reply.status).toBe(200);
    expect(idOf(reply.body)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect([
      await app.count('bk_auth_users'),
      await app.count('bk_auth_accounts'),
      await app.count('bk_auth_sessions'),
    ]).toEqual([1, 1, 1]);
    const [account] = await app.rows('select password from bk_auth_accounts');
    expect(String(account?.['password'])).not.toContain(PASSWORD);
    expect(String(account?.['password'])).toContain(':');
  });

  it('AUTH-01 sign in sets the cookie __Host-bk_session with HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain', async () => {
    const app = await authServer(open);
    await app.signUp('an@example.vn');
    const reply = await app.signIn('an@example.vn');
    expect(reply.status).toBe(200);
    const line = setCookieOf(reply) ?? '';
    expect(line.startsWith('__Host-bk_session=')).toBe(true);
    for (const attribute of ['httponly', 'secure', 'samesite=lax', 'path=/'])
      expect(line.toLowerCase()).toContain(attribute);
    expect(line.toLowerCase()).not.toContain('domain=');
    expect(line).not.toContain('__Secure-');
  });

  it('AUTH-01 get-session answers with the user of the cookie, and with nothing for no cookie', async () => {
    const app = await authServer(open);
    const { id, cookie } = await app.login('an@example.vn');
    const known = await app.api('GET', '/get-session', { cookie });
    expect(known.status).toBe(200);
    expect(idOf(known.body)).toBe(id);
    const unknown = await app.api('GET', '/get-session');
    expect(unknown.status).toBe(200);
    expect(unknown.body['user']).toBeUndefined();
  });

  it('AUTH-09 a sign up writes its audit entry and its outbox event with the user, in one transaction', async () => {
    const app = await authServer(open);
    const reply = await app.signUp('an@example.vn');
    const id = idOf(reply.body);
    const entries = (await app.audit()).filter((entry) => entry.action === 'auth.user.signed-up');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe(id);
    expect(await app.outbox()).toContain('auth.user.signed-up');
    expect(JSON.stringify(entries[0])).not.toContain(PASSWORD);
  });

  it('AUTH-09 a failure after the sign up takes back the user, the account, the session, the audit and the outbox', async () => {
    const app = await authServer(open);
    await app.rows('drop table bk_outbox');
    const reply = await app.signUp('an@example.vn');
    expect(reply.status).toBeGreaterThanOrEqual(500);
    expect([
      await app.count('bk_auth_users'),
      await app.count('bk_auth_accounts'),
      await app.count('bk_auth_sessions'),
    ]).toEqual([0, 0, 0]);
    expect((await app.audit()).filter((entry) => entry.action.startsWith('auth.'))).toEqual([]);
  });

  it('AUTH-09 a request that Better Auth refuses changes nothing: a second sign up with the same email', async () => {
    const app = await authServer(open);
    await app.signUp('an@example.vn');
    const again = await app.signUp('an@example.vn', { ip: '203.0.113.2' });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(await app.count('bk_auth_users')).toBe(1);
    expect((await app.audit()).filter((entry) => entry.action === 'auth.user.signed-up')).toHaveLength(1);
  });

  it('AUTH-04 refuses a password of fewer than 8 characters, and accepts one of 8 with no composition rule', async () => {
    const app = await authServer(open);
    expect((await app.signUp('short@example.vn', { password: 'abc1234' })).status).toBeGreaterThanOrEqual(400);
    expect((await app.signUp('plain@example.vn', { password: 'aaaaaaaa' })).status).toBe(200);
  });

  it('AUTH-04 a wrong password and an unknown email are the same 401', async () => {
    const app = await authServer(open);
    await app.signUp('an@example.vn');
    const wrong = await app.signIn('an@example.vn', { password: 'not the password', ip: '203.0.113.5' });
    const unknown = await app.signIn('nobody@example.vn', { ip: '203.0.113.6' });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body['message']).toBe(unknown.body['message']);
  });

  it('AUTH-09 sign in writes a session entry, and a failed one writes auth.signin.failed in an entry of its own', async () => {
    const app = await authServer(open);
    await app.signUp('an@example.vn');
    await app.signIn('an@example.vn');
    await app.signIn('an@example.vn', { password: 'not the password', ip: '203.0.113.7' });
    const actions = (await app.audit()).map((entry) => entry.action);
    expect(actions).toContain('auth.session.created');
    expect(actions).toContain('auth.signin.failed');
    expect(JSON.stringify(await app.audit())).not.toContain('not the password');
  });

  it('AUTH-09 email verification consumes its token and marks the user', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    await app.api('POST', '/send-verification-email', { cookie, payload: { email: 'an@example.vn' } });
    const mail = app.mails.find((item) => item.kind === 'verify');
    expect(mail?.token).toBeTruthy();
    const verified = await app.api('GET', `/verify-email?token=${encodeURIComponent(mail?.token ?? '')}`);
    expect([200, 302]).toContain(verified.status);
    expect(
      (await app.rows(`select email_verified from bk_auth_users where email = 'an@example.vn'`))[0]?.['email_verified'],
    ).toSatisfy((value: unknown) => value === true || value === 1);
    expect((await app.audit()).map((entry) => entry.action)).toContain('auth.email.verified');
  });

  it('AUTH-09 a password reset consumes its token, and the new password signs in and the old one does not', async () => {
    const app = await authServer(open);
    await app.signUp('an@example.vn');
    await app.api('POST', '/request-password-reset', {
      payload: { email: 'an@example.vn', redirectTo: 'https://app.test/reset' },
    });
    const mail = app.mails.find((item) => item.kind === 'reset');
    expect(mail?.token).toBeTruthy();
    const reset = await app.api('POST', '/reset-password', {
      payload: { newPassword: 'a brand new password', token: mail?.token },
    });
    expect(reset.status).toBe(200);
    expect((await app.signIn('an@example.vn', { password: 'a brand new password', ip: '203.0.113.8' })).status).toBe(
      200,
    );
    expect((await app.signIn('an@example.vn', { ip: '203.0.113.9' })).status).toBe(401);
    expect((await app.audit()).map((entry) => entry.action)).toContain('auth.password.reset');
  });

  it('AUTH-01 sign out removes the session, and the cookie then names nobody', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const before = await app.count('bk_auth_sessions');
    const reply = await app.api('POST', '/sign-out', { cookie, payload: {} });
    expect(reply.status).toBe(200);
    expect(await app.count('bk_auth_sessions')).toBe(before - 1);
    expect((await app.api('GET', '/get-session', { cookie })).body['user']).toBeUndefined();
    expect((await app.audit()).map((entry) => entry.action)).toContain('auth.session.revoked');
  });

  it('SEC-03 a sign out from another site with a cookie is refused by the check of the origin', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const before = await app.count('bk_auth_sessions');
    const reply = await app.api('POST', '/sign-out', {
      cookie,
      payload: {},
      crossSite: true,
      headers: { origin: 'https://evil.test' },
    });
    expect(reply.status).toBe(403);
    expect(await app.count('bk_auth_sessions')).toBe(before);
  });

  it('AUTH-10 a cookie value that Better Auth did not sign is no session', async () => {
    const app = await authServer(open);
    await app.login('an@example.vn');
    const reply = await app.api('GET', '/get-session', { cookie: '__Host-bk_session=forged.value' });
    expect(reply.body['user']).toBeUndefined();
    expect(cookieOf(reply)).toBeUndefined();
  });
});
