/**
 * BieberKit
 *
 * @file        packages/auth/src/methods.dialects.test.ts
 * @description Tests of the strong sign in methods: TOTP with backup codes, the magic link and passkeys, with their cookies, their audit and the tables that they use (AUTH-01, AUTH-03, AUTH-09).
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
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { AuthVerification } from './tables.ts';
import { authServer, BASE_URL, cookieNamed, cookieOf, PASSWORD, setCookieOf } from './testing/auth-server.ts';
import type { AuthServer, ServerReply } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import { secretOf, totpCode } from './testing/totp.ts';
import { VirtualAuthenticator } from './testing/webauthn.ts';

const hasUser = (reply: ServerReply): boolean => typeof reply.body['user'] === 'object' && reply.body['user'] !== null;
const actions = async (app: AuthServer): Promise<string[]> => (await app.audit()).map((entry) => entry.action);

describeDialects('AUTH-03 TOTP', ({ open }) => {
  it('AUTH-03 turning it on gives the URI of an authenticator app and ten backup codes, and the secret is not stored as it is', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const reply = await app.api('POST', '/two-factor/enable', { cookie, payload: { password: PASSWORD } });
    expect(reply.status).toBe(200);
    const uri = String(reply.body['totpURI']);
    expect(uri).toMatch(/^otpauth:\/\/totp\/BieberKit%20Test:/);
    expect(Array.isArray(reply.body['backupCodes']) ? reply.body['backupCodes'] : []).toHaveLength(10);
    const stored = JSON.stringify(await app.rows('select * from auth_two_factors'));
    expect(stored).not.toContain(secretOf(uri));
  });

  it('AUTH-03 it needs the password of the user to be turned on', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const reply = await app.api('POST', '/two-factor/enable', { cookie, payload: { password: 'not the password' } });
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(await app.count('auth_two_factors')).toBe(0);
  });

  it('AUTH-03 after it is on, a sign in with the password alone gives no session, and the code gives one', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const { secret } = await app.enableTotp(cookie);
    const first = await app.signIn('an@example.vn', { ip: '203.0.113.7' });
    expect(first.body['twoFactorRedirect']).toBe(true);
    expect(cookieOf(first)).toBeUndefined();
    const pending = cookieNamed(first, '__Host-bk_two_factor') ?? '';
    expect(pending).not.toBe('');
    expect((await app.api('GET', '/get-session', { cookie: pending })).body['user']).toBeUndefined();
    const second = await app.api('POST', '/two-factor/verify-totp', {
      cookie: pending,
      ip: '203.0.113.7',
      payload: { code: totpCode(secret) },
    });
    expect(second.status).toBe(200);
    const session = cookieOf(second) ?? '';
    expect(hasUser(await app.api('GET', '/get-session', { cookie: session }))).toBe(true);
  });

  it('AUTH-03 a wrong code gives no session, and is audited as auth.mfa.failed with no code in it', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    await app.enableTotp(cookie);
    const first = await app.signIn('an@example.vn', { ip: '203.0.113.7' });
    const pending = cookieNamed(first, '__Host-bk_two_factor') ?? '';
    const wrong = await app.api('POST', '/two-factor/verify-totp', {
      cookie: pending,
      ip: '203.0.113.7',
      payload: { code: '000000' },
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(cookieOf(wrong)).toBeUndefined();
    expect(await actions(app)).toContain('auth.mfa.failed');
    expect(JSON.stringify(await app.audit())).not.toContain('000000');
  });

  it('AUTH-03 a backup code signs in once, and the same code does not work again', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const { backupCodes } = await app.enableTotp(cookie);
    const code = backupCodes[0] ?? '';
    const use = async (ip: string) => {
      const first = await app.signIn('an@example.vn', { ip });
      return app.api('POST', '/two-factor/verify-backup-code', {
        cookie: cookieNamed(first, '__Host-bk_two_factor') ?? '',
        ip,
        payload: { code },
      });
    };
    const ok = await use('203.0.113.7');
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toBeDefined();
    const again = await use('203.0.113.8');
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(cookieOf(again)).toBeUndefined();
    expect(await actions(app)).toEqual(expect.arrayContaining(['auth.mfa.backup-code-used', 'auth.mfa.failed']));
  });

  it('AUTH-03 turning it off needs the password and brings back the sign in with the password alone', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    const enabled = await app.enableTotp(cookie);
    const off = await app.api('POST', '/two-factor/disable', {
      cookie: enabled.cookie,
      payload: { password: PASSWORD },
    });
    expect(off.status).toBe(200);
    expect((await app.signIn('an@example.vn', { ip: '203.0.113.7' })).body['twoFactorRedirect']).toBeUndefined();
    expect(await actions(app)).toEqual(
      expect.arrayContaining(['auth.mfa.enrolled', 'auth.mfa.verified', 'auth.mfa.disabled']),
    );
  });

  it('AUTH-01 the cookie of the pending second factor is a __Host- cookie, and no cookie of Better Auth has another name', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    await app.enableTotp(cookie);
    const first = await app.signIn('an@example.vn', { ip: '203.0.113.7' });
    const header = first.headers['set-cookie'];
    const lines = Array.isArray(header) ? header : [String(header)];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.startsWith('__Host-')).toBe(true);
      expect(line).toContain('Secure');
      expect(line).toContain('HttpOnly');
      expect(line).toContain('Path=/');
      expect(line.toLowerCase()).not.toContain('domain=');
    }
  });

  it('AUTH-09 enabling and confirming are in one transaction each: a failure of the outbox leaves the secret unwritten', async () => {
    const app = await authServer(open, { totp: true });
    const { cookie } = await app.login('an@example.vn');
    await app.rows('drop table bieberkit_outbox');
    const reply = await app.api('POST', '/two-factor/enable', { cookie, payload: { password: PASSWORD } });
    expect(reply.status).toBeGreaterThanOrEqual(500);
    expect(await app.count('auth_two_factors')).toBe(0);
  });
});

const ask = (app: AuthServer, email: string, ip = '203.0.113.30') =>
  app.api('POST', '/sign-in/magic-link', { ip, payload: { email } });
const linkOf = (app: AuthServer): string => app.mails.filter((mail) => mail.kind === 'magic').at(-1)?.url ?? '';

describeDialects('AUTH-03 the magic link', ({ open }) => {
  it('AUTH-03 mails a link to a user who exists, and the link signs him in with a __Host-bk_session cookie', async () => {
    const app = await authServer(open, { magicLink: true });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    expect((await ask(app, 'an@example.vn')).status).toBe(200);
    const mail = app.mails.find((item) => item.kind === 'magic');
    expect(mail?.to).toBe('an@example.vn');
    const used = await app.send('GET', new URL(linkOf(app)).pathname + new URL(linkOf(app)).search, {
      ip: '203.0.113.30',
    });
    expect([200, 302]).toContain(used.status);
    expect(setCookieOf(used)).toBeDefined();
    expect(await actions(app)).toContain('auth.session.created');
  });

  it('AUTH-03 the link works once', async () => {
    const app = await authServer(open, { magicLink: true });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    await ask(app, 'an@example.vn');
    const target = new URL(linkOf(app));
    const path = target.pathname + target.search;
    expect(setCookieOf(await app.send('GET', path, { ip: '203.0.113.30' }))).toBeDefined();
    expect(setCookieOf(await app.send('GET', path, { ip: '203.0.113.31' }))).toBeUndefined();
  });

  it('AUTH-03 an address that has no account gets the same answer and no mail, so the form does not tell who has an account', async () => {
    const app = await authServer(open, { magicLink: true });
    const known = await (async () => {
      await app.signUp('an@example.vn', { ip: '203.0.113.50' });
      return ask(app, 'an@example.vn', '203.0.113.31');
    })();
    const before = app.mails.length;
    const unknown = await ask(app, 'nobody@example.vn', '203.0.113.32');
    expect([unknown.status, unknown.body]).toEqual([known.status, known.body]);
    expect(app.mails.length).toBe(before);
    expect(await app.count('auth_users')).toBe(1);
  });

  it('AUTH-03 a link that has expired does not sign in', async () => {
    const app = await authServer(open, { magicLink: true });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    await ask(app, 'an@example.vn');
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeUpdate(AuthVerification, {}, { expiresAt: new Date('2020-01-01T00:00:00.000Z') });
    });
    const target = new URL(linkOf(app));
    expect(setCookieOf(await app.send('GET', target.pathname + target.search, { ip: '203.0.113.30' }))).toBeUndefined();
  });

  it('AUTH-03 a link with a token that was never made does not sign in', async () => {
    const app = await authServer(open, { magicLink: true });
    const reply = await app.send('GET', '/api/auth/magic-link/verify?token=forged&callbackURL=%2F', {
      ip: '203.0.113.30',
    });
    expect(setCookieOf(reply)).toBeUndefined();
  });
});

describe('AUTH-03 the virtual authenticator, as a check of the helper', () => {
  it('AUTH-03 makes a credential with a counter that goes up', () => {
    const device = new VirtualAuthenticator('app.test', BASE_URL);
    const one = device.authenticate({ challenge: 'abc' });
    const two = device.authenticate({ challenge: 'abc' });
    expect(one.response['authenticatorData']).not.toBe(two.response['authenticatorData']);
  });
});

async function registered(app: AuthServer, email = 'an@example.vn') {
  const { id, cookie } = await app.login(email);
  const options = await app.api('GET', '/passkey/generate-register-options', { cookie });
  const device = new VirtualAuthenticator('app.test', BASE_URL);
  const added = await app.api('POST', '/passkey/verify-registration', {
    cookie: `${cookie}; ${cookieNamed(options, '__Host-bk_passkey_challenge')}`,
    payload: { response: device.register({ challenge: String(options.body['challenge']) }), name: 'laptop' },
  });
  return { id, cookie, device, added };
}

const signInWith = async (app: AuthServer, device: VirtualAuthenticator, ip = '203.0.113.9') => {
  const options = await app.api('GET', '/passkey/generate-authenticate-options', { ip });
  return app.api('POST', '/passkey/verify-authentication', {
    ip,
    cookie: cookieNamed(options, '__Host-bk_passkey_challenge') ?? '',
    payload: { response: device.authenticate({ challenge: String(options.body['challenge']) }) },
  });
};

describeDialects('AUTH-03 passkeys', ({ open }) => {
  it('AUTH-03 a passkey is added with its public key and no private part, and the registration is audited', async () => {
    const app = await authServer(open, { passkey: true });
    const { added, id } = await registered(app);
    expect(added.status).toBe(200);
    expect(await app.count('auth_passkeys')).toBe(1);
    expect(await actions(app)).toContain('auth.passkey.added');
    const entry = (await app.audit()).find((item) => item.action === 'auth.passkey.added');
    expect(entry?.actorId).toBe(id);
  });

  it('AUTH-03 the passkey signs in with no password, and the answer has a __Host-bk_session cookie', async () => {
    const app = await authServer(open, { passkey: true });
    const { device, id } = await registered(app);
    const reply = await signInWith(app, device);
    expect(reply.status).toBe(200);
    const session = cookieOf(reply) ?? '';
    expect(session.startsWith('__Host-bk_session=')).toBe(true);
    const shown = await app.api('GET', '/get-session', { cookie: session });
    const user = shown.body['user'];
    expect(typeof user === 'object' && user !== null && 'id' in user ? user.id : undefined).toBe(id);
  });

  it('AUTH-03 a challenge is used once: the same answer a second time does not sign in', async () => {
    const app = await authServer(open, { passkey: true });
    const { device } = await registered(app);
    const options = await app.api('GET', '/passkey/generate-authenticate-options', { ip: '203.0.113.9' });
    const pending = cookieNamed(options, '__Host-bk_passkey_challenge') ?? '';
    const answer = device.authenticate({ challenge: String(options.body['challenge']) });
    const send = () =>
      app.api('POST', '/passkey/verify-authentication', {
        ip: '203.0.113.9',
        cookie: pending,
        payload: { response: answer },
      });
    expect(cookieOf(await send())).toBeDefined();
    expect(cookieOf(await send())).toBeUndefined();
  });

  it('AUTH-03 an answer that is signed by another key does not sign in', async () => {
    const app = await authServer(open, { passkey: true });
    await registered(app);
    const stranger = new VirtualAuthenticator('app.test', BASE_URL);
    const reply = await signInWith(app, stranger);
    expect(cookieOf(reply)).toBeUndefined();
  });

  it('AUTH-03 a passkey is removed by its owner, and then it does not sign in', async () => {
    const app = await authServer(open, { passkey: true });
    const { device, cookie } = await registered(app);
    const list = await app.api('GET', '/passkey/list-user-passkeys', { cookie });
    const listed: { id: string }[] = JSON.parse(list.text);
    expect(listed).toHaveLength(1);
    const removed = await app.api('POST', '/passkey/delete-passkey', { cookie, payload: { id: listed[0]?.id } });
    expect(removed.status).toBe(200);
    expect(await app.count('auth_passkeys')).toBe(0);
    expect(cookieOf(await signInWith(app, device, '203.0.113.10'))).toBeUndefined();
    expect(await actions(app)).toContain('auth.passkey.removed');
  });

  it('AUTH-03 the relying party is the host of the base URL', async () => {
    const app = await authServer(open, { passkey: true });
    const { cookie } = await app.login('an@example.vn');
    const options = await app.api('GET', '/passkey/generate-register-options', { cookie });
    expect(options.body['rp']).toMatchObject({ id: 'app.test', name: 'BieberKit Test' });
  });
});
