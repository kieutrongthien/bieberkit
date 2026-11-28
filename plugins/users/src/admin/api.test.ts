/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/api.test.ts
 * @description The calls of the account screens against the routes of Better Auth and of the users plugin (UI-26, USR-10, USR-12, AUTH-05).
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

import { createAdminClient } from '@bieberkit/admin-core';
import { describe, expect, it } from 'vitest';
import { accountApi } from './api.ts';
import type { AccountApi } from './api.ts';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A client whose API answers by the path of the call, and what was asked of it. */
function api(answers: Readonly<Record<string, () => Response>> = {}): { client: AccountApi; calls: Call[] } {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({
      method: init?.method ?? 'GET',
      path,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return (answers[path] ?? (() => json({})))();
  };
  return { client: accountApi(createAdminClient({ fetch: fetcher })), calls };
}

const USER = { id: 'u1', email: 'an@example.vn', name: 'An' };

describe('UI-26 the sign in', () => {
  it('UI-26 the sign in sends the email and the password', async () => {
    const { client, calls } = api({ '/api/auth/sign-in/email': () => json({ user: USER }) });
    expect(await client.signIn('an@example.vn', 'secret')).toMatchObject({ kind: 'signedIn', user: { id: 'u1' } });
    expect(calls).toEqual([
      { method: 'POST', path: '/api/auth/sign-in/email', body: { email: 'an@example.vn', password: 'secret' } },
    ]);
  });

  it('UI-26 a right password of an account without a second factor signs in', async () => {
    const { client } = api({ '/api/auth/sign-in/email': () => json({ user: USER }) });
    expect(await client.signIn('an@example.vn', 'password-1')).toEqual({ kind: 'signedIn', user: USER });
  });

  it('AUTH-05 a right password of an account with a second factor asks for the code, and is not an error', async () => {
    const { client } = api({
      '/api/auth/sign-in/email': () => json({ twoFactorRedirect: true, twoFactorMethods: ['totp'] }),
    });
    expect(await client.signIn('an@example.vn', 'password-1')).toEqual({ kind: 'secondFactor' });
  });

  it('UI-26 the code goes to the route of its kind, and never asks to trust the device', async () => {
    const { client, calls } = api({
      '/api/auth/two-factor/verify-totp': () => json({ user: USER }),
      '/api/auth/two-factor/verify-backup-code': () => json({ user: USER }),
    });
    expect(await client.verifySecondFactor('123456', 'totp')).toEqual(USER);
    expect(await client.verifySecondFactor('ab12c-De34f', 'backup')).toEqual(USER);
    expect(calls).toEqual([
      { method: 'POST', path: '/api/auth/two-factor/verify-totp', body: { code: '123456' } },
      { method: 'POST', path: '/api/auth/two-factor/verify-backup-code', body: { code: 'ab12c-De34f' } },
    ]);
  });
});

describe('UI-26 the password links', () => {
  it('USR-10 a forgotten password asks for a link that comes back to the page that is given', async () => {
    const { client, calls } = api();
    await client.requestPasswordReset('an@example.vn', 'https://app.test/admin/reset-password');
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/auth/request-password-reset',
        body: { email: 'an@example.vn', redirectTo: 'https://app.test/admin/reset-password' },
      },
    ]);
  });

  it('USR-10 the new password goes with the token of the link', async () => {
    const { client, calls } = api();
    await client.resetPassword('tok-1', '  spaces stay  ');
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/auth/reset-password',
        body: { token: 'tok-1', newPassword: '  spaces stay  ' },
      },
    ]);
  });
});

/** One session as Better Auth lists it. */
const entry = (id: string) => ({
  id,
  token: `t-${id}`,
  userAgent: 'Firefox',
  ipAddress: '203.0.113.1',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
});

describe('UI-26 the own account', () => {
  it('UI-26 changing the password sends the current one, and says whether to end the other sessions', async () => {
    const { client, calls } = api();
    await client.changePassword({ current: 'old-password', next: 'new-password', signOutOthers: true });
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/auth/change-password',
        body: { currentPassword: 'old-password', newPassword: 'new-password', revokeOtherSessions: true },
      },
    ]);
  });

  it('IDN-02 an account has a password only when it has a credential account', async () => {
    const withOne = api({ '/api/auth/list-accounts': () => json([{ providerId: 'credential' }]) });
    expect(await withOne.client.hasPassword()).toBe(true);
    const provider = api({ '/api/auth/list-accounts': () => json([{ providerId: 'corp-sso' }]) });
    expect(await provider.client.hasPassword()).toBe(false);
  });

  it('AUTH-05 turning the factor on, off and renewing the codes each send the password', async () => {
    const codes = ['aaaaa-11111', 'bbbbb-22222'];
    const { client, calls } = api({
      '/api/auth/two-factor/enable': () => json({ totpURI: 'otpauth://totp/x?secret=ABC', backupCodes: codes }),
      '/api/auth/two-factor/generate-backup-codes': () => json({ status: true, backupCodes: codes }),
    });
    expect(await client.enableTotp('pw')).toEqual({ uri: 'otpauth://totp/x?secret=ABC', backupCodes: codes });
    await client.disableTotp('pw');
    expect(await client.renewBackupCodes('pw')).toEqual(codes);
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/auth/two-factor/enable', { password: 'pw' }],
      ['POST', '/api/auth/two-factor/disable', { password: 'pw' }],
      ['POST', '/api/auth/two-factor/generate-backup-codes', { password: 'pw' }],
    ]);
  });

  it('UI-26 the sessions come with this one marked', async () => {
    const { client } = api({
      '/api/auth/list-sessions': () => json([entry('s1'), entry('s2')]),
      '/api/auth/get-session': () => json({ user: USER, session: { id: 's2', token: 't-s2' } }),
    });
    expect(await client.sessions()).toEqual([
      {
        token: 't-s1',
        userAgent: 'Firefox',
        ip: '203.0.113.1',
        createdAt: '2026-11-01T00:00:00.000Z',
        lastUsedAt: '2026-11-02T00:00:00.000Z',
        current: false,
      },
      expect.objectContaining({ token: 't-s2', current: true }),
    ]);
  });

  it('UI-26 one session is ended by its token, or all the others', async () => {
    const { client, calls } = api();
    await client.revokeSession('t-s1');
    await client.revokeOtherSessions();
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/auth/revoke-session', { token: 't-s1' }],
      ['POST', '/api/auth/revoke-other-sessions', {}],
    ]);
  });

  it('USR-12 the own profile is read and renamed on the routes of the users plugin', async () => {
    const row = {
      id: 'u1',
      name: 'An',
      email: 'an@example.vn',
      mfaEnabled: false,
      mfaRequired: true,
      mfaEnrolBy: '2026-12-01T00:00:00.000Z',
      roles: [],
    };
    const { client, calls } = api({ '/api/v1/users/me': () => json(row) });
    expect(await client.me()).toEqual({
      id: 'u1',
      name: 'An',
      email: 'an@example.vn',
      mfaEnabled: false,
      mfaRequired: true,
      mfaEnrolBy: '2026-12-01T00:00:00.000Z',
    });
    await client.renameMe('An Nguyen');
    expect(calls.at(-1)).toEqual({ method: 'PATCH', path: '/api/v1/users/me', body: { name: 'An Nguyen' } });
  });

  it('USR-12 without the users plugin there is no profile, and any other failure stays a failure', async () => {
    const absent = api({ '/api/v1/users/me': () => json({ code: 'HTTP_NOT_FOUND' }, 404) });
    expect(await absent.client.me()).toBeUndefined();
    const broken = api({ '/api/v1/users/me': () => json({ code: 'HTTP_INTERNAL' }, 500) });
    await expect(broken.client.me()).rejects.toMatchObject({ status: 500 });
  });
});

describe('AUTH-06 the limit of tries', () => {
  it('AUTH-06 a refusal for too many tries carries how long to wait', async () => {
    for (const header of ['retry-after', 'x-retry-after']) {
      const { client } = api({
        '/api/auth/sign-in/email': () => json({ message: 'Too many requests.' }, 429, { [header]: '42' }),
      });
      await expect(client.signIn('an@example.vn', 'pw')).rejects.toMatchObject({ status: 429, retryAfter: 42 });
    }
  });
});
