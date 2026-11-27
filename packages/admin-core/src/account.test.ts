/**
 * BieberKit
 *
 * @file        packages/admin-core/src/account.test.ts
 * @description Tests of what the account screens ask of the API and of their rules: the sign in with a second factor, the password links, the factor, the sessions, the own profile and the sentences for a refusal (UI-26, AUTH-04, AUTH-05, USR-12, UI-21).
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
import {
  authMessageKey,
  enrolmentNeeded,
  normalizeCode,
  passwordIsShort,
  passwordProblem,
  resetSearchOf,
  secretOfUri,
  stepExpired,
} from './account.ts';
import { AdminApiError, createAdminClient } from './client.ts';
import type { AdminClient } from './client.ts';
import { routeShape } from './reporting.ts';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A client whose API answers by the path of the call, and what was asked of it. */
function api(answers: Readonly<Record<string, () => Response>> = {}): { client: AdminClient; calls: Call[] } {
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
  return { client: createAdminClient({ fetch: fetcher }), calls };
}

const USER = { id: 'u1', email: 'an@example.vn', name: 'An' };

describe('UI-26 the sign in', () => {
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

  it('UI-26 the address of the reset page gives the token, the kind of link and whether it is spent', () => {
    expect(resetSearchOf('?token=tok-1')).toEqual({ token: 'tok-1', invite: false, invalid: false });
    expect(resetSearchOf('?invite=1&token=tok-1')).toEqual({ token: 'tok-1', invite: true, invalid: false });
    expect(resetSearchOf('?error=INVALID_TOKEN')).toEqual({ invite: false, invalid: true });
    expect(resetSearchOf('?invite=1&error=INVALID_TOKEN')).toEqual({ invite: true, invalid: true });
    expect(resetSearchOf('')).toEqual({ invite: false, invalid: true });
    expect(resetSearchOf('?token=')).toEqual({ invite: false, invalid: true });
  });

  it('UI-21 a report of an error on the reset page carries no token', () => {
    expect(routeShape('/reset-password?token=tok-1&invite=1')).toBe('/reset-password');
  });
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

  it('AUTH-05 the secret that a person may type is the one of the address for the app', () => {
    expect(secretOfUri('otpauth://totp/demo:an%40example.vn?secret=JBSWY3DPEHPK3PXP&issuer=demo')).toBe(
      'JBSWY3DPEHPK3PXP',
    );
    expect(secretOfUri('not an address')).toBe('');
  });

  it('UI-26 the sessions come with this one marked', async () => {
    const entry = (id: string) => ({
      id,
      token: `t-${id}`,
      userAgent: 'Firefox',
      ipAddress: '203.0.113.1',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });
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

describe('UI-26 the rules of the screens', () => {
  it('UI-26 a code of six digits is sent without the spaces that an app shows', () => {
    expect(normalizeCode(' 123 456 ', 'totp')).toBe('123456');
    expect(normalizeCode(' ab12C-de34f ', 'backup')).toBe('ab12C-de34f');
  });

  it('AUTH-04 a password has 8 to 128 characters, counted as the server counts them, spaces included', () => {
    expect(passwordProblem('a'.repeat(7))).toBe('tooShort');
    expect(passwordProblem('a'.repeat(8))).toBeUndefined();
    expect(passwordProblem('a'.repeat(128))).toBeUndefined();
    expect(passwordProblem('a'.repeat(129))).toBe('tooLong');
    expect(passwordProblem('  abcdef')).toBeUndefined();
  });

  it('AUTH-04 under 15 characters the screen advises a longer one, and asks for no kind of character', () => {
    expect(passwordIsShort('a'.repeat(14))).toBe(true);
    expect(passwordIsShort('a'.repeat(15))).toBe(false);
  });

  const refusal = (code: string, status = 400): AdminApiError => new AdminApiError(status, code, 'English text', '');

  it('AUTH-05 the two codes that ask for a second factor open the screen that sets it up', () => {
    expect(enrolmentNeeded(refusal('AUTH_MFA_REQUIRED', 403))).toBe(true);
    expect(enrolmentNeeded(refusal('AUTH_MFA_ENROL_REQUIRED', 403))).toBe(true);
    expect(enrolmentNeeded(refusal('HTTP_FORBIDDEN', 403))).toBe(false);
    expect(enrolmentNeeded(new Error('AUTH_MFA_REQUIRED'))).toBe(false);
    expect(enrolmentNeeded(undefined)).toBe(false);
  });

  it('AUTH-05 a code step that expired, or that took too many tries, sends the person back to the password', () => {
    expect(stepExpired(refusal('INVALID_TWO_FACTOR_COOKIE', 401))).toBe(true);
    expect(stepExpired(refusal('TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE'))).toBe(true);
    expect(stepExpired(refusal('INVALID_CODE', 401))).toBe(false);
  });

  it('UI-05 each refusal that the screens know has a sentence in the language of the person', () => {
    const known = {
      INVALID_EMAIL_OR_PASSWORD: 'auth.error.credentials',
      INVALID_CODE: 'auth.error.code',
      INVALID_BACKUP_CODE: 'auth.error.backupCode',
      INVALID_PASSWORD: 'auth.error.currentPassword',
      INVALID_TOKEN: 'auth.error.link',
      AUTH_USER_DISABLED: 'auth.error.disabled',
      AUTH_NETWORK_DENIED: 'auth.error.network',
      ACCOUNT_TEMPORARILY_LOCKED: 'auth.error.locked',
      INVALID_TWO_FACTOR_COOKIE: 'auth.error.stepExpired',
      TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'auth.error.stepExpired',
    };
    for (const [code, key] of Object.entries(known)) expect(authMessageKey(refusal(code))).toBe(key);
    expect(authMessageKey(refusal('HTTP_429', 429))).toBe('auth.error.tooMany');
    expect(authMessageKey(refusal('SOMETHING_ELSE'))).toBeUndefined();
  });

  it('AUTH-06 a refusal for too many tries carries how long to wait', async () => {
    for (const header of ['retry-after', 'x-retry-after']) {
      const { client } = api({
        '/api/auth/sign-in/email': () => json({ message: 'Too many requests.' }, 429, { [header]: '42' }),
      });
      await expect(client.signIn('an@example.vn', 'pw')).rejects.toMatchObject({ status: 429, retryAfter: 42 });
    }
  });
});
