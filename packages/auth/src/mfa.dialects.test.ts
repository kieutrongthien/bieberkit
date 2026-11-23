/**
 * BieberKit
 *
 * @file        packages/auth/src/mfa.dialects.test.ts
 * @description Tests of MFA for the roles flagged requireMfa: a session without a second factor is refused with AUTH_MFA_REQUIRED, and a session with one is not (AUTH-05, AUTHZ-05).
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
import { createAuthenticator } from './authenticator.ts';
import { authServer, cookieOf, PASSWORD, TENANT_A } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import type { AuthDialectContext } from './testing/dialects.ts';

const DEALS = '/api/v1/crm/deals';
const info = (value: string) => ({ method: 'GET', path: DEALS, headers: { cookie: value }, ip: '127.0.0.1' });

async function world(opener: AuthDialectContext['open']) {
  const app = await authServer(opener, { totp: true });
  const { id, cookie } = await app.login('an@example.vn');
  await app.seed(TENANT_A, [{ code: 'D1', amount: 100 }]);
  return { app, id, cookie };
}

describeDialects('AUTH-05 MFA for a role', ({ open }) => {
  it('AUTH-05 a role without the flag needs no second factor', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    expect((await app.send('GET', DEALS, { cookie, tenant: TENANT_A })).status).toBe(200);
  });

  it('AUTH-05 a role with the flag refuses a user who has no second factor, with AUTH_MFA_REQUIRED and the way to fix it', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    const reply = await app.send('GET', DEALS, { cookie, tenant: TENANT_A });
    expect([reply.status, reply.body['code']]).toEqual([403, 'AUTH_MFA_REQUIRED']);
    expect(String(reply.body['fix'])).toMatch(/two-factor|second factor/i);
  });

  it('AUTH-05 it refuses a write and an aggregate as well, and nothing is changed', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read', 'crm.deal.create'], TENANT_A, { requireMfa: true });
    const created = await app.send('POST', DEALS, { cookie, tenant: TENANT_A, payload: { code: 'N1', title: 'x' } });
    expect([created.status, created.body['code']]).toEqual([403, 'AUTH_MFA_REQUIRED']);
    expect((await app.send('GET', `${DEALS}/aggregate`, { cookie, tenant: TENANT_A })).status).toBe(403);
    expect(await app.count('crm_deals')).toBe(1);
  });

  it('AUTH-05 the refusal is audited as authz.mfa-required with the id of the user', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    await app.send('GET', DEALS, { cookie, tenant: TENANT_A });
    const entries = (await app.audit()).filter((entry) => entry.action === 'authz.mfa-required');
    expect(entries.map((entry) => entry.actorId)).toEqual([id]);
  });

  it('AUTH-05 the routes of authentication stay open, so the user can turn the second factor on', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    const enabled = await app.enableTotp(cookie);
    expect(enabled.cookie).not.toBe('');
  });

  it('AUTH-05 after the second factor is on, the same user passes, with the session that the confirmation gave', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    const enabled = await app.enableTotp(cookie);
    expect((await app.send('GET', DEALS, { cookie: enabled.cookie, tenant: TENANT_A })).status).toBe(200);
  });

  it('AUTH-05 a sign in after that passes only when the code was given, because a session is made only then', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    const { secret } = await app.enableTotp(cookie);
    const { cookie: session } = await app.signInTotp('an@example.vn', secret, { ip: '203.0.113.7' });
    expect((await app.send('GET', DEALS, { cookie: session, tenant: TENANT_A })).status).toBe(200);
    const first = await app.signIn('an@example.vn', { ip: '203.0.113.8' });
    expect(cookieOf(first)).toBeUndefined();
    expect((await app.send('GET', DEALS, { tenant: TENANT_A, cookie: cookieOf(first) ?? '' })).status).toBe(401);
  });

  it('AUTH-05 turning the second factor off brings the refusal back', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    const enabled = await app.enableTotp(cookie);
    await app.api('POST', '/two-factor/disable', { cookie: enabled.cookie, payload: { password: PASSWORD } });
    const session = await app.signIn('an@example.vn', { ip: '203.0.113.9' });
    const reply = await app.send('GET', DEALS, { cookie: cookieOf(session) ?? '', tenant: TENANT_A });
    expect([reply.status, reply.body['code']]).toEqual([403, 'AUTH_MFA_REQUIRED']);
  });

  it('AUTH-05 the principal says whether the user has a second factor', async () => {
    const { app, cookie } = await world(open);
    const authenticator = createAuthenticator(app.auth);
    expect((await authenticator.authenticate(info(cookie)))?.mfa).toBe(false);
    const enabled = await app.enableTotp(cookie);
    expect((await authenticator.authenticate(info(enabled.cookie)))?.mfa).toBe(true);
  });

  it('AUTH-05 a user with two roles, one of them flagged, is refused until he has the second factor', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    await app.grant(id, ['crm.deal.create'], TENANT_A, { requireMfa: true });
    expect((await app.send('GET', DEALS, { cookie, tenant: TENANT_A })).body['code']).toBe('AUTH_MFA_REQUIRED');
  });
});
