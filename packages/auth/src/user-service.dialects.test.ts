/**
 * BieberKit
 *
 * @file        packages/auth/src/user-service.dialects.test.ts
 * @description Tests of disabled-user transactions and refusals across password, magic link, passkey, TOTP, cookies, cached sessions and API keys (BPL-01).
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
import { uuid7 } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { disableUser, enableUser } from './index.ts';
import type { AuthSecondaryStorage } from './better-auth.ts';
import { AuthUser } from './tables.ts';
import { authServer, BASE_URL, cookieNamed, cookieOf, TENANT_A } from './testing/auth-server.ts';
import type { AuthServer, ServerReply } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import { totpCode } from './testing/totp.ts';
import { VirtualAuthenticator } from './testing/webauthn.ts';

async function status(app: AuthServer, userId: string) {
  return runInUnitOfWork(app.db, async (em) => {
    const user = await em.findOneOrFail(AuthUser, { id: userId });
    return {
      disabledAt: user.disabledAt ?? null,
      disabledReason: user.disabledReason ?? null,
      disabledBy: user.disabledBy ?? null,
    };
  });
}

// Seed disabled status directly so rejection tests reach the authentication path even in RED.
async function disabledFixture(app: AuthServer, userId: string): Promise<void> {
  await runInUnitOfWork(app.db, async (em) => {
    await em.nativeUpdate(
      AuthUser,
      { id: userId },
      {
        disabledAt: new Date(),
        disabledReason: 'Account review',
        disabledBy: null,
      },
    );
  });
}

function refused(reply: ServerReply): void {
  expect([reply.status, reply.body['code']]).toEqual([403, 'AUTH_USER_DISABLED']);
  expect(cookieOf(reply)).toBeUndefined();
}

async function userAudits(app: AuthServer) {
  return (await app.audit()).filter((entry) => entry.action.startsWith('users.user.'));
}

/** A persistent secondary-store snapshot: disabling must not need to clear it. */
function secondaryStore(): { storage: AuthSecondaryStorage; values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
      },
      delete: async (key) => {
        values.delete(key);
      },
      getAndDelete: async (key) => {
        const value = values.get(key) ?? null;
        values.delete(key);
        return value;
      },
      increment: async (key) => {
        const value = Number(values.get(key) ?? 0) + 1;
        values.set(key, String(value));
        return value;
      },
    },
  };
}

describeDialects('BPL-01 disabled users', ({ open }) => {
  it('BPL-01 disabling revokes every session in the same transaction', async () => {
    const app = await authServer(open);
    const { id } = await app.login('disabled@example.test');
    const actor = await app.login('admin@example.test');
    expect(await app.count('bk_auth_sessions')).toBe(4);
    const before = new Date();
    expect(await disableUser(app.db, { userId: id, reason: 'Account review', actorId: actor.id })).toBe(true);
    const disabled = await status(app, id);
    expect(disabled).toEqual({
      disabledAt: expect.any(Date),
      disabledReason: 'Account review',
      disabledBy: actor.id,
    });
    expect(disabled.disabledAt?.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    // Only the disabled user's two sessions are revoked; the administrator stays signed in.
    expect(await app.count('bk_auth_sessions')).toBe(2);
    const remaining = await app.auth.api.getSession({ headers: new Headers({ cookie: actor.cookie }) });
    expect(remaining?.user.id).toBe(actor.id);
    expect(await userAudits(app)).toEqual([
      {
        action: 'users.user.disabled',
        actorId: actor.id,
        data: { reason: 'Account review' },
      },
    ]);
  });

  it('BPL-01 a failed audit rolls back disabled status and session revocation', async () => {
    const app = await authServer(open);
    const { id, cookie } = await app.login('rollback@example.test');
    const sessions = await app.count('bk_auth_sessions');
    await app.db.orm.em.getConnection().execute('drop table bk_audit_log');
    await expect(disableUser(app.db, { userId: id, reason: 'Account review', actorId: null })).rejects.toThrow(
      /bk_audit_log/i,
    );
    expect(await status(app, id)).toEqual({ disabledAt: null, disabledReason: null, disabledBy: null });
    expect(await app.count('bk_auth_sessions')).toBe(sessions);
    expect((await app.auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id).toBe(id);
  });

  it('BPL-01 a disabled user cannot sign in with email and password', async () => {
    const app = await authServer(open);
    const { id } = await app.login('password@example.test');
    await disabledFixture(app, id);
    const sessions = await app.count('bk_auth_sessions');
    refused(await app.signIn('password@example.test'));
    expect(await app.count('bk_auth_sessions')).toBe(sessions);
  });

  it('BPL-01 a disabled user cannot sign in with a magic link', async () => {
    const app = await authServer(open, { magicLink: true });
    const { id } = await app.login('magic@example.test');
    expect((await app.api('POST', '/sign-in/magic-link', { payload: { email: 'magic@example.test' } })).status).toBe(
      200,
    );
    const link = app.mails.find((mail) => mail.kind === 'magic')?.url;
    expect(link).toBeDefined();
    if (link === undefined) throw new Error('Expected a magic link for the enabled user');
    // The link was issued before disable; checking only the link request cannot satisfy this.
    await disabledFixture(app, id);
    const sessions = await app.count('bk_auth_sessions');
    const target = new URL(link);
    refused(await app.send('GET', target.pathname + target.search, { ip: '203.0.113.30' }));
    expect(await app.count('bk_auth_sessions')).toBe(sessions);
  });

  it('BPL-01 a disabled user cannot sign in with a registered passkey', async () => {
    const app = await authServer(open, { passkey: true });
    const { id, cookie } = await app.login('passkey@example.test');
    const device = new VirtualAuthenticator('app.test', BASE_URL);
    const registration = await app.api('GET', '/passkey/generate-register-options', { cookie });
    const added = await app.api('POST', '/passkey/verify-registration', {
      cookie: cookie + '; ' + cookieNamed(registration, '__Host-bk_passkey_challenge'),
      payload: { response: device.register({ challenge: String(registration.body['challenge']) }), name: 'laptop' },
    });
    expect(added.status).toBe(200);
    const challenge = await app.api('GET', '/passkey/generate-authenticate-options', { ip: '203.0.113.9' });
    await disabledFixture(app, id);
    const sessions = await app.count('bk_auth_sessions');
    refused(
      await app.api('POST', '/passkey/verify-authentication', {
        ip: '203.0.113.9',
        cookie: cookieNamed(challenge, '__Host-bk_passkey_challenge') ?? '',
        payload: { response: device.authenticate({ challenge: String(challenge.body['challenge']) }) },
      }),
    );
    expect(await app.count('bk_auth_sessions')).toBe(sessions);
  });

  it('BPL-01 a user disabled between the password and the TOTP code gets no session', async () => {
    const app = await authServer(open, { totp: true });
    const { id, cookie } = await app.login('totp@example.test');
    const { secret } = await app.enableTotp(cookie);
    const first = await app.signIn('totp@example.test', { ip: '203.0.113.7' });
    expect(first.body['twoFactorRedirect']).toBe(true);
    expect(cookieOf(first)).toBeUndefined();
    const pending = cookieNamed(first, '__Host-bk_two_factor');
    expect(pending).toBeDefined();
    await disabledFixture(app, id);
    const sessions = await app.count('bk_auth_sessions');
    refused(
      await app.api('POST', '/two-factor/verify-totp', {
        cookie: pending ?? '',
        ip: '203.0.113.7',
        payload: { code: totpCode(secret) },
      }),
    );
    expect(await app.count('bk_auth_sessions')).toBe(sessions);
  });

  it('BPL-01 a session that the secondary storage still holds is refused after disable', async () => {
    const store = secondaryStore();
    const app = await authServer(open, { secondaryStorage: store.storage });
    const { id, cookie } = await app.login('cached@example.test');
    await app.grant(id, ['crm.deal.read']);
    expect((await app.send('GET', '/api/v1/crm/deals', { cookie, tenant: TENANT_A })).status).toBe(200);
    const session = await app.auth.api.getSession({ headers: new Headers({ cookie }) });
    const token = session?.session.token;
    expect(token).toBeDefined();
    if (token === undefined) throw new Error('Expected a cached session token');
    const snapshot = store.values.get(token);
    expect(snapshot).toBeDefined();
    expect(snapshot).toContain(id);
    await disableUser(app.db, { userId: id, reason: 'Account review', actorId: null });
    expect(await app.count('bk_auth_sessions')).toBe(0);
    // The snapshot still says enabled. Rejection requires a fresh user-status read.
    expect(store.values.get(token)).toBe(snapshot);
    refused(await app.send('GET', '/api/v1/crm/deals', { cookie, tenant: TENANT_A }));
  });

  it('BPL-01 an API key of a disabled user is refused', async () => {
    const app = await authServer(open, { apiKeys: true });
    const { id } = await app.login('key@example.test');
    const key = await app.createKey({ userId: id, tenantId: TENANT_A, name: 'ci', permissions: ['crm.deal.read'] });
    const options = { headers: { 'x-api-key': key.key }, tenant: TENANT_A };
    expect((await app.send('GET', '/api/v1/crm/deals', options)).status).toBe(200);
    await disabledFixture(app, id);
    refused(await app.send('GET', '/api/v1/crm/deals', options));
  });

  it('BPL-01 a request with the cookie of a disabled user answers 403 AUTH_USER_DISABLED', async () => {
    const app = await authServer(open);
    const { id, cookie } = await app.login('cookie@example.test');
    await app.grant(id, ['crm.deal.read']);
    expect((await app.send('GET', '/api/v1/crm/deals', { cookie, tenant: TENANT_A })).status).toBe(200);
    // Keep the session to exercise the authenticator's status check independently of revocation.
    await disabledFixture(app, id);
    refused(await app.send('GET', '/api/v1/crm/deals', { cookie, tenant: TENANT_A }));
  });

  it('BPL-01 enableUser lets the user sign in again and audits it', async () => {
    const app = await authServer(open);
    const { id } = await app.login('enabled@example.test');
    await disableUser(app.db, { userId: id, reason: 'Account review', actorId: null });
    refused(await app.signIn('enabled@example.test'));
    expect(await enableUser(app.db, { userId: id, actorId: null })).toBe(true);
    expect(await status(app, id)).toEqual({ disabledAt: null, disabledReason: null, disabledBy: null });
    const signedIn = await app.signIn('enabled@example.test');
    expect(signedIn.status).toBe(200);
    expect(cookieOf(signedIn)).toBeDefined();
    expect(await userAudits(app)).toEqual([
      { action: 'users.user.disabled', actorId: null, data: { reason: 'Account review' } },
      expect.objectContaining({ action: 'users.user.enabled', actorId: null }),
    ]);
  });

  it('BPL-01 disabling twice changes nothing and audits once', async () => {
    const app = await authServer(open);
    const { id } = await app.login('idempotent@example.test');
    expect(await disableUser(app.db, { userId: id, reason: 'First reason', actorId: null })).toBe(true);
    const original = await status(app, id);
    expect(await disableUser(app.db, { userId: id, reason: 'Second reason', actorId: uuid7() })).toBe(false);
    expect(await status(app, id)).toEqual(original);
    expect(await userAudits(app)).toHaveLength(1);
  });

  it('BPL-01 enabling an active user changes nothing and audits nothing', async () => {
    const app = await authServer(open);
    const { id } = await app.login('active@example.test');
    const sessions = await app.count('bk_auth_sessions');
    expect(await enableUser(app.db, { userId: id, actorId: null })).toBe(false);
    expect(await app.count('bk_auth_sessions')).toBe(sessions);
    expect(await userAudits(app)).toEqual([]);
  });

  it('BPL-01 an unknown user is USERS_NOT_FOUND', async () => {
    const app = await authServer(open);
    const userId = uuid7();
    await expect(disableUser(app.db, { userId, reason: 'Account review', actorId: null })).rejects.toMatchObject({
      code: 'USERS_NOT_FOUND',
      status: 404,
    });
    await expect(enableUser(app.db, { userId, actorId: null })).rejects.toMatchObject({
      code: 'USERS_NOT_FOUND',
      status: 404,
    });
    expect(await userAudits(app)).toEqual([]);
  });
});
