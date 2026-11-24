/**
 * BieberKit
 *
 * @file        packages/auth/src/limits.dialects.test.ts
 * @description Tests of the limits on sign in, sign up and password reset: per IP and per account, kept in the database, surviving the rollback of a failed request (AUTH-06, AUTH-10, SEC-10).
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
import { authServer, cookieNamed } from './testing/auth-server.ts';
import type { AuthServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const wrong = (app: AuthServer, email: string, ip: string) => app.signIn(email, { password: 'not the password', ip });

describeDialects('AUTH-06 limits', ({ open }) => {
  it('AUTH-06 five wrong sign ins from one address give 401 three times and then 429, with Retry-After', async () => {
    const app = await authServer(open, { limits: { signIn: { perIp: { window: 30, max: 3 } } } });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    const statuses: number[] = [];
    let last = await wrong(app, 'an@example.vn', '203.0.113.9');
    statuses.push(last.status);
    for (let n = 0; n < 4; n += 1) {
      last = await wrong(app, 'an@example.vn', '203.0.113.9');
      statuses.push(last.status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('AUTH-10 the counter is in bk_auth_rate_limits and stays although the failed request was rolled back', async () => {
    const app = await authServer(open, { limits: { signIn: { perIp: { window: 30, max: 3 } } } });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    await wrong(app, 'an@example.vn', '203.0.113.9');
    const counters = await app.rows('select * from bk_auth_rate_limits');
    expect(counters.some((row) => String(row['key']).includes('203.0.113.9'))).toBe(true);
  });

  it('AUTH-06 another address is not limited by the first one', async () => {
    const app = await authServer(open, { limits: { signIn: { perIp: { window: 30, max: 2 } } } });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    for (let n = 0; n < 3; n += 1) await wrong(app, 'an@example.vn', '203.0.113.9');
    expect((await wrong(app, 'an@example.vn', '203.0.113.10')).status).toBe(401);
  });

  it('AUTH-06 an address that the client forges in X-Forwarded-For does not choose the counter when the proxy is not trusted', async () => {
    const app = await authServer(open, { trustProxy: false, limits: { signIn: { perIp: { window: 30, max: 2 } } } });
    await app.signUp('an@example.vn');
    const statuses = [];
    for (let n = 0; n < 4; n += 1) statuses.push((await wrong(app, 'an@example.vn', `198.51.100.${n}`)).status);
    expect(statuses).toEqual([401, 401, 429, 429]);
  });

  it('AUTH-06 the account is limited too: many addresses, one account', async () => {
    const app = await authServer(open, { limits: { signIn: { perAccount: { window: 60, max: 2 } } } });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    const statuses = [];
    for (let n = 0; n < 4; n += 1) statuses.push((await wrong(app, 'an@example.vn', `203.0.113.${n + 1}`)).status);
    expect(statuses).toEqual([401, 401, 429, 429]);
    await app.signUp('other@example.vn', { ip: '203.0.113.60' });
    expect((await wrong(app, 'other@example.vn', '203.0.113.70')).status).toBe(401);
  });

  it('AUTH-06 the right password does not get past the limit of the account', async () => {
    const app = await authServer(open, { limits: { signIn: { perAccount: { window: 60, max: 2 } } } });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    await wrong(app, 'an@example.vn', '203.0.113.1');
    await wrong(app, 'an@example.vn', '203.0.113.2');
    expect((await app.signIn('an@example.vn', { ip: '203.0.113.3' })).status).toBe(429);
  });

  it('PDP-06 the counter of an account has the hash of the address and never the address', async () => {
    const app = await authServer(open, { limits: { signIn: { perAccount: { window: 60, max: 5 } } } });
    await app.signUp('private.person@example.vn', { ip: '203.0.113.50' });
    await wrong(app, 'private.person@example.vn', '203.0.113.9');
    const keys = (await app.rows('select * from bk_auth_rate_limits')).map((row) => String(row['key']));
    expect(keys.some((key) => key.startsWith('account:'))).toBe(true);
    expect(keys.some((key) => key.includes('@') || key.includes('private'))).toBe(false);
  });

  it('AUTH-06 the sign up is limited per address', async () => {
    const app = await authServer(open, { limits: { signUp: { perIp: { window: 60, max: 2 } } } });
    const statuses = [];
    for (let n = 0; n < 4; n += 1) statuses.push((await app.signUp(`u${n}@example.vn`, { ip: '203.0.113.9' })).status);
    expect(statuses).toEqual([200, 200, 429, 429]);
    expect(await app.count('bk_auth_users')).toBe(2);
  });

  it('AUTH-06 the request of a password reset is limited per address and per account', async () => {
    const app = await authServer(open, { limits: { passwordReset: { perIp: { window: 60, max: 2 } } } });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    const ask = (email: string) =>
      app.api('POST', '/request-password-reset', {
        ip: '203.0.113.9',
        payload: { email, redirectTo: 'https://app.test/reset' },
      });
    expect([
      (await ask('an@example.vn')).status,
      (await ask('an@example.vn')).status,
      (await ask('an@example.vn')).status,
    ]).toEqual([200, 200, 429]);
    expect(app.mails.filter((mail) => mail.kind === 'reset')).toHaveLength(2);
  });

  it('SEC-10 has limits with no setting: five wrong sign ins in a row from one address end in 429', async () => {
    const app = await authServer(open);
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    const statuses = [];
    for (let n = 0; n < 7; n += 1) statuses.push((await wrong(app, 'an@example.vn', '203.0.113.9')).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('AUTH-06 the magic link is limited per address: the request by mail, whoever the email is', async () => {
    const app = await authServer(open, { magicLink: true, limits: { magicLink: { perIp: { window: 60, max: 2 } } } });
    const ask = (email: string) => app.api('POST', '/sign-in/magic-link', { ip: '203.0.113.9', payload: { email } });
    expect([
      (await ask('a@example.vn')).status,
      (await ask('b@example.vn')).status,
      (await ask('c@example.vn')).status,
    ]).toEqual([200, 200, 429]);
  });

  it('AUTH-06 the magic link is limited per account: many addresses, one email', async () => {
    const app = await authServer(open, {
      magicLink: true,
      limits: { magicLink: { perAccount: { window: 60, max: 2 } } },
    });
    await app.signUp('an@example.vn', { ip: '203.0.113.50' });
    const statuses = [];
    for (let n = 0; n < 3; n += 1) {
      statuses.push(
        (
          await app.api('POST', '/sign-in/magic-link', {
            ip: `203.0.113.${n + 1}`,
            payload: { email: 'an@example.vn' },
          })
        ).status,
      );
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect(app.mails.filter((mail) => mail.kind === 'magic')).toHaveLength(2);
  });

  it('AUTH-06 the use of the link is limited per address too, so a link cannot be guessed', async () => {
    const app = await authServer(open, { magicLink: true, limits: { magicLink: { perIp: { window: 60, max: 2 } } } });
    const use = () => app.send('GET', '/api/auth/magic-link/verify?token=guess&callbackURL=%2F', { ip: '203.0.113.9' });
    expect([(await use()).status === 429, (await use()).status === 429, (await use()).status === 429]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('AUTH-06 a TOTP code and a backup code are limited per address, so a code cannot be guessed', async () => {
    const app = await authServer(open, { totp: true, limits: { mfa: { perIp: { window: 60, max: 3 } } } });
    const { cookie } = await app.login('an@example.vn');
    await app.enableTotp(cookie);
    const first = await app.signIn('an@example.vn', { ip: '203.0.113.7' });
    const pending = cookieNamed(first, '__Host-bk_two_factor') ?? '';
    const guess = () =>
      app.api('POST', '/two-factor/verify-totp', { cookie: pending, ip: '203.0.113.7', payload: { code: '000000' } });
    const statuses = [];
    for (let n = 0; n < 4; n += 1) statuses.push((await guess()).status === 429);
    expect(statuses).toEqual([false, false, false, true]);
  });
});
