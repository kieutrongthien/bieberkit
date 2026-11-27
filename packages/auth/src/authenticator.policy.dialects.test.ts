/**
 * BieberKit
 *
 * @file        packages/auth/src/authenticator.policy.dialects.test.ts
 * @description Tests that the authenticator enforces the security policies of sessions, MFA and networks on three dialects (POL-01 to POL-03).
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
import { auditNetworkDenied, createAuthenticator } from './authenticator.ts';
import { DEFAULT_POLICY } from './policy.ts';
import { restrictedRoleLookup } from './roles.ts';
import type { PolicyReader, SecurityPolicy } from './policy.ts';
import { authServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const info = (cookie: string, ip = '127.0.0.1') => ({
  method: 'GET',
  path: '/api/v1/crm/deals',
  headers: { cookie },
  ip,
});

const reader = (patch: Partial<SecurityPolicy>): PolicyReader => ({
  read: () => Promise.resolve({ ...DEFAULT_POLICY, ...patch }),
});

const HOUR = 3_600_000;
/** A clock that runs `ms` ahead of the real time. */
const ahead = (ms: number) => () => new Date(Date.now() + ms);

describeDialects('POL the authenticator enforces the policies', ({ open }) => {
  it('POL-01 the default policy changes nothing, and asks no extra question of the database', async () => {
    const app = await authServer(open);
    const { id, cookie } = await app.login('an@example.vn');
    const plain = await createAuthenticator(app.auth).authenticate(info(cookie));
    const withDefault = await createAuthenticator(app.auth, { policy: reader({}) }).authenticate(info(cookie));
    expect(withDefault).toEqual(plain);
    expect(withDefault?.id).toBe(id);
  });

  it('POL-01 a session older than absolute-hours is refused with AUTH_SESSION_EXPIRED (401)', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const policy = reader({ session: { ...DEFAULT_POLICY.session, absoluteHours: 8 } });
    const authenticator = createAuthenticator(app.auth, { policy, clock: ahead(9 * HOUR) });
    await expect(authenticator.authenticate(info(cookie))).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
      status: 401,
    });
    expect(
      (await createAuthenticator(app.auth, { policy, clock: ahead(7 * HOUR) }).authenticate(info(cookie)))?.kind,
    ).toBe('user');
  });

  it('POL-01 an idle session is refused, and a request inside the window keeps it alive', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const policy = reader({ session: { ...DEFAULT_POLICY.session, idleMinutes: 30 } });
    let now = Date.now();
    const authenticator = createAuthenticator(app.auth, { policy, clock: () => new Date(now) });
    now += 20 * 60_000;
    expect((await authenticator.authenticate(info(cookie)))?.kind).toBe('user');
    now += 20 * 60_000;
    expect((await authenticator.authenticate(info(cookie)))?.kind).toBe('user');
    now += 31 * 60_000;
    await expect(authenticator.authenticate(info(cookie))).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });
  });

  it('POL-02 a user in grace signs in and sees mfaEnrolBy, and after the grace is refused with AUTH_MFA_ENROL_REQUIRED', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const policy = reader({ mfa: { requiredForAll: true, graceDays: 7, since: null } });
    const principal = await createAuthenticator(app.auth, { policy }).authenticate(info(cookie));
    expect(principal?.mfa).toBe(false);
    expect(principal?.mfaEnrolBy).toBeTypeOf('string');
    await expect(
      createAuthenticator(app.auth, { policy, clock: ahead(8 * 24 * HOUR) }).authenticate(info(cookie)),
    ).rejects.toMatchObject({ code: 'AUTH_MFA_ENROL_REQUIRED', status: 403 });
  });

  it('POL-02 a user with a second factor is not asked, even with no grace', async () => {
    const app = await authServer(open, { totp: true });
    const first = await app.login('an@example.vn');
    const { cookie } = await app.enableTotp(first.cookie);
    const policy = reader({ mfa: { requiredForAll: true, graceDays: 0, since: null } });
    const principal = await createAuthenticator(app.auth, { policy }).authenticate(info(cookie));
    expect(principal).toMatchObject({ id: first.id, mfa: true });
    expect(principal?.mfaEnrolBy).toBeUndefined();
  });

  it('POL-03 a restricted user outside the allowlist is refused with AUTH_NETWORK_DENIED (403) and is audited', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const denied: string[] = [];
    const authenticator = createAuthenticator(app.auth, {
      policy: reader({ network: { adminAllowlist: ['10.0.0.0/8'] } }),
      restricted: () => Promise.resolve(true),
      onDenied: (event) => void denied.push(event.ip),
    });
    expect((await authenticator.authenticate(info(cookie, '10.1.2.3')))?.kind).toBe('user');
    await expect(authenticator.authenticate(info(cookie, '203.0.113.5'))).rejects.toMatchObject({
      code: 'AUTH_NETWORK_DENIED',
      status: 403,
    });
    expect(denied).toEqual(['203.0.113.5']);
  });

  it('POL-03 fails closed when the client address is unknown, and does not limit a user who is not restricted', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const policy = reader({ network: { adminAllowlist: ['10.0.0.0/8'] } });
    const restricted = createAuthenticator(app.auth, { policy, restricted: () => Promise.resolve(true) });
    await expect(restricted.authenticate(info(cookie, ''))).rejects.toMatchObject({ code: 'AUTH_NETWORK_DENIED' });
    const free = createAuthenticator(app.auth, { policy, restricted: () => Promise.resolve(false) });
    expect((await free.authenticate(info(cookie, '203.0.113.5')))?.kind).toBe('user');
  });

  it('POL-03 an empty allowlist limits nobody, even a restricted role', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const authenticator = createAuthenticator(app.auth, {
      policy: reader({}),
      restricted: () => Promise.resolve(true),
    });
    expect((await authenticator.authenticate(info(cookie, '203.0.113.5')))?.kind).toBe('user');
  });

  it('POL-03 with a real role: only a user of an ipRestricted role is limited, and the refusal is audited with the address', async () => {
    const app = await authServer(open);
    const free = await app.login('free@example.vn');
    const office = await app.login('office@example.vn');
    await app.grant(free.id, ['crm.deals.read']);
    await app.grant(office.id, ['crm.deals.read'], undefined, { ipRestricted: true });
    const authenticator = createAuthenticator(app.auth, {
      policy: reader({ network: { adminAllowlist: ['10.0.0.0/8'] } }),
      restricted: restrictedRoleLookup(app.db),
      onDenied: auditNetworkDenied(app.db),
    });
    expect((await authenticator.authenticate(info(free.cookie, '203.0.113.5')))?.id).toBe(free.id);
    expect((await authenticator.authenticate(info(office.cookie, '10.9.9.9')))?.id).toBe(office.id);
    await expect(authenticator.authenticate(info(office.cookie, '203.0.113.5'))).rejects.toMatchObject({
      code: 'AUTH_NETWORK_DENIED',
    });
    const denied = (await app.audit()).filter((entry) => entry.action === 'auth.network.denied');
    expect(denied).toEqual([{ action: 'auth.network.denied', actorId: office.id, data: { ip: '203.0.113.5' } }]);
  });
});
